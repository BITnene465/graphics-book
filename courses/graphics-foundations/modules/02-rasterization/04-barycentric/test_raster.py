"""整数覆盖、共享边、属性连续性与齐次裁剪的可重复数学检查。"""
import unittest
import numpy as np

from raster import (SUBPIXEL, CLIP_PLANES, edge_function, top_left, pixel_bounds,
                    triangle_coverage, rasterize_triangle, clip_polygon,
                    triangulate_fan, clip_triangle, clip_to_screen)


def coverage(vertices, rule="top_left", size=8):
    rows, cols, _ = rasterize_triangle(vertices, size, size, rule)
    result = np.zeros((size, size), dtype=int)
    result[rows, cols] = 1
    return result


class RasterTests(unittest.TestCase):
    def test_edge_area_and_barycentric_reconstruction(self):
        v = np.array([[0, 0], [4, 0], [0, 4]])
        points = np.array([[.5, .5], [1.5, 1.5], [3.5, 3.5]])
        mask, weights = triangle_coverage(v, points)
        np.testing.assert_array_equal(mask, [True, True, False])
        np.testing.assert_allclose(weights[0], [.75, .125, .125])
        np.testing.assert_allclose(weights.sum(axis=-1), 1)
        np.testing.assert_allclose(weights @ v, points)
        self.assertEqual(edge_function(v[0], v[1], v[2]), 16)

    def test_y_up_top_left_rule(self):
        self.assertTrue(top_left([0, 1], [0, 0]))
        self.assertTrue(top_left([1, 1], [0, 1]))
        self.assertFalse(top_left([0, 0], [0, 1]))
        self.assertFalse(top_left([0, 0], [1, 0]))
        # 正方形边恰穿过中心：左/上包含，右/下排除。
        a = [[.5, .5], [3.5, .5], [3.5, 3.5]]
        b = [[.5, .5], [3.5, 3.5], [.5, 3.5]]
        total = coverage(a, size=4) + coverage(b, size=4)
        expected = np.zeros((4, 4), dtype=int); expected[:3, :3] = 1
        np.testing.assert_array_equal(total, expected)

    def test_square_shared_edge_exactly_once(self):
        a, b = [[1, 1], [7, 1], [7, 7]], [[1, 1], [7, 7], [1, 7]]
        expected = np.zeros((8, 8), dtype=int); expected[1:7, 1:7] = 1
        np.testing.assert_array_equal(coverage(a) + coverage(b), expected)
        inclusive = coverage(a, "inclusive") + coverage(b, "inclusive")
        self.assertEqual(np.count_nonzero(inclusive == 2), 6)

    def test_winding_and_vertex_order_keep_colors(self):
        v = np.array([[.3, .7], [7.2, 1.1], [2.8, 7.3]])
        colors = np.eye(3)
        row, col, w = rasterize_triangle(v, 8, 8)
        base = np.zeros((8, 8, 3)); base[row, col] = w @ colors
        for order in [[2, 1, 0], [1, 2, 0], [0, 2, 1]]:
            r, c, weights = rasterize_triangle(v[order], 8, 8)
            image = np.zeros_like(base); image[r, c] = weights @ colors[order]
            np.testing.assert_allclose(image, base, atol=1e-15)

    def test_subpixel_shared_edge_has_no_cracks(self):
        # 非二进制精确小数也必须共享同一个量化端点。
        a, b, c, d = np.array([[.113, .219], [7.219, .219], [7.219, 7.113], [.113, 7.113]])
        total = coverage([a, b, c]) + coverage([a, c, d])
        np.testing.assert_array_equal(total[:1], 0)
        np.testing.assert_array_equal(total[1:, :7], 1)
        self.assertEqual(total.max(), 1)

    def test_bounds_output_rows_and_degenerate(self):
        v = [[-2, -2], [2, 0], [0, 2]]
        self.assertEqual(pixel_bounds(v, 8, 8), (0, 2, 0, 2))
        row, col, _ = rasterize_triangle(v, 8, 8)
        self.assertTrue(np.all(row >= 6)); self.assertTrue(np.all(col < 2))
        for v in [[[0, 0], [1, 1], [2, 2]], [[20, 20], [22, 20], [20, 22]]]:
            r, c, weights = rasterize_triangle(v, 8, 8)
            self.assertEqual(len(r), 0); self.assertEqual(weights.shape, (0, 3))

    def test_clip_inside_and_outside_empty_shapes(self):
        v = np.array([[-.5, -.5, 0, 1], [.5, -.5, 0, 1], [0, .5, 0, 1]])
        tri, attr = clip_triangle(v, np.eye(3))
        np.testing.assert_array_equal(tri, [v]); np.testing.assert_array_equal(attr, [np.eye(3)])
        v[:, 0] += 3
        tri, attr = clip_triangle(v, np.eye(3))
        self.assertEqual(tri.shape, (0, 3, 4)); self.assertEqual(attr.shape, (0, 3, 3))
        self.assertIsNone(clip_triangle(v)[1])

    def test_each_of_six_clip_planes(self):
        for axis in range(3):
            for sign in (-1, 1):
                v = np.array([[-.4, -.4, 0, 1], [.4, -.4, 0, 1], [0, .4, 0, 1]])
                v[2, axis] = 2 * sign
                polygon, attrs = clip_polygon(v, np.eye(3))
                self.assertGreaterEqual(len(polygon), 3)
                self.assertTrue(np.all(polygon @ CLIP_PLANES.T >= -1e-14))
                np.testing.assert_allclose(attrs @ v, polygon, atol=2e-16)
                np.testing.assert_allclose(attrs.sum(axis=1), 1)

    def test_near_plane_creates_interpolated_vertices(self):
        v = np.array([[-.5, -.5, 0, 1], [.5, -.5, 0, 1], [0, .5, -2, 1]])
        p, a = clip_polygon(v, np.eye(3))
        self.assertEqual(p.shape, (4, 4))
        near = np.flatnonzero(p[:, 2] == -1)
        np.testing.assert_allclose(a[near, 2], .5)
        triangles, colors = triangulate_fan(p, a)
        self.assertEqual(triangles.shape, (2, 3, 4)); self.assertEqual(colors.shape, (2, 3, 3))

    def test_clipped_shared_edge_and_fan_are_continuous(self):
        # 左半边越界的同一方形，两个输入面各自裁剪后不能重复覆盖/留缝。
        v = np.array([[-2, -.75, 0, 1], [.75, -.75, 0, 1], [.75, .75, 0, 1], [-2, .75, 0, 1]])
        colors = (v[:, :2] + 2) / 4
        total = np.zeros((8, 8), dtype=int)
        for ids in ([0, 1, 2], [0, 2, 3]):
            triangles, attrs = clip_triangle(v[ids], colors[ids])
            for tri, attr in zip(triangles, attrs):
                xy, _, _ = clip_to_screen(tri, 8, 8)
                row, col, w = rasterize_triangle(xy, 8, 8)
                total[row, col] += 1
                # 同一线性场经过裁剪后仍一致（屏幕量化容差单独声明）。
                expected = np.column_stack([(col + .5) / 16 + .25, (7.5 - row) / 16 + .25])
                np.testing.assert_allclose(w @ attr, expected, atol=1 / SUBPIXEL)
        expected = np.zeros_like(total); expected[1:7, :7] = 1
        np.testing.assert_array_equal(total, expected)

    def test_projection_and_homogeneous_scale(self):
        v = np.array([[-1, -1, -1, 1], [2, -2, 0, 2], [0, 3, 3, 3]])
        xy, depth, invw = clip_to_screen(v, 16, 8)
        np.testing.assert_allclose(xy, [[0, 0], [16, 0], [8, 8]])
        np.testing.assert_allclose(depth, [-1, 0, 1]); np.testing.assert_allclose(invw, [1, .5, 1/3])
        np.testing.assert_allclose(clip_to_screen(v * 7, 16, 8)[0], xy)

    def test_bad_input_rejected(self):
        with self.assertRaises(ValueError):
            rasterize_triangle([[0, 0], [np.nan, 1], [1, 0]], 8, 8)
        with self.assertRaises(ValueError):
            clip_triangle(np.zeros((3, 4)), np.zeros((2, 3)))
        with self.assertRaises(ValueError):
            clip_to_screen([[0, 0, 0, 0]], 8, 8)


if __name__ == "__main__":
    unittest.main()
