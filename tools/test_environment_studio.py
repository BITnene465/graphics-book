"""环境章节的真实像素、空间参数与探针契约。"""

from pathlib import Path
import sys
import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_render as studio
from tools.test_studio_render import png_pixels


class EnvironmentStudioTests(unittest.TestCase):
    def test_pixel_probe_tracks_world_reflection_and_rotated_texture_address(self):
        for mode in ("analytic", "latlong", "cube"):
            result = studio.render(
                "14",
                dict(
                    size=64, mapping=mode, env_angle=35, sphere_position=[0.2, -0.1, 0]
                ),
            )
            p = result["probe"]
            self.assertTrue(p["hit"])
            normal, incident = np.array(p["normal"]), np.array(p["incident"])
            assert_allclose(np.array(p["world"]) - [0.2, -0.1, 0], normal, atol=1e-12)
            reflected = incident - 2 * (incident @ normal) * normal
            assert_allclose(p["reflected"], reflected, atol=1e-12)
            self.assertAlmostEqual(np.linalg.norm(reflected), 1)
            theta = np.deg2rad(35)
            x, y, z = reflected
            local = [
                np.cos(theta) * x - np.sin(theta) * z,
                y,
                np.sin(theta) * x + np.cos(theta) * z,
            ]
            assert_allclose(p["lookup_direction"], local, atol=1e-12)
            expected_uv = [
                np.arctan2(local[2], local[0]) / (2 * np.pi) % 1,
                np.arccos(np.clip(local[1], -1, 1)) / np.pi,
            ]
            assert_allclose(p["environment_uv"], expected_uv, atol=1e-12)
            encoded = np.rint(
                studio._core("01").linear_to_srgb(p["linear"]) * 255
            ).astype(np.uint8)
            assert_array_equal(
                png_pixels(result["images"][0])[p["row"], p["col"]], encoded
            )

    def test_joint_translation_preserves_infinite_environment_image(self):
        first = studio.render("14", dict(size=64, mapping="cube"))
        moved = studio.render(
            "14",
            dict(
                size=64,
                mapping="cube",
                sphere_position=[2, -0.5, 1],
                camera_target=[2, -0.5, 1],
            ),
        )
        assert_array_equal(
            png_pixels(first["images"][0]), png_pixels(moved["images"][0])
        )
        assert_allclose(
            np.array(moved["probe"]["world"]) - first["probe"]["world"], [2, -0.5, 1]
        )
        objects = {obj["id"]: obj for obj in moved["geometry"]["objects"]}
        self.assertTrue(objects["mirror-sphere"]["edit"]["translate"])
        self.assertTrue(objects["mirror-sphere"]["edit"]["scale"])
        self.assertFalse(objects["mirror-sphere"]["edit"]["rotate"])
        self.assertTrue(objects["camera"]["edit"]["translate"])
        self.assertTrue(objects["camera"]["edit"]["rotate"])

    def test_background_probe_and_preview_keep_the_same_meaning(self):
        result = studio.render("14", dict(size=512, preview=True, probe=[0, 0]))
        self.assertEqual(result["images"][0]["width"], 160)
        self.assertFalse(result["probe"]["hit"])
        self.assertIsNone(result["probe"]["world"])
        self.assertIsNone(result["probe"]["normal"])
        self.assertIsNone(result["probe"]["reflected"])
        assert_allclose(
            result["probe"]["lookup_direction"], result["probe"]["incident"]
        )
        self.assertTrue(np.isfinite(result["probe"]["linear"]).all())


if __name__ == "__main__":
    unittest.main()
