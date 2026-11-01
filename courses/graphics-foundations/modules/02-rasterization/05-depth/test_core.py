"""数学与几何性质测试；stdlib unittest，不增加测试依赖。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

from core import (candidate_depths, clip_vertices, depth_from_distance,
                  distance_from_depth, interpolate_depth, quantize_depth, render)

XY = np.array([[-.85, -.8], [.9, -.65], [.08, .88]])
COLORS = [[.1, .6, .3], [.8, .2, .1]]


class DepthTests(unittest.TestCase):
    def test_near_far_endpoints_and_inverse(self):
        d = np.geomspace(.3, 100, 50)
        z = depth_from_distance(d, .3, 100)
        assert_allclose(z[[0, -1]], [0, 1], atol=1e-14)
        assert_allclose(distance_from_depth(np.clip(z, 0, 1), .3, 100), d, rtol=1e-13)
        self.assertTrue(np.all(np.diff(z) > 0))

    def test_hand_calculated_projective_depth(self):
        # n=1,F=10：D(d)=10/9−10/(9d)。
        assert_allclose(depth_from_distance([1, 2, 5, 10], 1, 10), [0, 5/9, 8/9, 1])

    def test_depth_interpolation_must_not_correct_twice(self):
        # 屏幕中点 λ=(1/2,1/2,0)，顶点距离 2、8；真实 d=3.2。
        depths = depth_from_distance([2, 8, 4], 1, 10)
        result = interpolate_depth([[.5, .5, 0]], 2*depths-1)[0]
        self.assertAlmostEqual(result, 55/72)
        self.assertAlmostEqual(distance_from_depth(result, 1, 10), 3.2)
        wrong = np.sum(np.array([.5, .5, 0])*depths/np.array([2, 8, 4])) / (.5/2+.5/8)
        self.assertAlmostEqual(wrong, 23/36)
        self.assertNotAlmostEqual(result, wrong)

    def test_intersecting_triangles_have_both_winners(self):
        triangles = [clip_vertices(XY, [2, 7, 4], 1, 10),
                     clip_vertices(XY, [7, 2, 4], 1, 10)]
        result = render(triangles, COLORS, 64, 48)
        self.assertGreater(np.sum(result['owner'] == 0), 50)
        self.assertGreater(np.sum(result['owner'] == 1), 50)

    def test_reversing_order_preserves_unequal_depth_pixels(self):
        triangles = [clip_vertices(XY, [2, 7, 4], 1, 10),
                     clip_vertices(XY, [7, 2, 4], 1, 10)]
        first = render(triangles, COLORS, 64, 48, [0, 1])
        reverse = render(triangles, COLORS, 64, 48, [1, 0])
        candidates = first['candidates']
        unequal = np.isfinite(candidates).all(axis=0) & (candidates[0] != candidates[1])
        assert_array_equal(first['owner'][unequal], reverse['owner'][unequal])
        assert_allclose(first['depth'], reverse['depth'])

    def test_average_sorted_painter_fails_on_intersections(self):
        triangles = [clip_vertices(XY, [2, 7, 4], 1, 10),
                     clip_vertices(XY, [7, 2, 4], 1, 10)]
        correct = render(triangles, COLORS, 64, 48)
        painter = render(triangles, COLORS, 64, 48, method='painter')
        self.assertGreater(np.sum(correct['owner'] != painter['owner']), 50)

    def test_equal_depth_first_drawn_wins_explicitly(self):
        triangle = clip_vertices(XY, [3, 3, 3], 1, 10)
        for order, winner in [([0, 1], 0), ([1, 0], 1)]:
            result = render([triangle, triangle], COLORS, 24, 24, order)
            self.assertTrue(np.all(result['owner'][result['owner'] >= 0] == winner))

    def test_near_clipping_keeps_visible_part_and_finite_depth(self):
        triangle = clip_vertices(XY, [.4, 3, 3], 1, 10)
        depths = candidate_depths([triangle], 64, 48)[0]
        visible = depths[np.isfinite(depths)]
        self.assertGreater(len(visible), 20)
        self.assertTrue(np.all((visible >= 0) & (visible <= 1)))

    def test_entire_triangle_before_near_has_no_coverage(self):
        triangle = clip_vertices(XY, [.4, .5, .7], 1, 10)
        self.assertTrue(np.isinf(candidate_depths([triangle], 16, 16)).all())

    def test_shared_diagonal_has_exactly_one_owner(self):
        square = np.array([[-1, -1, 0, 1], [1, -1, 0, 1], [1, 1, 0, 1], [-1, 1, 0, 1]])
        values = candidate_depths([square[[0, 1, 2]], square[[0, 2, 3]]], 16, 12)
        assert_array_equal(np.isfinite(values).sum(axis=0), np.ones((12, 16)))

    def test_clipped_shared_edge_has_no_gap_or_double_coverage(self):
        square = np.array([[-2, -1, 0, 1], [1, -1, 0, 1], [1, 1, 0, 1], [-2, 1, 0, 1]])
        values = candidate_depths([square[[0, 1, 2]], square[[0, 2, 3]]], 16, 12)
        assert_array_equal(np.isfinite(values).sum(axis=0), np.ones((12, 16)))

    def test_far_plane_depth_one_is_not_background(self):
        triangle = clip_vertices(XY, [10, 10, 10], 1, 10)
        result = render([triangle], COLORS[:1], 16, 16)
        mask = result['owner'] >= 0
        self.assertTrue(mask.any())
        assert_allclose(result['depth'][mask], 1)

    def test_quantization_can_make_different_distances_tie(self):
        z = depth_from_distance([7, 7.001], .1, 20)
        self.assertNotEqual(z[0], z[1])
        self.assertEqual(*quantize_depth(z, 8))
        assert_allclose(quantize_depth([0, 1], 8), [0, 1])

    def test_inverse_depth_intervals_widen_farther_away(self):
        distances = distance_from_depth(np.linspace(0, 1, 16), 1, 20)
        self.assertTrue(np.all(np.diff(np.diff(distances)) > 0))

    def test_invalid_parameters_rejected(self):
        for near, far in [(0, 10), (2, 2), (3, 1), (1, np.inf)]:
            with self.assertRaises(ValueError):
                depth_from_distance(2, near, far)
        with self.assertRaises(ValueError):
            render([clip_vertices(XY, [3, 3, 3], 1, 10)], COLORS[:1], 16, 16, [0, 0])


if __name__ == '__main__':
    unittest.main()
