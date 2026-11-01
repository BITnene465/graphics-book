"""用解析平面和可复算像素验证着色频率；不把三张看起来不同的图当作证明。"""

import unittest
from unittest.mock import patch

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

import mesh_shading as mesh


class MeshShadingTests(unittest.TestCase):
    def plane(self, normals=None, **options):
        vertices = np.array([[-1.0, -1.0, 0.0], [1.0, -1.0, 0.0], [0.0, 1.0, 0.0]])
        normals = np.tile([0.0, 0.0, 1.0], (3, 1)) if normals is None else normals
        settings = dict(
            size=9,
            extent=1.5,
            light=[0, 0, 1],
            point_light=False,
            power=1,
            kd=[1, 1, 1],
            ks=0,
            ambient=0,
        )
        settings.update(options)
        return mesh.rasterize_mesh(vertices, [[0, 1, 2]], normals, **settings)

    def test_constant_normal_directional_light_all_methods_equal(self):
        frame = self.plane(light=[0.6, 0, 0.8], ks=0.3, exponent=16, ambient=0.02)
        mask = frame["owner"] >= 0
        expected = 0.8 + 0.3 * 0.9**8 + 0.02
        for name, image in frame["images"].items():
            with self.subTest(name=name):
                assert_allclose(image[mask], expected, atol=1e-13)
                assert_allclose(
                    image[~mask], np.broadcast_to(mesh.BACKGROUND, image[~mask].shape)
                )

    def test_center_pixel_interpolation_by_hand(self):
        frame = self.plane([[0.6, 0, 0.8], [-0.6, 0, 0.8], [0, 0.6, 0.8]])
        probe = mesh.sample_probe(frame, 4, 4)
        assert_allclose(probe["weights"], [0.25, 0.25, 0.5])
        assert_allclose(probe["world"], [0, 0, 0])
        assert_allclose(probe["interpolated_normal"], [0, 0.3, 0.8])
        self.assertAlmostEqual(probe["interpolated_length"], np.sqrt(0.73))
        assert_allclose(probe["normal"], np.array([0, 0.3, 0.8]) / np.sqrt(0.73))
        assert_allclose(probe["colors"]["flat"], [1, 1, 1])
        assert_allclose(probe["colors"]["gouraud"], [0.8, 0.8, 0.8])
        assert_allclose(probe["colors"]["phong"], np.full(3, 0.8 / np.sqrt(0.73)))
        # 负面反例：忘掉重新归一化会把 Phong 错算成 0.8，恰好掩盖方法差异。
        self.assertGreater(probe["colors"]["phong"][0] - 0.8, 0.13)

    def test_narrow_highlight_between_vertices_is_missed_by_gouraud(self):
        frame = self.plane(
            [[-0.8, 0, 0.6], [0.8, 0, 0.6], [0, 0.8, 0.6]],
            size=161,
            kd=[0, 0, 0],
            ks=1,
            exponent=64,
        )
        self.assertLess(frame["images"]["gouraud"][frame["owner"] >= 0].max(), 1e-12)
        self.assertGreater(frame["images"]["phong"].max(), 0.9)
        # 高光不是凭空增加一个光源；三个方法用同一个方向和相同的 ks、指数。
        assert_allclose(frame["vertex_colors"], 0.6**64, rtol=1e-12)

    def test_mesh_coverage_and_silhouette_are_identical_in_three_images(self):
        frame = mesh.render_mesh(size=65, latitude=5, ks=0.1, ambient=0.1)
        expected = frame["owner"] >= 0
        self.assertTrue(expected.any())
        for image in frame["images"].values():
            assert_array_equal(np.any(image != mesh.BACKGROUND, axis=-1), expected)
        self.assertGreater(
            np.abs(frame["images"]["flat"] - frame["images"]["phong"]).max(), 0.1
        )

    def test_constant_ambient_is_independent_of_frequency(self):
        frame = mesh.render_mesh(
            size=47, latitude=5, power=0, ambient=0.2, kd=[0.5, 0.2, 0.8]
        )
        for image in frame["images"].values():
            assert_allclose(
                image[frame["owner"] >= 0],
                np.tile([0.1, 0.04, 0.16], (np.count_nonzero(frame["owner"] >= 0), 1)),
            )

    def test_nonuniform_axes_use_inverse_transpose_not_radial_normals(self):
        scale = np.array([2.0, 0.8, 0.5])
        center = np.array([0.3, -0.2, 0.4])
        frame = mesh.render_mesh(size=41, scale=scale, center=center, latitude=4)
        local = (frame["vertices"] - center) / scale
        expected = mesh.lighting.normalize(local / scale)
        assert_allclose(frame["vertex_normals"], expected, atol=1e-14)
        wrong = mesh.lighting.normalize(local * scale)
        self.assertGreater(np.linalg.norm(expected - wrong, axis=1).max(), 0.9)
        visible = frame["owner"] >= 0
        assert_allclose(np.linalg.norm(frame["normal"][visible], axis=1), 1, atol=1e-14)

    def test_clipping_keeps_original_triangle_weights_and_world_position(self):
        frame = mesh.render_mesh(size=49, center=[1.7, 0.3, 0], latitude=5, extent=1.2)
        mask = frame["owner"] >= 0
        self.assertTrue(mask.any())
        weights = frame["weights"][mask]
        self.assertGreaterEqual(weights.min(), -1e-12)
        assert_allclose(weights.sum(axis=1), 1, atol=1e-14)
        indices = frame["faces"][frame["owner"][mask]]
        assert_allclose(
            frame["world"][mask],
            np.einsum("ni,nij->nj", weights, frame["vertices"][indices]),
        )
        rows, cols = np.nonzero(mask)
        expected_xy = np.column_stack(
            [(cols + 0.5) / 49 * 2.4 - 1.2, 1.2 - (rows + 0.5) / 49 * 2.4]
        )
        # 04 使用 1/256 像素的坐标量化；插值误差不能超出一个子像素。
        assert_allclose(frame["world"][mask, :2], expected_xy, atol=2.4 / 49 / 256)

    def test_reported_evaluations_are_actual_shade_sample_counts(self):
        calls = []
        original = mesh.lighting.shade

        def counted(normals, *args, **kwargs):
            calls.append(len(normals))
            return original(normals, *args, **kwargs)

        with patch.object(mesh.lighting, "shade", side_effect=counted):
            frame = mesh.render_mesh(size=31, latitude=4)
        self.assertEqual(
            calls, [frame["evaluations"][name] for name in ("flat", "gouraud", "phong")]
        )
        self.assertEqual(calls, [48, 26, int(np.count_nonzero(frame["owner"] >= 0))])

    def test_point_light_position_changes_all_methods(self):
        a = mesh.render_mesh(size=49, latitude=5, light=[-3, 4, 5])
        b = mesh.render_mesh(size=49, latitude=5, light=[3, 4, 5])
        assert_array_equal(a["owner"], b["owner"])
        for name in a["images"]:
            self.assertGreater(np.abs(a["images"][name] - b["images"][name]).max(), 0.1)

    def test_background_and_offscreen_mesh_have_no_fake_probe(self):
        frame = mesh.render_mesh(size=25, center=[10, 0, 0], latitude=3)
        self.assertEqual(frame["evaluations"]["phong"], 0)
        self.assertEqual(
            mesh.sample_probe(frame, 12, 12), dict(hit=False, row=12, col=12)
        )
        for image in frame["images"].values():
            self.assertTrue(np.isfinite(image).all())
            assert_allclose(image, np.broadcast_to(mesh.BACKGROUND, image.shape))

    def test_invalid_normals_indices_or_view_are_rejected(self):
        for kwargs in (dict(size=0), dict(extent=0), dict(extent=float("nan"))):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.plane(**kwargs)
        with self.assertRaises(ValueError):
            self.plane(np.zeros((3, 3)))
        with self.assertRaises(ValueError):
            mesh.rasterize_mesh(np.eye(3), [[0, 1, 3]], np.eye(3))
        with self.assertRaises(ValueError):
            mesh.render_mesh(scale=[1, 0, 1])


if __name__ == "__main__":
    unittest.main()
