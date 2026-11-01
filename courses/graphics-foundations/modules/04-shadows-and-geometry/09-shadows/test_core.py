"""已知几何与固定比较输入验证阴影，不靠最终图片颜色猜测正确性。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

from core import (pcf_visibility, rasterize_world, render_scene, scene_geometry,
                  scene_matrices, shadow_query)


class ShadowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = render_scene(size=64, shadow_size=128)

    def test_known_shadowed_and_lit_ground_points(self):
        result = self.result
        points = [[0, 0, 0], [.75, 0, .5], [-2, 0, -2], [2, 0, -2]]
        query = shadow_query(points, result['light_vp'], result['shadow_depth'], .004)
        assert_array_equal(query['inside'], [True]*4)
        assert_allclose(query['visibility'], [0, 0, 1, 1])

    def test_pcf_compares_before_averaging(self):
        result = pcf_visibility(.6, [.2, .8])
        self.assertEqual(result, .5)
        wrong = float(.6 <= np.mean([.2, .8]))
        self.assertEqual(wrong, 0)

    def test_bias_monotonicity_for_fixed_compare_inputs(self):
        values = [pcf_visibility(.6, [.2, .58, .7], bias) for bias in [0, .03, .4]]
        assert_allclose(values, [1/3, 2/3, 1])
        self.assertTrue(np.all(np.diff(values) >= 0))

    def test_equal_depth_is_visible(self):
        self.assertEqual(pcf_visibility(.5, [.5], 0), 1)

    def test_infinite_background_never_occludes(self):
        self.assertEqual(pcf_visibility(.8, [np.inf], 0), 1)

    def test_three_by_three_pcf_is_nine_binary_comparisons(self):
        depth = np.array([[.2, .8, .8], [.2, .8, .2], [.8, .2, .8]])
        query = shadow_query([[0, 0, 0]], np.eye(4), depth, 0, 1)
        self.assertEqual(query['samples'].shape, (1, 9))
        assert_allclose(query['visibility'], [5/9])
        assert_allclose(query['stored'], [.8])

    def test_outside_light_volume_policy_is_visible(self):
        query = shadow_query([[0, 0, 0], [2, 0, 0], [0, 0, 2]], np.eye(4), np.zeros((4, 4)), 0)
        assert_array_equal(query['inside'], [True, False, False])
        assert_allclose(query['visibility'], [0, 1, 1])
        assert_array_equal(query['rows'], [2, -1, -1])

    def test_pcf_border_taps_use_lit_border(self):
        query = shadow_query([[-1, 1, 0]], np.eye(4), np.zeros((3, 3)), 0, 1)
        assert_allclose(query['uv'], [[0, 0]])
        assert_allclose(query['visibility'], [5/9])
        self.assertEqual(np.isinf(query['samples']).sum(), 5)

    def test_uv_orientation_matches_array_rows(self):
        depth = np.array([[.1, .2], [.3, .4]])
        points = [[-.5, .5, 0], [.5, .5, 0], [-.5, -.5, 0], [.5, -.5, 0]]
        query = shadow_query(points, np.eye(4), depth, 0)
        assert_allclose(query['stored'], [.1, .2, .3, .4])

    def test_near_clipping_world_attributes_stay_finite(self):
        matrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -11/9, -20/9], [0, 0, -1, 0]])
        triangle = [[[-.2, -.2, -.5], [1, -.4, -3], [0, 1, -3]]]
        result = rasterize_world(triangle, matrix, 64)
        visible = result['owner'] >= 0
        self.assertTrue(visible.any())
        self.assertTrue(np.isfinite(result['world'][visible]).all())
        self.assertTrue(np.all(result['world'][visible, 2] <= -1 + 1e-10))
        self.assertTrue(np.all((result['depth'][visible] >= 0) & (result['depth'][visible] <= 1)))

    def test_world_position_uses_perspective_correct_interpolation(self):
        matrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -11/9, -20/9], [0, 0, -1, 0]])
        triangle = [[[-1, -1, -2], [2, -2, -4], [0, 3, -6]]]
        result = rasterize_world(triangle, matrix, 64)
        valid = result['owner'] >= 0
        rows, cols = np.nonzero(valid)
        points = result['world'][valid]
        # 该例投影顶点恰在子像素格上，可直接反投影检查像素中心。
        projected = points[:, :2] / -points[:, 2, None]
        expected = np.column_stack((2*(cols+.5)/64-1, 1-2*(rows+.5)/64))
        assert_allclose(projected, expected, atol=1e-13)

    def test_repeated_render_is_identical(self):
        first = render_scene(64, 64, bias=.006, radius=1)
        second = render_scene(64, 64, bias=.006, radius=1)
        for key in ['color', 'shadow_depth', 'visibility']:
            assert_allclose(first[key], second[key], atol=0, rtol=0)

    def test_pcf_does_not_change_first_pass_depth(self):
        hard, filtered = render_scene(64, 64, radius=0), render_scene(64, 64, radius=2)
        assert_allclose(hard['shadow_depth'], filtered['shadow_depth'], atol=0, rtol=0)
        visible = np.isfinite(filtered['visibility'])
        self.assertTrue(np.all((filtered['visibility'][visible] >= 0) & (filtered['visibility'][visible] <= 1)))

    def test_vertical_light_is_valid_and_invalid_input_rejected(self):
        camera, light = scene_matrices([0, 5, 0])
        self.assertTrue(np.isfinite(camera).all() and np.isfinite(light).all())
        for bias in [-.1, np.nan]:
            with self.assertRaises(ValueError):
                pcf_visibility(.5, [.4], bias)
        with self.assertRaises(ValueError):
            shadow_query([[0, 0, 0]], np.eye(4), np.zeros((4, 4)), radius=3)


if __name__ == '__main__':
    unittest.main()
