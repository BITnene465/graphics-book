"""独立手算和不变量；计数是着色求值数量，不是计时基准。"""

import unittest
import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

from multisample import sample_positions, visibility, resolve, render_scene, demo_scene


FULL = np.array([[[-1, -1], [4, -1], [-1, 4]]], float)


class MultisampleTests(unittest.TestCase):
    def test_pattern_and_image_coordinate_convention(self):
        p = sample_positions(1, 2, 2)
        assert_allclose(
            p[0, 0], [[0.25, 1.25], [0.75, 1.25], [0.25, 1.75], [0.75, 1.75]]
        )
        assert_allclose(
            p[1, 0], [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
        )

    def test_shared_diagonal_covers_exactly_once(self):
        square = np.array([[[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 1], [0, 1]]])
        for grid in (1, 2, 4):
            for vertices in (square, square[:, ::-1]):
                result = visibility(
                    vertices, np.ones((2, 3)), sample_positions(1, 1, grid)
                )
                assert_array_equal(result["coverage"].sum(axis=0), 1)
                self.assertTrue((result["owner"] >= 0).all())

    def test_same_sample_coverage_and_depth_for_both_methods(self):
        f = demo_scene(0.375, 0.7, 4, 32)
        for key in ("owner", "depth", "coverage"):
            assert_array_equal(f["ssaa"][key], f["msaa"][key])
        assert_allclose(f["ssaa"]["image"], f["ssaa"]["sample_colors"].mean(axis=-2))
        assert_allclose(f["msaa"]["image"], f["msaa"]["sample_colors"].mean(axis=-2))

    def test_individual_depth_tests_can_choose_two_surfaces_in_one_pixel(self):
        # 图元 0 的 z=x，图元 1 的 z=.5；同一像素中左右样本看到不同表面。
        f = render_scene(
            np.repeat(FULL, 2, axis=0),
            [[-1, 4, -1], [0.5, 0.5, 0.5]],
            [[1, 0, 0], [0, 1, 0]],
            width=1,
            grid=2,
        )
        assert_array_equal(f["ssaa"]["owner"][0, 0], [0, 1, 0, 1])
        assert_allclose(f["ssaa"]["depth"][0, 0], [0.25, 0.5, 0.25, 0.5])
        assert_allclose(f["ssaa"]["image"][0, 0], [0.5, 0.5, 0])
        self.assertEqual(f["msaa"]["shading_count"], 2)
        self.assertEqual(f["ssaa"]["shading_count"], 4)

    def test_occluded_primitive_does_not_add_visible_shading_evaluations(self):
        f = render_scene(
            np.repeat(FULL, 2, axis=0),
            [[0.9] * 3, [0.1] * 3],
            [[1, 0, 0], [0, 1, 0]],
            width=1,
            grid=4,
        )
        self.assertEqual(f["center"]["shading_count"], 1)
        self.assertEqual(f["msaa"]["shading_count"], 1)
        self.assertEqual(f["ssaa"]["shading_count"], 16)
        assert_array_equal(f["msaa"]["owner"], 1)

    def test_constant_signal_with_matching_background_is_preserved(self):
        triangles = np.array([[[0.2, 0.1], [0.9, 0.2], [0.3, 0.9]]])
        color = [0.23, 0.42, 0.71]
        for grid in (1, 2, 4):
            f = render_scene(
                triangles, [[0, 0, 0]], [color], width=1, grid=grid, background=color
            )
            for method in ("center", "ssaa", "msaa"):
                assert_allclose(f[method]["image"][0, 0], color)

    def test_constant_primitive_ssaa_equals_msaa_but_not_center_at_an_edge(self):
        # 三角形正好覆盖方形的一半；包含共享对角线的一侧按 top-left 规则归属。
        f = render_scene(
            [[[0, 0], [1, 0], [0, 1]]],
            [[0, 0, 0]],
            [[1, 1, 1]],
            width=1,
            grid=2,
            background=[0, 0, 0],
        )
        assert_allclose(f["ssaa"]["image"], f["msaa"]["image"])
        value = f["ssaa"]["image"][0, 0, 0]
        self.assertGreater(value, 0)
        self.assertLess(value, 1)
        self.assertNotEqual(value, f["center"]["image"][0, 0, 0])

    def test_high_frequency_shading_is_still_undersampled_by_msaa(self):
        # 一个像素横向恰好一个周期；真实盒均值 .55，中心 cos(pi) 给 .1。
        f = render_scene(FULL, [[0, 0, 0]], [[1, 1, 1]], width=1, grid=2, frequency=1)
        assert_allclose(f["center"]["image"], 0.1, atol=1e-15)
        assert_allclose(f["msaa"]["image"], 0.1, atol=1e-15)
        assert_allclose(f["ssaa"]["image"], 0.55, atol=1e-15)

    def test_ssaa_does_not_remove_arbitrarily_high_frequency(self):
        # 2×2 格点也会混叠：两个周期恰好都采到 cos(pi)=-1。
        f = render_scene(FULL, [[0, 0, 0]], [[1, 1, 1]], width=1, grid=2, frequency=2)
        assert_allclose(f["ssaa"]["image"], 0.1, atol=1e-15)

    def test_resolve_is_linear_not_encoded_average(self):
        assert_allclose(resolve([[[0, 0, 0], [1, 1, 1]]]), [[0.5, 0.5, 0.5]])
        # sRGB 编码下 .5 线性亮度应显示约 .735，不能直接平均黑白编码值。
        value = resolve([[[0, 0, 0], [1, 1, 1]]])[0, 0]
        self.assertAlmostEqual(
            1.055 * value ** (1 / 2.4) - 0.055, 0.735356983, places=8
        )

    def test_single_sample_degenerates_to_the_same_algorithm(self):
        f = demo_scene(0.21, 1.3, 1, 24)
        for method in ("ssaa", "msaa"):
            assert_allclose(f[method]["image"], f["center"]["image"])
            self.assertEqual(f[method]["shading_count"], f["center"]["shading_count"])

    def test_count_is_sum_of_per_pixel_values_and_coverage_is_not_visibility(self):
        f = demo_scene(0.2, 0.3, 4, 24)
        for method in ("center", "ssaa", "msaa"):
            self.assertEqual(
                f[method]["shading_count"], f[method]["shading_per_pixel"].sum()
            )
        self.assertLess(f["ssaa"]["shading_count"], int(f["ssaa"]["coverage"].sum()))
        self.assertLessEqual(f["msaa"]["shading_count"], f["ssaa"]["shading_count"])

    def test_validation_rejects_unbounded_allocations_and_nonfinite_color(self):
        for values in ((513, 1, 2), (1, 1, 5), (1.5, 1, 2)):
            with self.assertRaises(ValueError):
                sample_positions(*values)
        with self.assertRaises(ValueError):
            render_scene(FULL, [[0, 0, 0]], [[np.nan, 0, 0]])


if __name__ == "__main__":
    unittest.main()
