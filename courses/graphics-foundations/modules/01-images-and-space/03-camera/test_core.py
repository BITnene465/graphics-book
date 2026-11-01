"""直接运行：uv run python -m unittest discover -s 此目录 -p test_core.py"""

import unittest

import numpy as np
from numpy.testing import assert_allclose

from core import (clip_segment, look_at, orthographic, perspective,
                  perspective_divide, project_wireframe, transform_points, viewport)


class CameraTests(unittest.TestCase):
    def test_default_camera_is_identity(self):
        assert_allclose(look_at([0, 0, 0], [0, 0, -1]), np.eye(4))

    def test_eye_and_target_define_camera_frame(self):
        eye, target = np.array([3., 2., 5.]), np.array([-1., 1., -2.])
        view = look_at(eye, target)
        points = transform_points([eye, target], view)
        assert_allclose(points[0], [0, 0, 0, 1], atol=1e-14)
        assert_allclose(points[1], [0, 0, -np.linalg.norm(target-eye), 1], atol=1e-14)
        assert_allclose(view[:3, :3] @ view[:3, :3].T, np.eye(3), atol=1e-14)
        self.assertAlmostEqual(np.linalg.det(view[:3, :3]), 1)

    def test_view_is_inverse_camera_pose(self):
        eye = np.array([2., 1., 4.])
        view = look_at(eye, [0, 0, 0])
        pose = np.eye(4)
        pose[:3, :3] = view[:3, :3].T
        pose[:3, 3] = eye
        assert_allclose(view @ pose, np.eye(4), atol=1e-14)

    def test_singular_camera_rejected(self):
        for target, up in [([0, 0, 0], [0, 1, 0]), ([0, 1, 0], [0, 1, 0]),
                           ([0, 0, -1], [0, 0, 0])]:
            with self.assertRaises(ValueError):
                look_at([0, 0, 0], target, up)

    def test_near_and_far_map_to_minus_and_plus_one(self):
        for matrix in (perspective(70, 4/3, .4, 17), orthographic(3, 4/3, .4, 17)):
            clip = transform_points([[0, 0, -.4], [0, 0, -17]], matrix)
            assert_allclose(perspective_divide(clip)[:, 2], [-1, 1], atol=1e-14)

    def test_similar_triangles_hand_calculation(self):
        matrix = perspective(90, 2, 1, 10)
        clip = transform_points([[2, 1, -4]], matrix)
        # tan(45°)=1；x 被宽高比 2 除一次，x/y 再被深度 4 除一次。
        assert_allclose(clip[0], [1, 1, 8/3, 4], atol=1e-14)
        assert_allclose(perspective_divide(clip)[0], [.25, .25, 2/3])

    def test_perspective_shrinks_but_orthographic_does_not(self):
        points = [[1, 1, -2], [1, 1, -4]]
        p = perspective_divide(transform_points(points, perspective(60, 1, 1, 10)))
        o = perspective_divide(transform_points(points, orthographic(4, 1, 1, 10)))
        assert_allclose(p[0, :2], 2 * p[1, :2])
        assert_allclose(o[0, :2], o[1, :2])

    def test_fov_boundary(self):
        half_height = 3 * np.tan(np.deg2rad(60)/2)
        p = [[half_height*1.5, half_height, -3]]
        ndc = perspective_divide(transform_points(p, perspective(60, 1.5, 1, 10)))
        assert_allclose(ndc[0, :2], [1, 1])

    def test_invalid_projection_parameters(self):
        for near, far in [(0, 10), (1, 1), (2, 1), (1, np.inf)]:
            with self.assertRaises(ValueError):
                perspective(60, 1, near, far)
        for angle in [0, 180, np.nan]:
            with self.assertRaises(ValueError):
                perspective(angle, 1, 1, 10)

    def test_crossing_near_plane_keeps_partial_segment(self):
        matrix = perspective(90, 1, 1, 10)
        original = transform_points([[0, 0, -.5], [.5, 0, -2]], matrix)
        clipped = clip_segment(*original)
        self.assertIsNotNone(clipped)
        assert_allclose(clipped[0], transform_points([[1/6, 0, -1]], matrix)[0])
        assert_allclose(clipped[1], original[1])

    def test_two_outside_endpoints_can_have_visible_middle(self):
        clipped = clip_segment([-2, 0, 0, 1], [2, 0, 0, 1])
        assert_allclose(clipped, [[-1, 0, 0, 1], [1, 0, 0, 1]])

    def test_behind_eye_and_outside_same_plane_rejected(self):
        self.assertIsNone(clip_segment([0, 0, 0, -1], [0, 0, 0, -2]))
        self.assertIsNone(clip_segment([2, 0, 0, 1], [3, 0, 0, 1]))

    def test_crossing_camera_has_finite_visible_result(self):
        p = perspective(90, 1, 1, 10)
        clipped = clip_segment(*transform_points([[0, 0, 1], [.3, .2, -3]], p))
        self.assertIsNotNone(clipped)
        ndc = perspective_divide(clipped)
        self.assertTrue(np.isfinite(ndc).all())
        self.assertTrue((np.abs(ndc) <= 1 + 1e-14).all())

    def test_clipping_reversal_idempotence_and_halfspaces(self):
        random = np.random.default_rng(42)
        for points in random.uniform(-3, 3, (100, 2, 4)):
            points[:, 3] = 1
            result = clip_segment(*points)
            reverse = clip_segment(*points[::-1])
            if result is None:
                self.assertIsNone(reverse)
            else:
                assert_allclose(result, reverse[::-1], atol=1e-14)
                assert_allclose(clip_segment(*result), result, atol=1e-14)
                self.assertTrue((np.abs(result[:, :3]) <= result[:, 3, None]+1e-14).all())

    def test_viewport_is_top_left_and_continuous(self):
        assert_allclose(viewport([[-1, 1, -1], [1, -1, 1], [0, 0, 0]], 640, 480),
                        [[0, 0], [640, 480], [320, 240]])

    def test_wireframe_clips_instead_of_dropping_edge(self):
        segments = project_wireframe([[0, 0, -.5], [.5, 0, -2]], [(0, 1)],
                                     np.eye(4), perspective(90, 1, 1, 10), 100, 100)
        self.assertEqual(len(segments), 1)
        assert_allclose(segments[0], [[175/3, 50], [62.5, 50]])

    def test_nonpositive_w_cannot_be_divided(self):
        for w in [0, -1]:
            with self.assertRaises(ValueError):
                perspective_divide([[0, 0, 0, w]])


if __name__ == "__main__":
    unittest.main()
