"""独立公式、手算、仿射性质、细分重参数化与有限差分。"""
import unittest
import numpy as np
from numpy.testing import assert_allclose
from core import arc_length_parameters, bernstein, de_casteljau, derivative, evaluate, split


P = np.array([[0., 0.], [0., 2.], [3., 2.], [3., 0.]])


class BezierTests(unittest.TestCase):
    def test_hand_calculated_layers(self):
        levels = de_casteljau(P, .5)
        self.assertEqual([len(level) for level in levels], [4, 3, 2, 1])
        assert_allclose(levels[1], [[0, 1], [1.5, 2], [3, 1]])
        assert_allclose(levels[2], [[.75, 1.5], [2.25, 1.5]])
        assert_allclose(levels[3], [[1.5, 1.5]])

    def test_endpoints_interpolate(self):
        assert_allclose(evaluate(P, [0, 1]), [P[0], P[-1]])
        assert_allclose(de_casteljau(P, 0)[-1][0], P[0])
        assert_allclose(de_casteljau(P, 1)[-1][0], P[-1])

    def test_independent_evaluation_agrees(self):
        rng = np.random.default_rng(4)
        for count in [1, 2, 3, 4, 6]:
            control = rng.normal(size=(count, 3))
            for t in [0, .13, .5, .87, 1]:
                assert_allclose(evaluate(control, t), de_casteljau(control, t)[-1][0], atol=1e-13)

    def test_weights_partition_and_nonnegative(self):
        weights = bernstein(np.linspace(0, 1, 101))
        assert_allclose(weights.sum(axis=-1), 1)
        self.assertGreaterEqual(weights.min(), 0)
        assert_allclose(bernstein(.5), [.125, .375, .375, .125])

    def test_coordinate_bounds_from_convex_combination(self):
        curve = evaluate(P, np.linspace(0, 1, 151))
        self.assertTrue(np.all(curve >= P.min(axis=0)-1e-14))
        self.assertTrue(np.all(curve <= P.max(axis=0)+1e-14))

    def test_affine_invariance_including_shear(self):
        a, b, t = np.array([[2, .7], [-.3, .5]]), np.array([4, -2]), np.linspace(0, 1, 51)
        assert_allclose(evaluate(P@a.T+b, t), evaluate(P, t)@a.T+b, atol=1e-13)

    def test_derivative_endpoints(self):
        assert_allclose(derivative(P, 0), 3*(P[1]-P[0]))
        assert_allclose(derivative(P, 1), 3*(P[3]-P[2]))
        assert_allclose(derivative(P, .5), [4.5, 0])

    def test_derivative_central_difference(self):
        for t in [.1, .3, .7, .9]:
            step = 1e-5
            estimate = (evaluate(P, t+step)-evaluate(P, t-step))/(2*step)
            assert_allclose(derivative(P, t), estimate, atol=2e-9)

    def test_split_reproduces_both_subintervals(self):
        for cut in [0, .2, .5, .8, 1]:
            left, right = split(P, cut)
            u = np.linspace(0, 1, 51)
            assert_allclose(left[-1], right[0], atol=1e-14)
            assert_allclose(evaluate(left, u), evaluate(P, cut*u), atol=1e-13)
            assert_allclose(evaluate(right, u), evaluate(P, cut+(1-cut)*u), atol=1e-13)

    def test_split_derivatives_include_parameter_scale(self):
        cut = .3
        left, right = split(P, cut)
        assert_allclose(derivative(left, 1), cut*derivative(P, cut))
        assert_allclose(derivative(right, 0), (1-cut)*derivative(P, cut))

    def test_coincident_points_and_zero_derivative(self):
        control = np.array([[2., 3.]]*4)
        assert_allclose(evaluate(control, [.1, .5, .9]), [[2, 3]]*3)
        assert_allclose(derivative(control, [.1, .5, .9]), 0)
        assert_allclose(derivative([[2, 3]], .5), [0, 0])
        with self.assertRaises(ValueError):
            arc_length_parameters(control, [.2, .8])

    def test_cusp_zero_derivative(self):
        cusp = [[1, -1], [-1/3, 1], [-1/3, -1], [1, 1]]
        assert_allclose(evaluate(cusp, .5), [0, 0], atol=1e-15)
        assert_allclose(derivative(cusp, .5), [0, 0], atol=1e-15)
        self.assertGreater(np.linalg.norm(derivative(cusp, .6)), 0)

    def test_equal_arc_positions_on_uneven_straight_curve(self):
        control = [[0, 0], [.05, 0], [.1, 0], [3, 0]]
        fractions = np.linspace(0, 1, 11)
        t = arc_length_parameters(control, fractions)
        points = evaluate(control, t)
        assert_allclose(points[:, 0], fractions*3, atol=7e-6)
        self.assertGreater(np.std(np.diff(evaluate(control, fractions)[:, 0])), .1)
        assert_allclose([t[0], t[-1]], [0, 1])

    def test_reverse_control_reverses_parameter(self):
        t = np.linspace(0, 1, 51)
        assert_allclose(evaluate(P[::-1], t), evaluate(P, 1-t), atol=1e-14)

    def test_invalid_data_rejected(self):
        for call in [lambda: de_casteljau([], .5), lambda: de_casteljau(P, 2),
                     lambda: evaluate(P, np.nan), lambda: bernstein(.5, -1),
                     lambda: arc_length_parameters(P, [-.1]), lambda: arc_length_parameters(P, [.5], steps=1)]:
            with self.assertRaises(ValueError):
                call()


if __name__ == '__main__':
    unittest.main()
