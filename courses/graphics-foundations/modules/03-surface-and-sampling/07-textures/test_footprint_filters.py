"""独立手算与可观察的不变量；旋转足迹时不偷偷换 UV 或原始纹理。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose

import footprint_filters as filters


class FootprintTests(unittest.TestCase):
    def test_ripmap_two_independent_dimensions_and_memory(self):
        image = np.arange(8 * 16 * 3).reshape(8, 16, 3).astype(float)
        grid = filters.build_ripmap(image)
        self.assertEqual((len(grid), len(grid[0])), (4, 5))
        self.assertEqual(grid[2][1].shape, (2, 8, 3))
        assert_allclose(grid[2][1][0, 0], image[:4, :2].mean(axis=(0, 1)))
        self.assertEqual(
            sum(level.shape[0] * level.shape[1] for row in grid for level in row),
            15 * 31,
        )
        assert_allclose(grid[-1][-1][0, 0], image.mean(axis=(0, 1)))

    def test_npot_and_thin_ripmap_preserve_every_mean(self):
        rng = np.random.default_rng(6)
        for shape in ((3, 5), (7, 11), (1, 13), (9, 1), (1, 1)):
            texture = rng.random(shape + (3,))
            for row in filters.build_ripmap(texture):
                for level in row:
                    assert_allclose(
                        level.mean(axis=(0, 1)), texture.mean(axis=(0, 1)), atol=1e-14
                    )
        last_column = np.zeros((3, 5, 3))
        last_column[:, -1] = 1
        assert_allclose(filters.build_ripmap(last_column)[0][1][0, :, 0], [0, 0.4])

    def test_four_level_mixing_by_hand(self):
        image = np.repeat(np.arange(4).reshape(2, 2, 1), 3, axis=2)
        result = filters.ripmap_probe(
            filters.build_ripmap(image), [0.25, 0.75], [0.25, 0.75]
        )
        assert_allclose(
            [query["weight"] for query in result["queries"]],
            [0.1875, 0.0625, 0.5625, 0.1875],
        )
        assert_allclose(
            [query["color"][0] for query in result["queries"]], [0, 0.5, 1, 1.5]
        )
        assert_allclose(result["color"], [0.875, 0.875, 0.875])
        for query in result["queries"]:
            self.assertAlmostEqual(float(query["texel_weights"].sum()), 1)

    def test_traced_ripmap_source_weights_match_actual_arrays(self):
        rng = np.random.default_rng(98)
        for shape in ((16, 16), (5, 9), (1, 7)):
            texture = rng.random(shape + (3,))
            grid = filters.build_ripmap(texture)
            for uv, lod in (
                ([0.37, 0.58], [1.4, 0.6]),
                ([0, 1], [2.2, 1.8]),
                ([1, 0], [100, -1]),
            ):
                weights = filters.ripmap_weights(shape, uv, lod)
                self.assertGreaterEqual(weights.min(), 0)
                self.assertAlmostEqual(float(weights.sum()), 1)
                assert_allclose(
                    np.sum(texture * weights[..., None], axis=(0, 1)),
                    filters.sample_ripmap(grid, uv, lod),
                    atol=1e-14,
                )

    def test_lod_zero_and_top_clamp(self):
        texture = filters.demo_texture()
        grid = filters.build_ripmap(texture)
        uv = [0.314, 0.721]
        assert_allclose(
            filters.sample_ripmap(grid, uv, [-10, -10]),
            filters.texture_core.sample_texture(texture, uv),
        )
        assert_allclose(
            filters.sample_ripmap(grid, uv, [100, 100]), texture.mean(axis=(0, 1))
        )
        a = filters.sample_ripmap(grid, uv, [2 - 1e-8, 1.4])
        b = filters.sample_ripmap(grid, uv, [2 + 1e-8, 1.4])
        assert_allclose(a, b, atol=1e-7)

    def test_constant_and_normalized_weights_for_both_filters(self):
        texture = np.broadcast_to([0.13, 0.32, 0.71], (17, 23, 3)).copy()
        grid = filters.build_ripmap(texture)
        for uv in ([0.5, 0.5], [0, 0], [1, 1], [0.12, 0.91]):
            for a, b, angle in ((14, 3, 37), (2, 12, -19), (0, 5, 22)):
                result = filters.ellipse_filter(texture, uv, a, b, angle)
                assert_allclose(result["color"], [0.13, 0.32, 0.71], atol=1e-14)
                self.assertAlmostEqual(float(result["weights"].sum()), 1)
                self.assertGreaterEqual(result["weights"].min(), 0)
                assert_allclose(
                    filters.sample_ripmap(grid, uv, result["lod_xy"]),
                    result["color"],
                    atol=1e-14,
                )

    def test_gaussian_center_impulse_by_hand(self):
        image = np.zeros((5, 5, 3))
        image[2, 2] = 1
        result = filters.ellipse_filter(image, [0.5, 0.5], 4, 4)
        center = 1 - np.exp(-2)
        adjacent = np.exp(-0.5) - np.exp(-2)
        diagonal = np.exp(-1) - np.exp(-2)
        self.assertEqual(result["sampled_centers"], 9)
        assert_allclose(
            result["color"], center / (center + 4 * adjacent + 4 * diagonal)
        )

    def test_ninety_degree_axis_exchange_is_same_ellipse(self):
        image = filters.demo_texture()
        uv = [0.317, 0.628]
        first = filters.ellipse_filter(image, uv, 16, 3, 27)
        swapped = filters.ellipse_filter(image, uv, 3, 16, 117)
        assert_allclose(first["shape_matrix"], swapped["shape_matrix"], atol=1e-13)
        assert_allclose(first["weights"], swapped["weights"], atol=2e-15)
        assert_allclose(first["color"], swapped["color"], atol=1e-14)
        turned = filters.ellipse_axes(16, 3, 117)
        assert_allclose(first["spans"], turned["spans"][::-1])

    def test_rotated_stripe_direction_retains_information_at_fixed_uv(self):
        image = filters.demo_texture()
        uv = np.array([0.5, 0.5])
        before = uv.copy()
        directed = filters.ellipse_filter(image, uv, 18, 2.5, 45)
        rectangle = filters.sample_ripmap(
            filters.build_ripmap(image), uv, directed["lod_xy"]
        )
        # 斜条纹沿 (1,1) 不变；轴对齐矩形混入条纹法向上很远的颜色。
        self.assertGreater(directed["color"][0] - rectangle[0], 0.2)
        assert_allclose(uv, before)
        wrong_direction = filters.ellipse_filter(image, uv, 18, 2.5, -45)
        self.assertGreater(directed["color"][0] - wrong_direction["color"][0], 0.2)

    def test_clamp_aggregates_duplicate_addresses_with_independent_sum(self):
        image = np.repeat(np.arange(12).reshape(3, 4, 1), 3, axis=2).astype(float)
        result = filters.ellipse_filter(image, [0, 0], 5, 3, 0)
        total, weight_sum = np.zeros(3), 0.0
        for y in range(-3, 4):
            for x in range(-4, 4):
                r2 = ((x + 0.5) / 2.5) ** 2 + ((y + 0.5) / 1.5) ** 2
                if r2 < 1:
                    w = np.exp(-2 * r2) - np.exp(-2)
                    total += w * image[2 - max(0, min(2, y)), max(0, min(3, x))]
                    weight_sum += w
        assert_allclose(result["color"], total / weight_sum)
        self.assertGreater(result["sampled_centers"], result["unique_texels"])

    def test_zero_axis_and_empty_center_footprint_have_explicit_fallback(self):
        image = filters.demo_texture()
        for a, b in ((0, 5), (4, 0), (0.1, 0.1)):
            result = filters.ellipse_filter(image, [0.5, 0.5], a, b, 33)
            self.assertTrue(result["fallback"])
            assert_allclose(
                result["color"], filters.texture_core.sample_texture(image, [0.5, 0.5])
            )

    def test_invalid_queries_and_shape(self):
        image = filters.demo_texture()
        for a, b, angle in ((-1, 2, 0), (257, 1, 0), (1, 1, np.nan)):
            with self.assertRaises(ValueError):
                filters.ellipse_filter(image, [0.5, 0.5], a, b, angle)
        for uv in ([np.nan, 0], [1.1, 0.5], [0]):
            with self.assertRaises(ValueError):
                filters.ellipse_filter(image, uv, 2, 2)
        with self.assertRaises(ValueError):
            filters.build_ripmap(np.zeros((0, 2, 3)))


if __name__ == "__main__":
    unittest.main()
