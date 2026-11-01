"""曲面控制网 → Python 像素 → 像素探针与编辑元数据的独立检查。"""

from pathlib import Path
import json
import sys
import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_render as studio
from tools.test_studio_render import png_pixels


def plane():
    return {
        f"point_a_{i}_{j}": [-3 + i, 0, 1.5 - j] for i in range(4) for j in range(4)
    }


class SurfaceStudioTests(unittest.TestCase):
    def test_planar_pixel_has_exact_uv_position_and_differential_frame(self):
        result = studio.render("15", dict(size=64, **plane()))
        p = result["probe"]
        self.assertTrue(p["hit"])
        u, v = p["surface_uv"]
        assert_allclose(p["surface_world"], [-3 + 3 * u, 0, 1.5 - 3 * v], atol=1e-12)
        assert_allclose(p["world"], p["surface_world"], atol=1e-12)
        assert_allclose(p["partial_u"], [3, 0, 0], atol=1e-12)
        assert_allclose(p["partial_v"], [0, 0, -3], atol=1e-12)
        assert_allclose(p["normal"], [0, 1, 0], atol=1e-12)
        self.assertAlmostEqual(p["area_density"], 9)
        self.assertAlmostEqual(p["mean_curvature"], 0)
        self.assertAlmostEqual(p["gaussian_curvature"], 0)
        self.assertTrue(p["regular"])
        self.assertLess(p["tessellation_error"], 1e-12)

    def test_curved_pixel_matches_independent_polynomial_and_encoded_image(self):
        result = studio.render("15", dict(size=64, divisions=4))
        p = result["probe"]
        self.assertTrue(p["hit"])
        u, v = p["surface_uv"]
        # 四个内部控制点同为 1.8，B1+B2 = 3t(1-t)。
        assert_allclose(
            p["surface_world"],
            [-3 + 3 * u, 16.2 * u * (1 - u) * v * (1 - v), 1.5 - 3 * v],
            atol=1e-12,
        )
        du, dv = [3, 16.2 * (1 - 2 * u) * v * (1 - v), 0], [
            0,
            16.2 * u * (1 - u) * (1 - 2 * v),
            -3,
        ]
        n = np.cross(du, dv)
        assert_allclose(p["normal"], n / np.linalg.norm(n), atol=1e-12)
        self.assertGreater(p["tessellation_error"], 1e-5)
        expected = np.rint(studio._core("01").linear_to_srgb(p["linear"]) * 255).astype(
            np.uint8
        )
        assert_array_equal(
            png_pixels(result["images"][0])[p["row"], p["col"]], expected
        )
        assert_array_equal(
            png_pixels(result["images"][1])[p["row"], p["col"]],
            np.rint((np.array(p["normal"]) + 1) * 127.5).astype(np.uint8),
        )

    def test_editing_control_point_changes_geometry_and_python_pixels(self):
        first = studio.render("15", dict(size=64))
        moved = studio.render("15", dict(size=64, point_a_1_1=[-2, 2.5, 0.5]))
        self.assertNotEqual(first["images"][0]["url"], moved["images"][0]["url"])
        self.assertNotEqual(
            first["geometry"]["positions"], moved["geometry"]["positions"]
        )
        objects = {o["id"]: o for o in moved["geometry"]["objects"]}
        point = objects["control-a-1-1"]
        self.assertEqual(point["position"], [-2, 2.5, 0.5])
        self.assertEqual(point["params"]["position"], "point_a_1_1")
        self.assertTrue(point["edit"]["translate"])
        self.assertFalse(point["edit"]["rotate"])
        self.assertTrue(objects["camera"]["edit"]["translate"])
        self.assertTrue(objects["light"]["edit"]["translate"])
        self.assertEqual(len(moved["geometry"]["controlNet"]["edges"]), 24)

    def test_pair_constraint_updates_actual_points_and_lock_metadata(self):
        result = studio.render(
            "15", dict(size=64, mode="pair", continuity="C2", left_span=2, right_span=1)
        )
        objects = {o["id"]: o for o in result["geometry"]["objects"]}
        points = lambda side, i: np.array(
            [objects[f"control-{side}-{i}-{j}"]["position"] for j in range(4)]
        )
        q0, q1, q2 = points("b", 0), points("b", 1), points("b", 2)
        assert_allclose(q0, points("a", 3), atol=1e-12)
        assert_allclose(q1 - q0, 0.5 * (points("a", 3) - points("a", 2)), atol=1e-12)
        assert_allclose(
            q2 - 2 * q1 + q0,
            0.25 * (points("a", 3) - 2 * points("a", 2) + points("a", 1)),
            atol=1e-12,
        )
        for i in range(4):
            self.assertEqual(objects[f"control-b-{i}-1"]["edit"]["translate"], i == 3)
        self.assertEqual(len(result["geometry"]["controlNet"]["edges"]), 48)

    def test_preview_reduces_sampling_but_preserves_control_points_and_constraints(
        self,
    ):
        result = studio.render(
            "15",
            dict(
                size=512,
                divisions=48,
                preview=True,
                mode="pair",
                continuity="G1",
                tangent_scale=2,
            ),
        )
        self.assertEqual(result["images"][0]["width"], 160)
        self.assertEqual(result["params"]["divisions"], 12)
        objects = {o["id"]: o for o in result["geometry"]["objects"]}
        q0 = np.array(objects["control-b-0-1"]["position"])
        q1 = np.array(objects["control-b-1-1"]["position"])
        p2 = np.array(objects["control-a-2-1"]["position"])
        assert_allclose(q1 - q0, 2 * (q0 - p2), atol=1e-12)
        self.assertEqual(result["params"]["point_a_1_1"], [-2, 1.8, 0.5])

    def test_collapsed_grid_and_background_have_no_fabricated_normal(self):
        params = {f"point_a_{i}_{j}": [-1.5, 0, 0] for i in range(4) for j in range(4)}
        result = studio.render("15", dict(size=64, **params))
        self.assertFalse(result["probe"]["hit"])
        self.assertNotIn("normal", result["probe"])
        self.assertTrue(np.isfinite(result["geometry"]["normals"]).all())
        json.dumps(result, allow_nan=False)

    def test_point_validation_rejects_malformed_and_nonfinite_coordinates(self):
        for bad in ([0, 0], [0, 0, 11], [0, float("nan"), 0]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                studio.render("15", dict(size=64, point_a_0_0=bad))


if __name__ == "__main__":
    unittest.main()
