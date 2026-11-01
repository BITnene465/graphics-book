"""用可手算的例子与几何不变量验证核心，而不依赖界面。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose

from core import barycentric, cross2, interpolate, is_inside, linear_to_srgb


class BarycentricTests(unittest.TestCase):
    def setUp(self):
        self.vertices = np.array([[0, 0], [2, 0], [0, 2]], dtype=float)

    def test_oriented_area_changes_sign(self):
        self.assertEqual(cross2([2, 0], [0, 2]), 4)
        self.assertEqual(cross2([0, 2], [2, 0]), -4)

    def test_hand_calculated_interior_point(self):
        weights = barycentric([0.5, 0.5], self.vertices)
        assert_allclose(weights, [0.5, 0.25, 0.25])
        self.assertTrue(is_inside(weights))

    def test_exterior_keeps_negative_weight(self):
        weights = barycentric([1.5, 1.5], self.vertices)
        assert_allclose(weights, [-0.5, 0.75, 0.75])
        self.assertFalse(is_inside(weights))
        assert_allclose(interpolate(weights, self.vertices), [1.5, 1.5])

    def test_vertices_and_edge_are_covered(self):
        for index, point in enumerate(self.vertices):
            with self.subTest(vertex=index):
                weights = barycentric(point, self.vertices)
                assert_allclose(weights, np.eye(3)[index], atol=1e-15)
                self.assertTrue(is_inside(weights))
        weights = barycentric([1, 1], self.vertices)
        assert_allclose(weights, [0, 0.5, 0.5])
        self.assertTrue(is_inside(weights))

    def test_winding_permutates_weights_with_vertices(self):
        point, order = [0.3, 0.7], [0, 2, 1]
        original = barycentric(point, self.vertices)
        reversed_order = barycentric(point, self.vertices[order])
        assert_allclose(reversed_order, original[order])

    def test_reconstructs_many_points_and_sums_to_one(self):
        vertices = np.array([[-3, 2], [4, 5], [1, -2]], dtype=float)
        for point in np.random.default_rng(7).uniform(-10, 10, size=(30, 2)):
            weights = barycentric(point, vertices)
            self.assertAlmostEqual(weights.sum(), 1)
            assert_allclose(interpolate(weights, vertices), point, atol=1e-13)

    def test_translation_and_scale_invariance(self):
        point, shift = np.array([0.5, 0.5]), np.array([7, -11])
        for scale in [1e-100, 1e-12, 1, 1e12, 1e100]:
            with self.subTest(scale=scale):
                weights = barycentric((point + shift) * scale, (self.vertices + shift) * scale)
                assert_allclose(weights, [0.5, 0.25, 0.25], atol=1e-14)

    def test_collinear_coincident_and_near_degenerate_raise(self):
        for vertices in [
            [[0, 0], [1, 1], [2, 2]],
            [[1, 1], [1, 1], [1, 1]],
            [[0, 0], [1, 0], [2, 1e-16]],
        ]:
            with self.subTest(vertices=vertices), self.assertRaisesRegex(ValueError, "退化"):
                barycentric([0.5, 0.5], vertices)

    def test_thin_but_resolvable_triangle(self):
        weights = barycentric([0.25, 0.25e-8], [[0, 0], [1, 0], [0, 1e-8]])
        assert_allclose(weights, [0.5, 0.25, 0.25])

    def test_nonfinite_coordinates_raise(self):
        for value in [np.nan, np.inf, -np.inf]:
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "有限数"):
                    barycentric([value, 0], self.vertices)
                vertices = self.vertices.copy()
                vertices[1, 0] = value
                with self.assertRaisesRegex(ValueError, "有限数"):
                    barycentric([0, 0], vertices)

    def test_wrong_shapes_raise_clear_errors(self):
        with self.assertRaises(ValueError):
            barycentric([0, 0, 0], self.vertices)
        with self.assertRaises(ValueError):
            barycentric([0, 0], self.vertices[:2])
        with self.assertRaises(ValueError):
            cross2([1], [2])
        with self.assertRaises(ValueError):
            interpolate([0.5, 0.5], [1, 2, 3])

    def test_scalar_and_rgb_interpolation(self):
        weights = [0.5, 0.25, 0.25]
        self.assertEqual(interpolate(weights, [0, 20, 40]), 15)
        assert_allclose(interpolate(weights, np.eye(3)), weights)

    def test_coverage_tolerance_and_invalid_weights(self):
        self.assertTrue(is_inside([-1e-12, 0.5, 0.5 + 1e-12]))
        self.assertFalse(is_inside([-1e-4, 0.5, 0.5001]))
        self.assertFalse(is_inside([0.1, 0.1, 0.1]))
        with self.assertRaises(ValueError):
            is_inside([0, 0, 1], tolerance=-1)

    def test_srgb_known_values_and_branch_boundary(self):
        assert_allclose(
            linear_to_srgb([0, 0.0031308, 0.18, 0.5, 1]),
            [0, 0.040449936, 0.46135612950044164, 0.7353569830524495, 1],
            atol=1e-12,
        )

    def test_srgb_clips_before_power(self):
        with np.errstate(invalid="raise"):
            assert_allclose(linear_to_srgb([-0.5, 0.25, 2]), [0, 0.5370987304831942, 1])
        with self.assertRaises(ValueError):
            linear_to_srgb([np.nan, 0, 0])


if __name__ == "__main__":
    unittest.main()
