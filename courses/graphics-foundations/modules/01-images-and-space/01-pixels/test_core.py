"""运行：uv run python -m unittest discover -s 本目录 -p test_core.py"""
import unittest
import numpy as np

from core import (pixel_centers, srgb_to_linear, linear_to_srgb, mix_colors,
                  render_image, scene_color, probe_pixel, rgba_for_bokeh, sample_offsets)


class PixelMathTests(unittest.TestCase):
    def test_centers_and_row_direction(self):
        centers = pixel_centers(4, 2)
        self.assertEqual(centers.shape, (2, 4, 2))
        np.testing.assert_allclose(centers[0, 0], [.125, .75])
        np.testing.assert_allclose(centers[-1, -1], [.875, .25])
        np.testing.assert_allclose(pixel_centers(1, 1), [[[.5, .5]]])

    def test_encode_decode_are_inverse(self):
        values = np.linspace(0, 1, 1001)
        np.testing.assert_allclose(srgb_to_linear(linear_to_srgb(values)), values, atol=3e-9)
        np.testing.assert_allclose(linear_to_srgb(srgb_to_linear(values)), values, atol=3e-8)

    def test_reference_midgray_and_breakpoints(self):
        self.assertAlmostEqual(float(linear_to_srgb(.5)), .7353569830524495)
        self.assertAlmostEqual(float(srgb_to_linear(.5)), .21404114048223255)
        self.assertAlmostEqual(float(srgb_to_linear(.04045)), .04045 / 12.92)
        self.assertAlmostEqual(float(linear_to_srgb(.0031308)), .0031308 * 12.92)

    def test_mixing_preserves_linear_energy(self):
        a, b, t = np.array([.9, .15, .35]), np.array([.2, .8, .5]), .37
        result = mix_colors(a, b, t)
        np.testing.assert_allclose(srgb_to_linear(result),
                                   (1 - t) * srgb_to_linear(a) + t * srgb_to_linear(b))
        np.testing.assert_allclose(mix_colors(a, b, 0), a)
        np.testing.assert_allclose(mix_colors(a, b, 1), b)
        np.testing.assert_allclose(mix_colors([0]*3, [1]*3, .5, linear=False), [.5]*3)

    def test_center_sample_matches_scene(self):
        xy = pixel_centers(9, 5)
        np.testing.assert_array_equal(render_image(9, 5), scene_color(xy[..., 0], xy[..., 1]))

    def test_real_sample_positions_and_probe_mean(self):
        np.testing.assert_array_equal(sample_offsets(1), [[.5, .5]])
        for count in [2, 4]:
            offsets = sample_offsets(count)
            self.assertEqual(len(offsets), count**2)
            self.assertFalse(np.any(np.all(offsets == .5, axis=1)))
            # 由像素左下角和 UI 使用的圆点位置重算边缘像素颜色。
            positions = (np.array([3, 1])+offsets)/8
            expected = scene_color(positions[:, 0], positions[:, 1]).mean(axis=0)
            np.testing.assert_allclose(render_image(8, 8, count)[6, 3], expected)

    def test_supersampling_equals_high_resolution_block_average(self):
        # 两种不同操作路径：像素内采样 vs 高分辨率图的 4×4 区块平均。
        hi = render_image(28, 20, pattern="disk")
        expected = hi.reshape(5, 4, 7, 4, 3).mean(axis=(1, 3))
        np.testing.assert_allclose(render_image(7, 5, samples=4), expected, atol=1e-15)

    def test_linear_ramp_is_exact_under_symmetric_samples(self):
        one = render_image(13, 7, samples=1, pattern="gradient")
        many = render_image(13, 7, samples=4, pattern="gradient")
        np.testing.assert_allclose(one, many, atol=2e-15)

    def test_probe_and_centers_roundtrip(self):
        for row in range(3):
            for col in range(5):
                self.assertEqual(probe_pixel(col + .5, 3 - row - .5, 5, 3), (row, col))
        self.assertEqual(probe_pixel(0, 0, 5, 3), (2, 0))
        for point in [(-.01, 0), (5, 0), (0, 3), (np.nan, 0)]:
            with self.assertRaises(ValueError):
                probe_pixel(*point, 5, 3)

    def test_rgba_channels_alpha_and_single_flip(self):
        # 图像数组顶行红绿、底行蓝白；上传图像底行在前。
        colors = render_image(2, 2, pattern="corners")
        packed = rgba_for_bokeh(colors)
        self.assertEqual(packed.dtype, np.dtype("uint32"))
        np.testing.assert_array_equal(packed, [[0xFFFF0000, 0xFFFFFFFF],
                                               [0xFF0000FF, 0xFF00FF00]])
        np.testing.assert_array_equal(packed >> 24, 255)

    def test_invalid_parameters_and_display_clipping(self):
        for args in [(0, 2), (2, -1), (2.5, 3)]:
            with self.assertRaises(ValueError):
                pixel_centers(*args)
        for samples in [0, 1.5, 17]:
            with self.assertRaises(ValueError):
                render_image(2, 2, samples)
        for value in [-.1, 1.1, np.nan]:
            with self.assertRaises(ValueError):
                srgb_to_linear(value)
        with self.assertRaises(ValueError):
            linear_to_srgb(np.inf)
        np.testing.assert_allclose(linear_to_srgb([-1, 2]), [0, 1])


if __name__ == "__main__":
    unittest.main()
