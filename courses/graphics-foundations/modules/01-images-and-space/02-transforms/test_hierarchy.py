"""一般基与层级的独立手算、退化检查和刚体不变量。"""

import unittest
import numpy as np
from numpy.testing import assert_allclose
import hierarchy as core


class GeneralBasisTests(unittest.TestCase):
    def test_oblique_basis_with_origin_hand_calculation(self):
        # p−o=(4,3,4)，由 z=2c_z、y=c_y、x=2c_x+c_y 得 c=(.5,3,2)。
        basis = core.basis_matrix([2, 0, 0], [1, 1, 0], [0, 0, 2])
        coordinates = core.world_to_local([5, 1, 7], [1, -2, 3], basis)
        assert_allclose(coordinates, [0.5, 3, 2])
        assert_allclose(core.local_to_world(coordinates, [1, -2, 3], basis), [5, 1, 7])
        # 点积得到 (8,7,8)，明确不同于一般基中的系数。
        assert_allclose(basis.T @ [4, 3, 4], [8, 7, 8])
        self.assertFalse(np.allclose(coordinates, basis.T @ [4, 3, 4]))

    def test_orthonormal_special_case_and_origin(self):
        basis = core.basis_matrix([0, 1, 0], [-1, 0, 0], [0, 0, 1])
        point, origin = np.array([3, 4, 5]), np.array([1, 1, 2])
        assert_allclose(core.world_to_local(point, origin, basis), [3, -2, 3])
        assert_allclose(
            core.world_to_local(point, origin, basis), basis.T @ (point - origin)
        )
        assert_allclose(core.world_to_local(origin, origin, basis), [0, 0, 0])

    def test_reflected_basis_is_valid_and_general_round_trip(self):
        assert_allclose(
            core.world_to_local([1, 2, 3], [0, 0, 0], np.diag([-1, 2, 3])),
            [-1, 1, 1],
        )
        rng = np.random.default_rng(23)
        for _ in range(25):
            basis = np.eye(3) + rng.uniform(-0.2, 0.2, size=(3, 3))
            origin, coordinates = rng.normal(size=(2, 3))
            world = core.local_to_world(coordinates, origin, basis)
            assert_allclose(core.world_to_local(world, origin, basis), coordinates)

    def test_singular_and_near_singular_are_explicit(self):
        for basis in (np.zeros((3, 3)), np.diag([1, 1, 0]), np.ones((3, 3))):
            self.assertEqual(core.basis_diagnostics(basis)["state"], "singular")
            with self.assertRaises(ValueError):
                core.world_to_local([1, 2, 3], [0, 0, 0], basis)
        basis = np.diag([1, 1, 1e-8])
        self.assertEqual(core.basis_diagnostics(basis)["state"], "near_singular")
        self.assertAlmostEqual(core.basis_diagnostics(basis)["condition"], 1e8)
        with self.assertRaises(ValueError):
            core.world_to_local([1, 2, 3], [0, 0, 0], basis)
        # 近奇异不等于没有数学上的逆；主动指定更小阈值仍可求解。
        assert_allclose(
            core.world_to_local([1, 2, 3], [0, 0, 0], basis, rcond=1e-10),
            [1, 2, 3e8],
        )
        # 退化时正向组合仍合法，只是不再唯一可逆。
        assert_allclose(
            core.local_to_world([1, 2, 3], [4, 5, 6], np.zeros((3, 3))), [4, 5, 6]
        )

    def test_condition_test_ignores_common_scale(self):
        for scale in (1e-150, 1, 1e150):
            diagnostics = core.basis_diagnostics(scale * np.diag([2, 3, 4]))
            self.assertEqual(diagnostics["state"], "regular")
            self.assertAlmostEqual(diagnostics["condition"], 2)


