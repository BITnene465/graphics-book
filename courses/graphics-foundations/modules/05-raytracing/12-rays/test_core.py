"""解析交点、有限射线与反射性质；不把一个截图当作几何正确性的证明。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

from core import (CENTERS, RADII, camera_rays, nearest_hit, normalize, plane_t,
                  raster_comparison, reflect, render_image, shadow_hit,
                  sphere_roots, trace, trace_pixel)


class RayTests(unittest.TestCase):
    def test_sphere_two_roots_by_hand(self):
        assert_allclose(sphere_roots([0, 0, -3], [0, 0, 1], [0, 0, 0], 1), [2, 4])

    def test_nonunit_direction_changes_t_not_hit_position(self):
        roots = sphere_roots([0, 0, -3], [0, 0, 2], [0, 0, 0], 1)
        assert_allclose(roots, [1, 2])
        assert_allclose(np.array([0, 0, -3])+roots[0]*np.array([0, 0, 2]), [0, 0, -1])

    def test_tangent_is_one_repeated_root(self):
        assert_allclose(sphere_roots([1, 0, -3], [0, 0, 1], [0, 0, 0], 1), [3, 3])

    def test_tangent_at_origin_and_zero_q_case(self):
        assert_allclose(sphere_roots([1, 0, 0], [0, 1, 0], [0, 0, 0], 1), [0, 0])

    def test_inside_sphere_uses_positive_exit(self):
        hit = nearest_hit(CENTERS[0], [1, 0, 0])
        self.assertEqual(hit['owner'][0], 0)
        self.assertAlmostEqual(hit['t'][0], RADII[0])

    def test_behind_roots_are_negative_not_visible(self):
        assert_allclose(sphere_roots([0, 0, 3], [0, 0, 1], [0, 0, 0], 1), [-4, -2])
        hit = nearest_hit(CENTERS[0]+[0, 0, 3], [0, 0, 1])
        self.assertEqual(hit['owner'][0], -1)

    def test_miss_returns_infinite_roots(self):
        self.assertTrue(np.isinf(sphere_roots([2, 0, -3], [0, 0, 1], [0, 0, 0], 1)).all())

    def test_t_range_can_skip_near_root_or_all_roots(self):
        origin = CENTERS[0]+[0, 0, -3]
        self.assertAlmostEqual(nearest_hit(origin, [0, 0, 1], 2.5, 4)['t'][0], 3.8)
        self.assertEqual(nearest_hit(origin, [0, 0, 1], 0, 2)['owner'][0], -1)

    def test_plane_parallel_and_coplanar(self):
        self.assertTrue(np.isinf(plane_t([0, 2, 0], [1, 0, 0])))
        self.assertTrue(np.isinf(plane_t([0, 0, 0], [1, 0, 0])))
        self.assertEqual(plane_t([0, 2, 0], [0, -2, 0]), 1)

    def test_ground_has_explicit_finite_bounds(self):
        self.assertEqual(nearest_hit([6, 2, 0], [0, -1, 0])['owner'][0], -1)
        self.assertEqual(nearest_hit([4, 2, 0], [0, -1, 0])['owner'][0], 2)

    def test_shadow_ignores_objects_beyond_light(self):
        point, normal = [[-.95, .8, -3]], [[0, 0, -1]]
        near, *_ = shadow_hit(point, normal, [-.95, .8, -2], 1e-4)
        far, *_ = shadow_hit(point, normal, [-.95, .8, 3], 1e-4)
        self.assertEqual(near['owner'][0], -1)
        self.assertEqual(far['owner'][0], 0)

    def test_short_shadow_segment_does_not_extend_past_light(self):
        # 第一条偏移起点距光仅 .025；地面交点 t=.05 已在光后。
        # 同一批中的第二条仍须查到正常球体遮挡。
        points, normals = [[0, 0, 2], [-.95, .8, -3]], [[0, 1, 0], [0, 0, -1]]
        lights = [[0, .025, 2], [-.95, .8, 3]]
        hit, _, _, distance = shadow_hit(points, normals, lights, .05)
        assert_array_equal(hit['owner'], [-1, 0])
        self.assertTrue(np.isinf(hit['t'][0]))
        self.assertAlmostEqual(distance[0], .025)
        self.assertLess(hit['t'][1], distance[1])

    def test_zero_length_shadow_segment_has_no_direction_or_blocker(self):
        hit, origins, direction, distance = shadow_hit([[0, 0, 2]], [[0, 1, 0]], [0, .05, 2], .05)
        assert_array_equal(hit['owner'], [-1])
        self.assertTrue(np.isinf(hit['t'][0]))
        assert_allclose(distance, [0])
        assert_allclose(direction, [[0, 0, 0]])
        assert_allclose(hit['point'], origins)

    def test_zero_epsilon_reproduces_self_intersection(self):
        point, normal, light = [[0, 0, 2]], [[0, 1, 0]], [0, 5, 2]
        bad, *_ = shadow_hit(point, normal, light, 0)
        good, *_ = shadow_hit(point, normal, light, 1e-4)
        self.assertEqual(bad['owner'][0], 2)
        self.assertEqual(bad['t'][0], 0)
        self.assertEqual(good['owner'][0], -1)

    def test_reflection_preserves_length_and_flips_normal_component(self):
        incoming, normal = normalize([1, -2, .5]), np.array([0, 1, 0])
        outgoing = reflect(incoming, normal)
        self.assertAlmostEqual(np.linalg.norm(outgoing), 1)
        self.assertAlmostEqual(outgoing @ normal, -incoming @ normal)
        assert_allclose(outgoing[[0, 2]], incoming[[0, 2]])
        assert_allclose(reflect(outgoing, normal), incoming)

    def test_camera_rays_are_units_and_top_row_points_higher(self):
        _, directions = camera_rays(9)
        assert_allclose(np.linalg.norm(directions, axis=1), 1)
        self.assertGreater(directions[4, 1], directions[8*9+4, 1])

    def test_trace_pixel_first_hit_matches_image(self):
        result = render_image(32)
        pixel = np.flatnonzero(result['hit']['owner'] == 0)[10]
        row, col = divmod(int(pixel), 32)
        step = trace_pixel(32, row, col)[0]
        self.assertEqual(step['owner'], 0)
        assert_allclose(step['end'], result['hit']['point'][pixel])
        self.assertAlmostEqual(step['t'], result['hit']['t'][pixel])

    def test_bounce_budget_is_finite_and_reproducible(self):
        first, second = render_image(32, bounces=3), render_image(32, bounces=3)
        assert_array_equal(first['color'], second['color'])
        self.assertTrue(np.isfinite(first['color']).all())
        self.assertLessEqual(len(trace_pixel(32, 18, 10, bounces=3)), 4)

    def test_trace_broadcasts_one_origin_to_multiple_directions(self):
        origin = np.array([4., 2.5, 6.])
        directions = np.array([CENTERS[0]-origin, CENTERS[1]-origin, [0, 0, 2]-origin, [0, 2, 0]])
        expected = np.concatenate([trace(origin, direction, bounces=3) for direction in directions])
        actual = trace(origin, directions, bounces=3)
        self.assertEqual(actual.shape, (4, 3))
        assert_allclose(actual, expected, atol=1e-14)

    def test_trace_broadcasts_one_direction_to_multiple_origins(self):
        origins, direction = [[0, 2, 2], [4, 3, 1], [6, 2, 0]], [0, -2, 0]
        expected = np.concatenate([trace(origin, direction) for origin in origins])
        actual = trace(origins, direction)
        self.assertEqual(actual.shape, (3, 3))
        assert_allclose(actual, expected, atol=1e-14)

    def test_actual_raster_comparison_has_geometry_and_valid_normals(self):
        result = raster_comparison(32, 8)
        self.assertGreater(result['triangles'], 50)
        self.assertEqual(result['normal'].shape, (32, 32, 3))
        self.assertTrue(np.isfinite(result['normal']).all())
        self.assertGreater(np.std(result['normal']), .05)

    def test_zero_direction_and_excess_work_rejected(self):
        with self.assertRaises(ValueError):
            sphere_roots([0, 0, 0], [0, 0, 0], [0, 0, 0], 1)
        with self.assertRaises(ValueError):
            camera_rays(128)
        with self.assertRaises(ValueError):
            trace([[0, 1, 0]], [[0, 0, -1]], bounces=4)


if __name__ == '__main__':
    unittest.main()
