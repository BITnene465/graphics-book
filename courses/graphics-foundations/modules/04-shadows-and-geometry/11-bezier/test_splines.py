"""手算、单侧极限、圆锥曲线和局部支撑；不使用 UI 的结果作为答案。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

from core import bernstein, evaluate
from splines import (
    basis_derivative,
    bspline_basis,
    cubic_join,
    evaluate_bspline,
    join_diagnostics,
    rational_bezier,
)

LEFT = np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 1.0], [3.0, 1.0]])
RIGHT = np.array([[5.0, 2.0], [5.0, 4.0], [6.0, 3.0], [7.0, 1.0]])
QUADRATIC_KNOTS = [0, 0, 0, 1, 2, 3, 3, 3]


class CubicJoinTests(unittest.TestCase):
    def test_free_copies_without_mutating_input(self):
        left, right = cubic_join(LEFT, RIGHT)
        assert_array_equal(left, LEFT)
        assert_array_equal(right, RIGHT)
        left[0, 0], right[0, 0] = 99, 99
        self.assertEqual(LEFT[0, 0], 0)
        self.assertEqual(RIGHT[0, 0], 5)

    def test_c0_changes_only_endpoint(self):
        left, right = cubic_join(LEFT, RIGHT, "C0")
        assert_array_equal(left, LEFT)
        assert_array_equal(right[0], [3, 1])
        assert_array_equal(right[1:], RIGHT[1:])
        d = join_diagnostics(left, right)
        self.assertTrue(d["c0"])
        self.assertFalse(d["g1"])
        self.assertFalse(d["c1"])

    def test_g1_direction_does_not_require_equal_speed(self):
        left, right = cubic_join(LEFT, RIGHT, "G1", tangent_scale=2)
        assert_array_equal(right[:2], [[3, 1], [5, 1]])
        assert_array_equal(right[2:], RIGHT[2:])
        d = join_diagnostics(left, right)
        assert_allclose(d["left_velocity"], [3, 0])
        assert_allclose(d["right_velocity"], [6, 0])
        self.assertTrue(d["g1_defined"])
        self.assertTrue(d["g1"])
        self.assertFalse(d["c1"])
        self.assertEqual(d["tangent_cosine"], 1)

    def test_c1_unequal_durations_hand_calculation(self):
        left, right = cubic_join(LEFT, RIGHT, "C1", left_duration=2, right_duration=3)
        assert_array_equal(right[:2], [[3, 1], [4.5, 1]])
        assert_array_equal(right[2:], RIGHT[2:])
        d = join_diagnostics(left, right, left_duration=2, right_duration=3)
        assert_allclose(d["left_velocity"], [1.5, 0])
        assert_allclose(d["right_velocity"], [1.5, 0])
        self.assertTrue(d["c1"])
        self.assertTrue(d["g1"])
        self.assertFalse(d["c2"])
        self.assertFalse(join_diagnostics(left, right)["c1"])

    def test_c2_unequal_durations_hand_calculation(self):
        left, right = cubic_join(LEFT, RIGHT, "C2", left_duration=2, right_duration=3)
        # 左段端点局部二阶差为 (0,-1)，乘 (TR/TL)^2=2.25。
        assert_allclose(right[:3], [[3, 1], [4.5, 1], [6, -1.25]])
        assert_array_equal(right[3], RIGHT[3])
        d = join_diagnostics(left, right, left_duration=2, right_duration=3)
        assert_allclose(d["left_acceleration"], [0, -1.5])
        assert_allclose(d["right_acceleration"], [0, -1.5])
        for key in ["endpoint_gap", "velocity_gap", "acceleration_gap"]:
            assert_allclose(d[key], 0)
        self.assertTrue(d["c2"])

    def test_opposite_collinear_tangents_not_g1(self):
        right = RIGHT.copy()
        right[:2] = [[3, 1], [2, 1]]
        d = join_diagnostics(LEFT, right)
        self.assertTrue(d["g1_defined"])
        self.assertEqual(d["tangent_cosine"], -1)
        self.assertFalse(d["g1"])

    def test_disconnected_matching_derivatives_not_continuous(self):
        d = join_diagnostics(LEFT, LEFT + [3, 0])
        assert_allclose(d["endpoint_gap"], [0, -1])
        assert_allclose(d["velocity_gap"], [0, 0])
        self.assertFalse(d["c0"])
        self.assertFalse(d["c1"])
        self.assertFalse(d["g1"])

    def test_zero_tangent_no_g1_direction_but_can_be_c2(self):
        left = LEFT.copy()
        left[2] = left[3]
        with self.assertRaisesRegex(ValueError, "未定义"):
            cubic_join(left, RIGHT, "G1")
        a, b = cubic_join(left, RIGHT, "C2", left_duration=2, right_duration=3)
        d = join_diagnostics(a, b, left_duration=2, right_duration=3)
        self.assertTrue(d["c2"])
        self.assertFalse(d["g1_defined"])
        self.assertFalse(d["g1"])
        self.assertIsNone(d["tangent_cosine"])
        assert_allclose(d["left_velocity"], [0, 0])
        self.assertGreater(np.linalg.norm(d["left_acceleration"]), 0)

    def test_tiny_nonzero_tangent_has_direction(self):
        left = [[-3e-100, 0], [-2e-100, 0], [-1e-100, 0], [0, 0]]
        right = [[0, 0], [2e-100, 0], [3e-100, 0], [4e-100, 0]]
        d = join_diagnostics(left, right)
        self.assertTrue(d["g1_defined"])
        self.assertTrue(d["g1"])

    def test_bad_arguments(self):
        calls = [
            lambda: cubic_join(LEFT[:3], RIGHT),
            lambda: cubic_join(LEFT, np.zeros((4, 3))),
            lambda: cubic_join(LEFT, RIGHT, "C3"),
            lambda: cubic_join(LEFT, RIGHT, left_duration=0),
            lambda: cubic_join(LEFT, RIGHT, right_duration=np.inf),
            lambda: cubic_join(LEFT, RIGHT, "G1", tangent_scale=-1),
            lambda: join_diagnostics(LEFT, RIGHT, tolerance=0),
        ]
        for call in calls:
            with self.assertRaises(ValueError):
                call()


class BSplineTests(unittest.TestCase):
    def test_quadratic_basis_hand_values(self):
        assert_allclose(
            bspline_basis(QUADRATIC_KNOTS, 2, 0.5), [0.25, 0.625, 0.125, 0, 0]
        )
        assert_allclose(
            bspline_basis(QUADRATIC_KNOTS, 2, 1.5), [0, 0.125, 0.75, 0.125, 0]
        )
        # 非均匀区间：在 [0,1) 上第三基函数为 u²/3。
        assert_allclose(
            bspline_basis([0, 0, 0, 1, 3, 4, 4, 4], 2, 0.5), [0.25, 2 / 3, 1 / 12, 0, 0]
        )

    def test_partition_nonnegative_and_shapes(self):
        cases = [
            (0, [0, 1, 2, 5]),
            (1, [0, 0, 0.3, 1, 1]),
            (2, [0, 0, 0, 0.1, 0.7, 1, 1, 1]),
            (3, [0, 0, 0, 0, 0.2, 0.7, 1, 1, 1, 1]),
            (5, [0] * 6 + [0.4] + [1] * 6),
        ]
        for degree, knots in cases:
            end = knots[len(knots) - degree - 1]
            u = np.linspace(knots[degree], end, 204).reshape(12, 17)
            basis = bspline_basis(knots, degree, u)
            self.assertEqual(basis.shape, (12, 17, len(knots) - degree - 1))
            assert_allclose(basis.sum(axis=-1), 1, atol=1e-14)
            self.assertGreaterEqual(basis.min(), 0)

    def test_clamped_endpoints_exact(self):
        assert_array_equal(
            bspline_basis(QUADRATIC_KNOTS, 2, [0, 3]),
            [[1, 0, 0, 0, 0], [0, 0, 0, 0, 1]],
        )
        control = [[2, 3], [4, 5], [6, 7], [8, 9], [-1, 2]]
        assert_array_equal(
            evaluate_bspline(control, QUADRATIC_KNOTS, 2, [0, 3]),
            [control[0], control[-1]],
        )

    def test_nonclamped_active_domain_and_final_left_limit(self):
        knots = [0, 1, 2, 3, 4, 5]
        assert_allclose(bspline_basis(knots, 2, [2, 3]), [[0.5, 0.5, 0], [0, 0.5, 0.5]])
        assert_allclose(basis_derivative(knots, 2, [2, 3]), [[-1, 1, 0], [0, -1, 1]])
        with self.assertRaises(ValueError):
            bspline_basis(knots, 2, 1.9)

    def test_local_support_and_control_change(self):
        knots = [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4]
        u = np.linspace(0, 4, 257)
        basis = bspline_basis(knots, 3, u)
        # P2 只在 [U2,U6)=[0,3) 内影响曲线。
        assert_array_equal(basis[u >= 3, 2], 0)
        points = np.column_stack([np.arange(7), np.zeros(7)])
        moved = points.copy()
        moved[2] += [0, 2]
        difference = evaluate_bspline(moved, knots, 3, u) - evaluate_bspline(
            points, knots, 3, u
        )
        assert_allclose(difference[:, 1], 2 * basis[:, 2])
        assert_array_equal(difference[u >= 3], 0)
        self.assertTrue(np.all(np.count_nonzero(basis > 1e-15, axis=-1) <= 4))

    def test_full_multiplicity_uses_right_side(self):
        knots = [0, 0, 1, 1, 2, 2]
        assert_array_equal(bspline_basis(knots, 1, 1), [0, 0, 1, 0])
        assert_allclose(
            bspline_basis(knots, 1, 1 - 1e-8), [1e-8, 1 - 1e-8, 0, 0], atol=1e-15
        )
        assert_array_equal(basis_derivative(knots, 1, 1), [0, 0, -1, 1])
        assert_array_equal(basis_derivative(knots, 1, 1 - 1e-8), [-1, 1, 0, 0])
        assert_array_equal(bspline_basis(knots, 1, 2), [0, 0, 0, 1])
        assert_array_equal(basis_derivative(knots, 1, 2), [0, 0, -1, 1])

    def test_cubic_triple_knot_c0_speed_jump(self):
        knots = [0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1]
        control = np.array([[0, 0], [1, 0], [2, 0], [3, 0], [3, 2], [4, 2], [5, 2]])
        assert_allclose(evaluate_bspline(control, knots, 3, 0.5), [3, 0])
        assert_allclose(
            evaluate_bspline(control, knots, 3, 0.5 - 1e-9), [3, 0], atol=1e-8
        )
        assert_allclose(basis_derivative(knots, 3, 0.5) @ control, [0, 12])
        assert_allclose(
            basis_derivative(knots, 3, 0.5 - 1e-9) @ control, [6, 0], atol=1e-7
        )
        assert_allclose(
            basis_derivative(knots, 3, 0.5, order=2), [0, 0, 0, 24, -48, 24, 0]
        )

    def test_derivatives_hand_calculated(self):
        assert_allclose(basis_derivative(QUADRATIC_KNOTS, 2, 0.5), [-1, 0.5, 0.5, 0, 0])
        assert_allclose(
            basis_derivative(QUADRATIC_KNOTS, 2, 0.5, order=2), [2, -3, 1, 0, 0]
        )
        assert_allclose(basis_derivative(QUADRATIC_KNOTS, 2, 3), [0, 0, 0, -2, 2])
        assert_array_equal(basis_derivative(QUADRATIC_KNOTS, 2, [0.5, 1.5], order=3), 0)
        assert_allclose(
            basis_derivative(QUADRATIC_KNOTS, 2, np.linspace(0, 3, 101)).sum(axis=-1),
            0,
            atol=1e-14,
        )
        assert_allclose(
            basis_derivative(QUADRATIC_KNOTS, 2, [0.5, 1.5], order=0),
            bspline_basis(QUADRATIC_KNOTS, 2, [0.5, 1.5]),
        )

    def test_derivative_finite_differences_away_from_knots(self):
        knots = [0, 0, 0, 0, 0.2, 0.75, 1, 1, 1, 1]
        u, step = np.array([0.08, 0.4, 0.87]), 1e-6
        estimate = (
            bspline_basis(knots, 3, u + step) - bspline_basis(knots, 3, u - step)
        ) / (2 * step)
        assert_allclose(basis_derivative(knots, 3, u), estimate, atol=1e-8)
        second = (
            basis_derivative(knots, 3, u + step) - basis_derivative(knots, 3, u - step)
        ) / (2 * step)
        assert_allclose(basis_derivative(knots, 3, u, order=2), second, atol=1e-7)

    def test_degree_zero_convention(self):
        assert_array_equal(
            bspline_basis([0, 1, 2], 0, [0, 0.5, 1, 2]),
            [[1, 0], [1, 0], [0, 1], [0, 1]],
        )
        assert_array_equal(basis_derivative([0, 1, 2], 0, [0, 0.5, 1, 2]), 0)

    def test_bezier_is_one_clamped_span(self):
        u = np.linspace(0, 1, 37)
        for degree in [1, 2, 3, 5, 8]:
            knots = [0] * (degree + 1) + [1] * (degree + 1)
            assert_allclose(
                bspline_basis(knots, degree, u), bernstein(u, degree), atol=1e-14
            )
        assert_allclose(
            evaluate_bspline(LEFT, [0] * 4 + [1] * 4, 3, u),
            evaluate(LEFT, u),
            atol=1e-14,
        )

    def test_bad_spline_arguments(self):
        calls = [
            lambda: bspline_basis(QUADRATIC_KNOTS, 9, 0.5),
            lambda: bspline_basis(QUADRATIC_KNOTS, 2.0, 0.5),
            lambda: bspline_basis([0, 0, 2, 1, 3, 3], 1, 0.5),
            lambda: bspline_basis([0, 0, 0, 0, 1, 1, 1], 2, 0.5),
            lambda: bspline_basis([0, 0, np.nan, 1, 1, 1], 2, 0.5),
            lambda: bspline_basis(QUADRATIC_KNOTS, 2, -0.1),
            lambda: bspline_basis(QUADRATIC_KNOTS, 2, 3.1),
            lambda: bspline_basis(QUADRATIC_KNOTS, 2, np.inf),
            lambda: evaluate_bspline(LEFT, QUADRATIC_KNOTS, 2, 0.5),
            lambda: basis_derivative(QUADRATIC_KNOTS, 2, 0.5, order=-1),
        ]
        for call in calls:
            with self.assertRaises(ValueError):
                call()


class RationalCurveTests(unittest.TestCase):
    def test_quadratic_quarter_circle(self):
        control, weights = [[1, 0], [1, 1], [0, 1]], [1, np.sqrt(2) / 2, 1]
        t = np.linspace(0, 1, 101)
        curve = rational_bezier(control, weights, t)
        assert_allclose(np.sum(curve**2, axis=-1), 1, atol=8e-16)
        assert_allclose(rational_bezier(control, weights, 0.5), [np.sqrt(2) / 2] * 2)
        assert_array_equal(curve[[0, -1]], [[1, 0], [0, 1]])
        assert_allclose(
            evaluate_bspline(control, [0, 0, 0, 1, 1, 1], 2, t, weights), curve
        )
        self.assertGreater(abs(np.linalg.norm(evaluate(control, 0.5)) - 1), 0.05)

    def test_line_hand_value_and_path(self):
        control = [[0, 0, 2], [4, 2, 2]]
        assert_allclose(rational_bezier(control, [1, 3], 0.5), [3, 1.5, 2])
        curve = rational_bezier(control, [1, 3], np.linspace(0, 1, 31))
        assert_allclose(curve[:, 0], 2 * curve[:, 1])
        assert_allclose(curve[:, 2], 2)
        self.assertTrue(np.all(np.diff(curve[:, 0]) > 0))

    def test_homogeneous_projection(self):
        control, weights = [[1, -2], [4, 3], [-2, 4], [3, 0]], np.array([1, 2, 0.3, 4])
        homogeneous = np.column_stack([np.asarray(control) * weights[:, None], weights])
        t = np.linspace(0, 1, 21)
        evaluated = evaluate(homogeneous, t)
        assert_allclose(
            rational_bezier(control, weights, t),
            evaluated[:, :-1] / evaluated[:, -1, None],
            atol=2e-15,
        )

    def test_positive_weights_bounds_and_common_scale(self):
        weights, t = np.array([1, 2, 0.2, 5]), np.linspace(0, 1, 201)
        curve = rational_bezier(LEFT, weights, t)
        self.assertTrue(np.all(curve >= LEFT.min(axis=0) - 1e-14))
        self.assertTrue(np.all(curve <= LEFT.max(axis=0) + 1e-14))
        assert_allclose(rational_bezier(LEFT, weights * 1e300, t), curve, atol=1e-14)
        assert_allclose(
            rational_bezier(LEFT, np.ones(4), t), evaluate(LEFT, t), atol=1e-14
        )
        assert_allclose(rational_bezier([[2, -1]], [4], [0, 0.5, 1]), [[2, -1]] * 3)

    def test_weighted_nonuniform_spline_hand_value(self):
        # u=.5 的普通权重为 (1/4,5/8,1/8,0,0)，乘权后和为13/8。
        control, weights = [[0, 0], [1, 2], [3, 1], [4, 0], [5, 2]], [2, 1, 4, 1, 3]
        assert_allclose(
            evaluate_bspline(control, QUADRATIC_KNOTS, 2, 0.5, weights),
            [17 / 13, 14 / 13],
        )
        assert_allclose(
            evaluate_bspline(control, QUADRATIC_KNOTS, 2, [0, 3], weights),
            [control[0], control[-1]],
        )

    def test_unrepresentable_local_weight_sum_rejected(self):
        # 最大权重的基函数在此处为零；两个局部权重乘 1/2 后都下溢。
        smallest = np.nextafter(0.0, 1.0)
        with self.assertRaisesRegex(ValueError, "分母"):
            evaluate_bspline(
                [[0, 0], [1, 1], [2, 0]],
                [0, 0, 1, 2, 2],
                1,
                0.5,
                [smallest, smallest, 1],
            )

    def test_bad_weights_and_parameters(self):
        calls = [
            lambda: rational_bezier(LEFT, [1, 0, 1, 1], 0.5),
            lambda: rational_bezier(LEFT, [1, -1, 1, 1], 0.5),
            lambda: rational_bezier(LEFT, [1, 1, 1], 0.5),
            lambda: rational_bezier(LEFT, [1, np.inf, 1, 1], 0.5),
            lambda: rational_bezier(LEFT, [1, 1, 1, 1], 1.1),
            lambda: rational_bezier(LEFT, [1, 1, 1, 1], np.nan),
            lambda: evaluate_bspline(LEFT, [0] * 4 + [1] * 4, 3, 0.5, [1, 1, 0, 1]),
        ]
        for call in calls:
            with self.assertRaises(ValueError):
                call()


if __name__ == "__main__":
    unittest.main()
