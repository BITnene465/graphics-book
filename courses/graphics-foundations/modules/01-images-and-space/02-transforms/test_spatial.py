"""独立手算与几何不变量；运行 python test_spatial.py。"""

import unittest
import numpy as np
from numpy.testing import assert_allclose
import spatial


class SpatialVectors(unittest.TestCase):
    def test_projection_hand_calculation_and_residual(self):
        a, b = [3, 4, 2], [2, 0, 0]
        assert_allclose(spatial.project(a, b), [3, 0, 0])
        parallel, perpendicular = spatial.split_along(a, b)
        assert_allclose(parallel + perpendicular, a)
        self.assertEqual(spatial.dot(perpendicular, b), 0)
        assert_allclose(spatial.project(a, [-8, 0, 0]), parallel)
        assert_allclose(spatial.project([0, 0, 0], b), [0, 0, 0])

    def test_negative_projection_and_angle(self):
        a, b = [-1, 1, 0], [2, 0, 0]
        self.assertEqual(spatial.dot(a, b), -2)
        self.assertAlmostEqual(spatial.angle_between(a, b), 3 * np.pi / 4)
        assert_allclose(spatial.project(a, b), [-1, 0, 0])
        self.assertAlmostEqual(spatial.angle_between([1, 0, 0], [-1, 0, 0]), np.pi)

    def test_cross_hand_calculation_right_handed_and_area(self):
        assert_allclose(spatial.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1])
        assert_allclose(spatial.cross([0, 1, 0], [1, 0, 0]), [0, 0, -1])
        a, b = [1, 2, 3], [-2, 1, 0]
        result = spatial.cross(a, b)
        assert_allclose(result, [-3, -6, 5])
        self.assertEqual(spatial.dot(a, result), 0)
        self.assertEqual(spatial.dot(b, result), 0)
        self.assertAlmostEqual(spatial.parallelogram_area(a, b), np.sqrt(70))
        self.assertAlmostEqual(spatial.parallelogram_area([3, 0, 0], [2, 4, 0]), 12)

    def test_collinearity_is_zero_area_not_an_arbitrary_axis(self):
        for a, b in (([1, 2, 3], [-2, -4, -6]), ([0, 0, 0], [0, 3, 0])):
            assert_allclose(spatial.cross(a, b), [0, 0, 0])
            self.assertEqual(spatial.parallelogram_area(a, b), 0)
            with self.assertRaises(ValueError):
                spatial.unit(spatial.cross(a, b))

    def test_rodrigues_known_axis_and_diagonal_axis(self):
        assert_allclose(
            spatial.rotate([1, 0, 2], [0, 0, 5], np.pi / 2), [0, 1, 2], atol=1e-14
        )
        # 绕体对角线正转 120°，x→y→z→x。
        R = spatial.rotation_matrix([1, 1, 1], 2 * np.pi / 3)
        assert_allclose(R @ [1, 0, 0], [0, 1, 0], atol=1e-14)
        assert_allclose(R @ [0, 1, 0], [0, 0, 1], atol=1e-14)
        assert_allclose(R @ [0, 0, 1], [1, 0, 0], atol=1e-14)

    def test_rotation_invariants_and_decomposition(self):
        rng = np.random.default_rng(2026)
        for _ in range(30):
            axis, vector = rng.normal(size=(2, 3))
            angle = rng.uniform(-np.pi, np.pi)
            k = spatial.unit(axis)
            R = spatial.rotation_matrix(axis, angle)
            rotated = spatial.rotate(vector, axis, angle)
            assert_allclose(R.T @ R, np.eye(3), atol=2e-15)
            self.assertAlmostEqual(np.linalg.det(R), 1, places=14)
            assert_allclose(R @ k, k, atol=1e-15)
            assert_allclose(rotated, R @ vector, atol=1e-15)
            self.assertAlmostEqual(
                np.linalg.norm(rotated), np.linalg.norm(vector), places=14
            )
            self.assertAlmostEqual(
                spatial.dot(rotated, k), spatial.dot(vector, k), places=14
            )
            assert_allclose(spatial.rotate(rotated, axis, -angle), vector, atol=2e-15)
            assert_allclose(
                spatial.rotate(vector, -axis, angle),
                spatial.rotate(vector, axis, -angle),
                atol=1e-15,
            )

    def test_axis_parallel_and_zero_vector_rotation(self):
        assert_allclose(spatial.rotate([0, 3, 0], [0, 1, 0], 1.7), [0, 3, 0])
        assert_allclose(spatial.rotate([0, 0, 0], [1, 2, 3], 1.7), [0, 0, 0])

    def test_undefined_inputs_and_safe_unit_scale(self):
        for value in ([0, 0, 0], [1, 2], [1, np.inf, 2], [0, 1, np.nan]):
            with self.assertRaises(ValueError):
                spatial.unit(value)
        with self.assertRaises(ValueError):
            spatial.project([1, 2, 3], [0, 0, 0])
        with self.assertRaises(ValueError):
            spatial.angle_between([0, 0, 0], [1, 0, 0])
        with self.assertRaises(ValueError):
            spatial.rotation_matrix([0, 0, 0], 0)
        with self.assertRaises(ValueError):
            spatial.rotate([1, 0, 0], [0, 0, 1], np.nan)
        assert_allclose(spatial.unit([1e-300, 0, 0]), [1, 0, 0])
        assert_allclose(
            spatial.unit([1e300, 1e300, 0]), [1 / np.sqrt(2), 1 / np.sqrt(2), 0]
        )


if __name__ == "__main__":
    unittest.main()