class HierarchyTests(unittest.TestCase):
    def test_known_right_angles(self):
        parent, child, joints = core.two_link_fk([1, 2], np.pi / 2, -np.pi / 2, 2, 1)
        assert_allclose(joints, [[1, 2], [1, 4], [2, 4]], atol=1e-14)
        assert_allclose(child[:2, :2], np.eye(2), atol=1e-14)
        assert_allclose(parent[:2, 0], [0, 1], atol=1e-14)

    def test_angle_sum_formula_independent_of_matrix_product(self):
        base, a, b, l1, l2 = np.array([-0.3, 0.8]), 0.7, -1.2, 1.8, 0.9
        _, child, joints = core.two_link_fk(base, a, b, l1, l2)
        elbow = base + l1 * np.array([np.cos(a), np.sin(a)])
        tip = elbow + l2 * np.array([np.cos(a + b), np.sin(a + b)])
        assert_allclose(joints, [base, elbow, tip])
        assert_allclose(child[:2, 0], [np.cos(a + b), np.sin(a + b)])

    def test_child_rotation_keeps_parent_and_elbow_fixed(self):
        parent1, _, joints1 = core.two_link_fk([1, -1], 0.4, 0.3, 2, 1)
        parent2, _, joints2 = core.two_link_fk([1, -1], 0.4, -0.7, 2, 1)
        assert_allclose(parent1, parent2)
        assert_allclose(joints1[:2], joints2[:2])
        self.assertFalse(np.allclose(joints1[2], joints2[2]))

    def test_rigid_invariants_and_shared_parent_motion(self):
        rng = np.random.default_rng(31)
        for a, b in rng.uniform(-np.pi, np.pi, size=(20, 2)):
            parent, child, joints = core.two_link_fk([0.2, -0.4], a, b, 1.7, 0.8)
            assert_allclose(np.linalg.norm(np.diff(joints, axis=0), axis=1), [1.7, 0.8])
            for frame in (parent, child):
                assert_allclose(frame[:2, :2].T @ frame[:2, :2], np.eye(2), atol=1e-14)
                self.assertAlmostEqual(np.linalg.det(frame[:2, :2]), 1)
            # 世界操作左乘，将整条链一起刚体移动；任意两点距离不变。
            motion = core.rigid2(0.9, [-1, 2])
            moved = core.apply2(motion, joints)
            assert_allclose(core.apply2(motion @ child, [0.8, 0]), moved[2])
            assert_allclose(
                np.linalg.norm(moved - moved[0], axis=1),
                np.linalg.norm(joints - joints[0], axis=1),
            )

    def test_local_and_world_translation_have_different_directions(self):
        frame = core.rigid2(np.pi / 2, [1, 2])
        step = core.rigid2(0, [2, 0])
        assert_allclose(core.apply2(frame @ step, [0, 0]), [1, 4], atol=1e-14)
        assert_allclose(core.apply2(step @ frame, [0, 0]), [3, 2], atol=1e-14)

    def test_zero_length_is_valid_and_negative_length_is_not(self):
        _, _, joints = core.two_link_fk([1, 2], 0.5, 0.4, 0, 0)
        assert_allclose(joints, [[1, 2], [1, 2], [1, 2]])
        with self.assertRaises(ValueError):
            core.two_link_fk([0, 0], 0, 0, -1, 1)

    def test_invalid_inputs_fail_instead_of_broadcasting(self):
        for point in ([1, 2], [1, 2, np.inf], [1, np.nan, 3]):
            with self.assertRaises(ValueError):
                core.world_to_local(point, [0, 0, 0], np.eye(3))
        with self.assertRaises(ValueError):
            core.basis_diagnostics(np.eye(2))
        with self.assertRaises(ValueError):
            core.basis_diagnostics(np.eye(3), rcond=0)
        with self.assertRaises(ValueError):
            core.rigid2(np.nan)
        with self.assertRaises(ValueError):
            core.two_link_fk([0, 0], 0, 0, np.inf, 1)
        projective = np.eye(3)
        projective[2, 0] = 0.1
        with self.assertRaises(ValueError):
            core.apply2(projective, [1, 2])


if __name__ == "__main__":
    unittest.main()
