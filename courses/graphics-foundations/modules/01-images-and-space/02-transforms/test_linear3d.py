"""三维仿射映射的手算与几何不变量。"""

import unittest
import numpy as np
import linear3d as core


class Linear3DTests(unittest.TestCase):
    def test_offset_plane_hand_example(self):
        matrix = core.plane_reflection([1, 0, 0], 0.5)
        np.testing.assert_allclose(core.transform_points(matrix, [2, 3, 4]), [-1, 3, 4])
        np.testing.assert_allclose(
            core.transform_points(matrix, [0.5, -2, 7]), [0.5, -2, 7]
        )
        np.testing.assert_allclose(core.transform_points(matrix, [0, 0, 0]), [1, 0, 0])

    def test_arbitrary_reflection_preserves_distance_and_reverses_signed_side(self):
        rng = np.random.default_rng(24)
        points = rng.normal(size=(35, 3))
        n = np.array([1.0, 2.0, -3.0])
        n /= np.linalg.norm(n)
        d = 0.4
        matrix = core.plane_reflection(n, d)
        reflected = core.transform_points(matrix, points)
        np.testing.assert_allclose(reflected @ n - d, -(points @ n - d), atol=1e-15)
        np.testing.assert_allclose(
            np.linalg.norm(reflected - reflected[0], axis=1),
            np.linalg.norm(points - points[0], axis=1),
            atol=1e-15,
        )
        np.testing.assert_allclose(matrix @ matrix, np.eye(4), atol=1e-15)
        self.assertAlmostEqual(np.linalg.det(matrix[:3, :3]), -1)
        np.testing.assert_allclose(core.plane_reflection(-n, -d), matrix)
        np.testing.assert_allclose(core.plane_reflection(n * 1e-200, d), matrix)

    def test_patch_lies_on_plane_and_has_consistent_orientation(self):
        n = core.unit([2, -1, 3])
        patch = core.plane_patch(n, 0.6)
        np.testing.assert_allclose(patch @ n, 0.6, atol=1e-15)
        self.assertGreater(np.cross(patch[1] - patch[0], patch[2] - patch[0]) @ n, 0)
        np.testing.assert_allclose(
            core.transform_points(core.plane_reflection(n, 0.6), patch),
            patch,
            atol=1e-15,
        )

    def test_simple_shear_hand_example_inverse_volume_and_nonorthogonality(self):
        m = core.shear_matrix(2)
        np.testing.assert_allclose(core.transform_points(m, [1, 3, 2]), [7, 3, 2])
        np.testing.assert_array_equal(m @ core.shear_matrix(-2), np.eye(4))
        self.assertEqual(np.linalg.det(m[:3, :3]), 1)
        self.assertEqual((m[:3, :3].T @ m[:3, :3])[0, 1], 2)
        for i in range(3):
            for j in range(3):
                if i != j:
                    p = np.array([2.0, 3.0, 5.0])
                    q = p.copy()
                    q[i] -= 1.5 * p[j]
                    np.testing.assert_allclose(
                        core.transform_points(core.shear_matrix(-1.5, i, j), p), q
                    )

    def test_wrong_perpendicular_distance_formula_for_nonunit_normal(self):
        p = np.array([3.0, 1.0, -1.0])
        n = np.array([2.0, -1.0, 2.0])
        d = 0.25
        q = core.transform_points(core.plane_reflection(n, d), p)
        midpoint = (p + q) / 2
        self.assertAlmostEqual(midpoint @ core.unit(n), d)
        self.assertFalse(np.allclose(q, p - 2 * (n @ p - d) * n))

    def test_invalid_axes_normals_and_projective_input_fail(self):
        for n in ([0, 0, 0], [1, 2], [0, np.inf, 1]):
            with self.assertRaises(ValueError):
                core.plane_reflection(n)
        for a, b in ((0, 0), (3, 1)):
            with self.assertRaises(ValueError):
                core.shear_matrix(1, a, b)
        m = np.eye(4)
        m[3, 2] = 1
        with self.assertRaises(ValueError):
            core.transform_points(m, [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
