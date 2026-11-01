"""性质检查与独立的相机射线/平面交点真值。"""

import unittest
import numpy as np
from core import (
    perspective_interpolate,
    bilinear_taps,
    sample_texture,
    checker_texture,
    make_quad,
    render,
    pixel_footprint,
    build_mipmaps,
    barycentric_gradients,
    perspective_jacobian,
    footprint_metrics,
    sample_trilinear,
    sample_anisotropic,
)


def ray_plane_uv(camera, rows, cols, size):
    """独立真值：求相机射线与三维平面的交点，不使用屏幕重心插值。"""
    p = camera[0]
    eu, ev = camera[1] - p, camera[3] - p
    result = []
    for row, col in zip(rows, cols):
        ray = np.array(
            [
                (2 * (col + 0.5) / size - 1) / 1.15,
                (1 - 2 * (row + 0.5) / size) / 1.15,
                -1,
            ]
        )
        result.append(np.linalg.solve(np.column_stack([eu, ev, -ray]), -p)[:2])
    return np.array(result)


class TextureTests(unittest.TestCase):
    def test_two_point_hand_calculation(self):
        value = perspective_interpolate([0.5, 0.5], [[0], [1]], [1, 0.25])
        np.testing.assert_allclose(value, [0.2])

    def test_equal_w_and_constant_attribute(self):
        weights = np.array([[0.2, 0.3, 0.5], [1, 0, 0]])
        attrs = np.array([[0, 1], [2, 3], [4, 5]])
        np.testing.assert_allclose(
            perspective_interpolate(weights, attrs, [0.4] * 3), weights @ attrs
        )
        np.testing.assert_allclose(
            perspective_interpolate(weights, np.full((3, 2), 0.7), [1, 0.5, 0.2]), 0.7
        )

    def test_projection_of_known_surface_point(self):
        clip, uv, _ = make_quad(60, 17)
        clip, uv = clip[:3], uv[:3]
        alpha = np.array([0.2, 0.3, 0.5])
        point = alpha @ clip
        screen = clip[:, :2] / clip[:, 3, None]
        screen_point = point[:2] / point[3]
        weights = np.linalg.solve(np.vstack([screen.T, np.ones(3)]), [*screen_point, 1])
        np.testing.assert_allclose(
            perspective_interpolate(weights, uv, 1 / clip[:, 3]), alpha @ uv
        )
        # z_ndc 已是比值：屏幕线性插值正确，再套 UV 公式反而错误。
        z = clip[:, 2] / clip[:, 3]
        self.assertAlmostEqual(float(weights @ z), point[2] / point[3])
        wrong_z = perspective_interpolate(weights, z[:, None], 1 / clip[:, 3])[0]
        self.assertGreater(abs(wrong_z - point[2] / point[3]), 0.01)

    def test_texel_centers_and_y_direction(self):
        texture = np.arange(18).reshape(2, 3, 3).astype(float)
        for row in range(2):
            for col in range(3):
                uv = [(col + 0.5) / 3, 1 - (row + 0.5) / 2]
                for mode in ("nearest", "bilinear"):
                    np.testing.assert_allclose(
                        sample_texture(texture, uv, mode), texture[row, col]
                    )

    def test_four_taps_partition_and_center_average(self):
        rows, cols, weights = bilinear_taps([0.5, 0.5], 2, 2)
        np.testing.assert_array_equal(rows, [0, 0, 1, 1])
        np.testing.assert_array_equal(cols, [0, 1, 0, 1])
        np.testing.assert_allclose(weights, [0.25] * 4)
        tex = np.array([[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 1]]], float)
        np.testing.assert_allclose(sample_texture(tex, [0.5, 0.5]), [0.5] * 3)

    def test_clamp_repeats_edge_texels(self):
        tex = np.arange(12).reshape(2, 2, 3).astype(float)
        for mode in ("nearest", "bilinear"):
            np.testing.assert_allclose(sample_texture(tex, [-10, 3], mode), tex[0, 0])
            np.testing.assert_allclose(sample_texture(tex, [1, 0], mode), tex[-1, -1])
        rows, cols, weights = bilinear_taps([0, 1], 2, 2)
        np.testing.assert_array_equal(rows, 0)
        np.testing.assert_array_equal(cols, 0)
        self.assertEqual(weights.sum(), 1)

    def test_bilinear_reproduces_linear_field(self):
        x, y = np.meshgrid((np.arange(8) + 0.5) / 8, 1 - (np.arange(6) + 0.5) / 6)
        tex = np.stack([x, y, 0.2 * x + 0.3 * y], axis=-1)
        uv = np.array([[0.3, 0.4], [0.7, 0.65]])
        expected = np.column_stack([uv, 0.2 * uv[:, 0] + 0.3 * uv[:, 1]])
        np.testing.assert_allclose(sample_texture(tex, uv), expected, atol=1e-15)

    def test_render_against_independent_ray_plane_truth(self):
        result = render(60, 15, resolution=96)
        row, col = np.where(result["owner"] >= 0)
        row, col = row[::17], col[::17]
        truth = ray_plane_uv(result["camera"], row, col, 96)
        good = np.linalg.norm(result["uv_correct"][row, col] - truth, axis=1)
        bad = np.linalg.norm(result["uv_affine"][row, col] - truth, axis=1)
        self.assertLess(good.max(), 0.001)  # 包含 1/256 像素的屏幕顶点量化误差。
        self.assertGreater(bad.mean(), 0.05)
        self.assertGreater(bad.max(), 0.15)

    def test_diagonal_change_preserves_perspective_uv(self):
        a, b = render(diagonal=0), render(diagonal=1)
        mask = (a["owner"] >= 0) & (b["owner"] >= 0)
        np.testing.assert_allclose(
            a["uv_correct"][mask], b["uv_correct"][mask], atol=0.001
        )
        self.assertGreater(
            np.max(np.abs(a["uv_affine"][mask] - b["uv_affine"][mask])), 0.1
        )

    def test_front_view_methods_match_and_footprint_finite(self):
        result = render(0, 0)
        mask = result["owner"] >= 0
        np.testing.assert_allclose(
            result["uv_correct"][mask], result["uv_affine"][mask], atol=1e-15
        )
        row, col = np.argwhere(mask)[len(np.argwhere(mask)) // 2]
        piece = result["pieces"][result["owner"][row, col]]
        footprint = pixel_footprint(piece, col + 0.5, 128 - row - 0.5)
        self.assertEqual(footprint.shape, (4, 2))
        self.assertTrue(np.isfinite(footprint).all())

    def test_bad_input(self):
        with self.assertRaises(ValueError):
            perspective_interpolate([0.5, 0.5], [[0], [1]], [1, 0])
        with self.assertRaises(ValueError):
            sample_texture(checker_texture(), [np.nan, 0])
        with self.assertRaises(ValueError):
            make_quad(90)


class MipmapTests(unittest.TestCase):
    def test_box_average_hand_calculation(self):
        texture = np.arange(4 * 4 * 3).reshape(4, 4, 3).astype(float)
        chain = build_mipmaps(texture)
        self.assertEqual([level.shape[:2] for level in chain], [(4, 4), (2, 2), (1, 1)])
        np.testing.assert_allclose(chain[1][0, 0], texture[:2, :2].mean(axis=(0, 1)))
        np.testing.assert_allclose(chain[-1][0, 0], texture.mean(axis=(0, 1)))
        # mip0 is an owned copy: generating levels must not mutate the source.
        chain[0][0, 0] = 0
        self.assertEqual(texture[0, 0, 2], 2)

    def test_non_power_of_two_area_and_last_column(self):
        texture = np.zeros((3, 5, 3))
        texture[:, -1] = 1
        chain = build_mipmaps(texture)
        self.assertEqual([level.shape[:2] for level in chain], [(3, 5), (1, 2), (1, 1)])
        # Each destination column covers width 2.5, including the entire last column.
        np.testing.assert_allclose(chain[1][0, :, 0], [0, 0.4])
        np.testing.assert_allclose(chain[-1], 0.2)

    def test_constants_and_global_means_survive_every_level(self):
        rng = np.random.default_rng(103)
        for shape in ((1, 1), (7, 5), (6, 10), (1, 13), (17, 1)):
            texture = rng.random(shape + (3,))
            for level in build_mipmaps(texture):
                np.testing.assert_allclose(
                    level.mean(axis=(0, 1)), texture.mean(axis=(0, 1)), atol=1e-14
                )
            for level in build_mipmaps(
                np.broadcast_to([0.13, 0.42, 0.79], shape + (3,))
            ):
                np.testing.assert_allclose(
                    level, np.broadcast_to([0.13, 0.42, 0.79], level.shape)
                )

    def test_jacobian_against_independent_finite_difference(self):
        vertices = np.array([[4.0, 7.0], [32.0, 11.0], [19.0, 39.0]])
        texcoords = np.array([[0.1, 0.2], [0.9, 0.15], [0.8, 0.95]])
        inv_w = np.array([1.0, 0.3, 0.7])
        point = np.array([17.0, 20.0])
        matrix = np.vstack([vertices.T, np.ones(3)])

        def mapping(p):
            weights = np.linalg.solve(matrix, [*p, 1])
            return perspective_interpolate(weights, texcoords, inv_w)

        weights = np.linalg.solve(matrix, [*point, 1])
        jacobian = perspective_jacobian(weights, vertices, texcoords, inv_w)
        epsilon = 1e-4
        finite = np.column_stack(
            [
                (mapping(point + axis * epsilon) - mapping(point - axis * epsilon))
                / (2 * epsilon)
                for axis in np.eye(2)
            ]
        )
        np.testing.assert_allclose(jacobian, finite, atol=1e-11)
        np.testing.assert_allclose(
            barycentric_gradients(vertices).sum(axis=0), 0, atol=1e-15
        )

    def test_singular_values_axis_and_continuous_lod(self):
        angle = 0.41
        rotation = np.array(
            [[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]
        )
        # Texture is 128 wide, 64 high. The texel footprint axes are 16 and 2.
        jacobian = (rotation @ np.diag([16.0, 2.0])) / np.array([128, 64])[:, None]
        metrics = footprint_metrics(jacobian, (64, 128), max_anisotropy=8)
        self.assertAlmostEqual(float(metrics["major"]), 16)
        self.assertAlmostEqual(float(metrics["minor"]), 2)
        self.assertAlmostEqual(float(metrics["lod_isotropic"]), 4)
        self.assertAlmostEqual(float(metrics["lod_anisotropic"]), 1)
        self.assertEqual(int(metrics["tap_count"]), 8)
        self.assertAlmostEqual(abs(float(metrics["major_axis"] @ rotation[:, 0])), 1)
        for lod in (1.99999, 2.0, 2.00001):
            measured = footprint_metrics(np.eye(2) * 2**lod / 64, (64, 64))
            self.assertAlmostEqual(float(measured["lod_isotropic"]), lod)

    def test_trilinear_hand_blend_and_clamping(self):
        levels = [
            np.full((8 // 2**i, 8 // 2**i, 3), value)
            for i, value in enumerate((0.0, 0.2, 0.6, 1.0))
        ]
        np.testing.assert_allclose(sample_trilinear(levels, [0.37, 0.65], 1.25), 0.3)
        np.testing.assert_allclose(sample_trilinear(levels, [0.37, 0.65], -10), 0)
        np.testing.assert_allclose(sample_trilinear(levels, [0.37, 0.65], 100), 1)
        below = sample_trilinear(levels, [0.37, 0.65], 2 - 1e-7)
        above = sample_trilinear(levels, [0.37, 0.65], 2 + 1e-7)
        np.testing.assert_allclose(below, above, atol=1e-7)

    def test_anisotropic_constant_clamp_and_cap(self):
        chain = build_mipmaps(np.full((19, 31, 3), 0.42))
        uv = np.array([[0, 0], [0.5, 0.5], [1, 1], [-5, 7]])
        jacobian = np.array([[0.4, 0.1], [0.01, 0.02]])
        for cap in (1, 2, 8, 32):
            np.testing.assert_allclose(
                sample_anisotropic(chain, uv, jacobian, max_anisotropy=cap),
                0.42,
                atol=1e-14,
            )
            metrics = footprint_metrics(jacobian, chain[0].shape, max_anisotropy=cap)
            self.assertLessEqual(int(metrics["tap_count"]), cap)

    def test_isotropic_or_one_tap_matches_trilinear(self):
        chain = build_mipmaps(checker_texture(64, 13))
        uv = np.array([[0.27, 0.34], [0.7, 0.61]])
        for jacobian, cap in ((np.eye(2) * 0.08, 8), (np.diag([0.08, 0.01]), 1)):
            metrics = footprint_metrics(jacobian, (64, 64), max_anisotropy=cap)
            actual = sample_anisotropic(chain, uv, jacobian, max_anisotropy=cap)
            expected = sample_trilinear(chain, uv, metrics["lod_isotropic"])
            np.testing.assert_allclose(actual, expected, atol=1e-14)

    def test_one_tap_with_bias_matches_trilinear_in_magnification_and_minification(
        self,
    ):
        chain = build_mipmaps(checker_texture(64, 13))
        uv = np.array([[0.27, 0.34], [0.7, 0.61]])
        for major, minor in ((0.125, 0.02), (0.5, 0.1), (1.0, 0.5), (8.0, 0.5)):
            jacobian = np.diag([major, minor]) / 64
            for bias in (-3.0, 0.0, 2.0, 4.0):
                with self.subTest(major=major, minor=minor, bias=bias):
                    metrics = footprint_metrics(
                        jacobian, (64, 64), lod_bias=bias, max_anisotropy=1
                    )
                    expected_lod = max(0.0, np.log2(major) + bias)
                    self.assertAlmostEqual(
                        float(metrics["lod_isotropic"]), expected_lod
                    )
                    self.assertAlmostEqual(
                        float(metrics["lod_anisotropic"]), expected_lod
                    )
                    self.assertEqual(int(metrics["tap_count"]), 1)
                    actual = sample_anisotropic(
                        chain, uv, jacobian, lod_bias=bias, max_anisotropy=1
                    )
                    expected = sample_trilinear(chain, uv, expected_lod)
                    np.testing.assert_allclose(actual, expected, atol=1e-14)

    def test_isotropic_footprint_with_bias_degenerates_to_trilinear(self):
        chain = build_mipmaps(checker_texture(64, 13))
        uv = np.array([[0.27, 0.34], [0.7, 0.61]])
        # Especially rho=.5,bias=2: log2(.5)+2=1, not log2(max(.5,1))+2=2.
        for rho in (0.125, 0.5, 1.0, 2.0, 8.0):
            for cap in (1, 2, 8, 32):
                for bias in (-3.0, 0.0, 2.0, 4.0):
                    with self.subTest(rho=rho, cap=cap, bias=bias):
                        jacobian = np.eye(2) * rho / 64
                        metrics = footprint_metrics(
                            jacobian, (64, 64), lod_bias=bias, max_anisotropy=cap
                        )
                        lod = max(0.0, np.log2(rho) + bias)
                        self.assertAlmostEqual(float(metrics["lod_anisotropic"]), lod)
                        self.assertEqual(int(metrics["tap_count"]), 1)
                        np.testing.assert_allclose(
                            sample_anisotropic(
                                chain, uv, jacobian, lod_bias=bias, max_anisotropy=cap
                            ),
                            sample_trilinear(chain, uv, lod),
                            atol=1e-14,
                        )

    def test_high_frequency_slope_against_independent_pixel_integral(self):
        frame = render(
            70, 17, 64, "anisotropic", 96, texture_size=512, compare_filters=True
        )
        interior = np.all(
            (frame["uv_correct"] > 0.03) & (frame["uv_correct"] < 0.97), axis=-1
        )
        pixels = np.argwhere(
            (frame["owner"] >= 0) & (frame["footprint_major"] > 12) & interior
        )[::7]
        rows, cols = pixels.T
        # Independent reference: 32x32 rays per pixel meet the original 3D plane.
        # No triangle barycentric interpolation, mip chain or UV Jacobian is used.
        n = 32
        ox, oy = np.meshgrid((np.arange(n) + 0.5) / n, (np.arange(n) + 0.5) / n)
        xy = np.stack(
            [cols[:, None] + ox.ravel(), 95 - rows[:, None] + oy.ravel()], axis=-1
        )
        rays = np.concatenate(
            [(2 * xy / 96 - 1) / 1.15, -np.ones(xy.shape[:-1] + (1,))], axis=-1
        )
        origin = frame["camera"][0]
        u_edge, v_edge = frame["camera"][1] - origin, frame["camera"][3] - origin
        normal = np.cross(u_edge, v_edge)
        distance = (normal @ origin) / (rays @ normal)
        uv = (distance[..., None] * rays - origin) @ np.linalg.pinv(
            np.column_stack([u_edge, v_edge])
        ).T
        reference = sample_texture(frame["texture"], uv).mean(axis=1)
        errors = {
            mode: np.mean(np.abs(image[rows, cols] - reference))
            for mode, image in frame["filtering_images"].items()
        }
        self.assertGreater(len(pixels), 50)
        self.assertLess(errors["trilinear"], errors["bilinear"] * 0.2)
        self.assertLess(errors["anisotropic"], errors["trilinear"] * 0.8)

    def test_filtered_diagonal_independence_and_fair_affine_comparison(self):
        a = render(70, 17, 64, "anisotropic", 96, diagonal=0, texture_size=512)
        b = render(70, 17, 64, "anisotropic", 96, diagonal=1, texture_size=512)
        mask = (a["owner"] >= 0) & (b["owner"] >= 0)
        # Screen vertices quantize to 1/256 pixel; both triangulations approximate one plane.
        np.testing.assert_allclose(a["correct"][mask], b["correct"][mask], atol=0.003)
        np.testing.assert_allclose(a["lod"][mask], b["lod"][mask], atol=0.001)
        front = render(0, 0, 64, "trilinear", 96, texture_size=512)
        np.testing.assert_allclose(front["correct"], front["affine"], atol=1e-13)
        self.assertGreater(
            float(np.nanmax(a["lod_isotropic"] - a["lod_anisotropic"])), 1.0
        )

    def test_covered_center_does_not_guarantee_a_bounded_four_corner_footprint(self):
        piece = dict(
            xy=np.array([[0.0, 0.0], [1.2, 0.0], [0.0, 1.2]]),
            uv=np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]),
            inv_w=np.array([1.0, 0.1, 0.1]),
        )
        # Center (.5,.5) lies strictly inside, where q=1-.75=.25 > 0.
        weights = np.array([1 / 6, 5 / 12, 5 / 12])
        self.assertGreater(float(weights @ piece["inv_w"]), 0)
        self.assertTrue(
            np.isfinite(
                perspective_interpolate(weights, piece["uv"], piece["inv_w"])
            ).all()
        )
        self.assertTrue(
            np.isfinite(
                perspective_jacobian(weights, piece["xy"], piece["uv"], piece["inv_w"])
            ).all()
        )
        # At the pixel's top-right corner (1,1), the planar extension has q=-.5.
        # A finite Jacobian at the covered center cannot turn this into a bounded quad.
        with self.assertRaisesRegex(ValueError, "消失线"):
            pixel_footprint(piece, 0.5, 0.5)

    def test_invalid_footprints(self):
        for cap in (0, 33, 1.5):
            with self.assertRaises(ValueError):
                footprint_metrics(np.eye(2), (64, 64), max_anisotropy=cap)
        with self.assertRaises(ValueError):
            perspective_jacobian(
                [1, 0, 0], np.zeros((3, 2)), np.zeros((3, 2)), np.ones(3)
            )
        with self.assertRaises(ValueError):
            sample_trilinear(build_mipmaps(checker_texture()), [0, 0], np.nan)


if __name__ == "__main__":
    unittest.main()
