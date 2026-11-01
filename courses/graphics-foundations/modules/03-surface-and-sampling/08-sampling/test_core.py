"""独立手算与不变量，重点区分采样误差、显示编码和混叠。"""

import unittest
import numpy as np
from numpy.testing import assert_allclose
from core import (
    alias_frequency,
    average_color,
    exact_coverage,
    halfplane_coverage,
    linear_to_srgb,
    sample_coverage,
    sample_offsets,
    scene_values,
    srgb_to_linear,
    box_response,
    prefiltered_cosine,
    cosine_window_integral,
    cosine_spectral_lines,
)


class SamplingTests(unittest.TestCase):
    def test_counts_bounds_and_grid_centers(self):
        for count in [1, 4, 16, 64]:
            for strategy in ["grid", "jitter"]:
                offsets = sample_offsets(count, strategy)
                self.assertEqual(offsets.shape, (count, 2))
                self.assertTrue(np.all((offsets >= 0) & (offsets < 1)))
        assert_allclose(sample_offsets(1), [[0.5, 0.5]])
        assert_allclose(
            sample_offsets(4), [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
        )

    def test_stratified_one_per_cell_and_reproducible(self):
        a = sample_offsets(64, "jitter", seed=12)
        assert_allclose(a, sample_offsets(64, "jitter", seed=12))
        cells = np.floor(a * 8).astype(int)
        self.assertEqual(len(set(map(tuple, cells))), 64)

    def test_constant_fields_are_preserved(self):
        for count in [1, 4, 16, 64]:
            assert_allclose(sample_coverage(8, count, scene="edge", phase=100), 1)
            assert_allclose(sample_coverage(8, count, scene="edge", phase=-100), 0)
        assert_allclose(
            average_color(
                [0, 0.3, 1], foreground=(0.2, 0.4, 0.6), background=(0.2, 0.4, 0.6)
            ),
            [[0.2, 0.4, 0.6]] * 3,
        )

    def test_fixed_resolution_for_all_sample_counts(self):
        for count in [1, 4, 16, 64]:
            coverage = sample_coverage(12, count)
            self.assertEqual(coverage.shape, (12, 12))
            self.assertTrue(np.all((coverage >= 0) & (coverage <= 1)))

    def test_array_first_row_is_top_and_y_is_up(self):
        # y<=0 只覆盖图像下半部；数组首行必须是顶部背景。
        expected = np.array([[0.0, 0.0], [1.0, 1.0]])
        for count in [1, 4, 16, 64]:
            for strategy in ["grid", "jitter"]:
                assert_allclose(
                    sample_coverage(2, count, strategy, scene="edge", angle=90),
                    expected,
                )
        assert_allclose(exact_coverage(2, scene="edge", angle=90), expected, atol=1e-15)

    def test_array_probe_uses_scene_lower_left(self):
        # 用固定数组位置的实际场景坐标独立重算，包含非对称抖动位置。
        size, row, col = 4, 1, 0
        positions = np.array([-2.0, 0.0]) + sample_offsets(16, "jitter")
        parameters = dict(scene="edge", angle=35, phase=-1.0)
        expected = scene_values(positions, **parameters).mean()
        self.assertEqual(
            sample_coverage(size, 16, "jitter", **parameters)[row, col], expected
        )

    def test_axis_aligned_analytic_coverage(self):
        assert_allclose(
            halfplane_coverage([[0, 0], [1, 0], [-1, 0]], [1, 0], 0.25), [0.75, 0, 1]
        )
        assert_allclose(halfplane_coverage([[0, 0]], [-1, 0], 0.25), [0.75])

    def test_diagonal_triangular_hand_area(self):
        # 在 [-.5,.5]² 内，x+y<=-.5 是两直角边均为 .5 的三角形。
        assert_allclose(halfplane_coverage([[0, 0]], [1, 1], -0.5), [0.125])
        assert_allclose(halfplane_coverage([[0, 0]], [1, 1], 0), [0.5])
        assert_allclose(halfplane_coverage([[0, 0]], [1, 1], 0.5), [0.875])

    def test_cdf_piecewise_areas_and_near_axis_stability(self):
        thresholds = np.array([-0.6, -0.5, -0.4, 0.0, 0.4, 0.5, 0.6])
        expected = [0.0, 0.025, 0.1, 0.5, 0.9, 0.975, 1.0]
        assert_allclose(
            halfplane_coverage([0, 0], [1, 0.2], thresholds), expected, atol=2e-15
        )
        for tiny in [1e-7, 1e-12, 1e-16]:
            # 过中心的半平面必定平分中心对称正方形；中段是精确线性梯形。
            for normal in [[1, tiny], [tiny, 1], [-1, tiny]]:
                assert_allclose(
                    halfplane_coverage([0, 0], normal, [-0.25, 0, 0.25]),
                    [0.25, 0.5, 0.75],
                    atol=2e-16,
                    rtol=0,
                )

    def test_line_exact_integral(self):
        # 一个以原点为中心的像素，被宽 .6 的竖直细线覆盖 .6。
        assert_allclose(exact_coverage(1, scene="line", width=0.6, angle=0), [[0.6]])
        assert_allclose(exact_coverage(1, scene="line", width=2, angle=0), [[1]])

    def test_phase_changes_sample_but_integral_continuous(self):
        a = sample_coverage(1, 1, scene="edge", angle=0, phase=-0.01)
        b = sample_coverage(1, 1, scene="edge", angle=0, phase=0.01)
        assert_allclose([a.item(), b.item()], [0, 1])
        assert_allclose(
            [
                exact_coverage(1, scene="edge", angle=0, phase=p).item()
                for p in [-0.01, 0.01]
            ],
            [0.49, 0.51],
        )

    def test_regular_samples_approach_reference_in_example(self):
        truth = exact_coverage(20, scene="edge", phase=0.21, angle=27)
        first = np.mean(
            np.abs(sample_coverage(20, 1, scene="edge", phase=0.21, angle=27) - truth)
        )
        last = np.mean(
            np.abs(sample_coverage(20, 64, scene="edge", phase=0.21, angle=27) - truth)
        )
        self.assertLess(last, first / 5)  # 此指定场景成立，不声称逐像素误差单调。

    def test_linear_and_wrong_color_average(self):
        correct = average_color(0.5, (1, 1, 1), (0, 0, 0))
        wrong = average_color(0.5, (1, 1, 1), (0, 0, 0), wrong_space=True)
        assert_allclose(correct, [0.5] * 3)
        assert_allclose(linear_to_srgb(correct), [0.735356983] * 3)
        assert_allclose(linear_to_srgb(wrong), [0.5] * 3)
        assert_allclose(
            srgb_to_linear(linear_to_srgb([0.001, 0.2, 0.9])), [0.001, 0.2, 0.9]
        )

    def test_alias_has_identical_samples_with_phase(self):
        for frequency in [1, 9, 13, 24, 29]:
            fs, phase = 8, 0.3
            x = np.arange(17) / fs
            f_alias = alias_frequency(frequency, fs)
            assert_allclose(
                np.sin(2 * np.pi * frequency * x + phase),
                np.sin(2 * np.pi * f_alias * x + phase),
                atol=1e-13,
            )
            self.assertTrue(-fs / 2 <= f_alias < fs / 2)

    def test_nyquist_boundary_can_miss_sine(self):
        x = np.arange(9) / 8
        assert_allclose(np.sin(2 * np.pi * 4 * x), 0, atol=1e-14)
        self.assertEqual(alias_frequency(9, 8), 1)

    def test_box_filter_preserves_dc_and_zero_width_limit(self):
        x = np.linspace(-1, 1, 17)
        for half_width in (0, 0.03, 0.25, 1):
            assert_allclose(
                prefiltered_cosine(x, 0, half_width, 0.3), 0.5 + 0.45 * np.cos(0.3)
            )
        assert_allclose(
            prefiltered_cosine(x, 3, 0, 0.4), 0.5 + 0.45 * np.cos(6 * np.pi * x + 0.4)
        )
        self.assertEqual(float(box_response(0, 0.25)), 1)

    def test_box_filter_removes_one_full_period_but_is_not_ideal_lowpass(self):
        # f=2，宽 2h=.5 恰好一个周期；f=3 落在 sinc 的负旁瓣，不能被完全消灭。
        assert_allclose(prefiltered_cosine([0, 0.1, 0.5], 2, 0.25), 0.5, atol=1e-15)
        assert_allclose(box_response(3, 0.25), -2 / (3 * np.pi), atol=1e-15)
        self.assertLess(float(box_response(3, 0.25)), 0)

    def test_analytic_integral_matches_independent_gauss_quadrature(self):
        # 数值积分只作为测试里的独立参考，不参与演示输出。
        nodes, weights = np.polynomial.legendre.leggauss(120)
        for f, h, center, phase in [
            (0, 0.2, -0.3, 0.7),
            (1e-12, 0.03, 1.0, 1.7),
            (6, 0.75, -0.9, 2.3),
            (2.7, 0.31, 0.25, 0),
        ]:
            for progress in (0, 0.2, 0.5, 1):
                left, width = center - h, 2 * h * progress
                positions = left + width * (nodes + 1) / 2
                expected = (
                    width
                    / 2
                    * np.sum(
                        weights
                        * (0.5 + 0.45 * np.cos(2 * np.pi * f * positions + phase))
                    )
                )
                actual = cosine_window_integral(center, h, f, phase, progress)
                assert_allclose(actual, expected, atol=2e-14)
            assert_allclose(
                cosine_window_integral(center, h, f, phase) / (2 * h),
                prefiltered_cosine(center, f, h, phase),
                atol=2e-14,
            )

    def test_partial_integral_is_monotone_for_nonnegative_signal(self):
        for frequency in (0, 2, 6):
            sums = [
                cosine_window_integral(0.2, 0.4, frequency, 0.7, t)
                for t in np.linspace(0, 1, 41)
            ]
            self.assertEqual(sums[0], 0)
            self.assertTrue(np.all(np.diff(sums) >= 0))

    def test_cosine_spectrum_conjugate_pair_and_dc_merge(self):
        positions, coefficients = cosine_spectral_lines(3, 0.7)
        assert_allclose(positions, [-3, 3])
        assert_allclose(coefficients, [0.5 * np.exp(-0.7j), 0.5 * np.exp(0.7j)])
        positions, coefficients = cosine_spectral_lines(0, np.pi / 3)
        assert_allclose(positions, [0])
        assert_allclose(coefficients, [0.5])

    def test_sampled_spectrum_replicates_by_rate_and_folds_into_baseband(self):
        positions, coefficients = cosine_spectral_lines(7, 0.3, 8)
        assert_allclose(positions, [-15, -9, -7, -1, 1, 7, 9, 15])
        assert_allclose(np.abs(coefficients), 0.5)
        self.assertEqual(alias_frequency(7, 8), -1)
        # +7 平移 -8 到 -1，仍带 +phase，不能在折叠时随意丢弃相位。
        assert_allclose(
            coefficients[np.flatnonzero(positions == -1)[0]], 0.5 * np.exp(0.3j)
        )

    def test_nyquist_spectral_collision_adds_coefficients_before_magnitude(self):
        positions, coefficients = cosine_spectral_lines(4, np.pi / 2, 8)
        assert_allclose(positions, [-12, -4, 4, 12])
        assert_allclose(coefficients, 0, atol=1e-15)
        # 若先对两个 .5 取绝对值再相加，这个全零样本信号会被错画成幅度 1。
        _, coefficients = cosine_spectral_lines(4, 0, 8)
        assert_allclose(coefficients, 1)

    def test_box_filtered_alias_remains_equal_at_noninteger_sample_rate(self):
        fs, frequency, phase = 5.3, 11.2, 0.91
        positions = np.arange(12) / fs
        gain = box_response(frequency, 0.5 / fs)
        original = prefiltered_cosine(
            positions, frequency, 0.5 / fs, phase, mean=0, amplitude=1
        )
        candidate = gain * np.cos(
            2 * np.pi * alias_frequency(frequency, fs) * positions + phase
        )
        assert_allclose(original, candidate, atol=1e-13)

    def test_invalid_parameters(self):
        for call in [
            lambda: sample_offsets(9),
            lambda: sample_offsets(4, "unknown"),
            lambda: halfplane_coverage([[0, 0]], [0, 0], 0),
            lambda: alias_frequency(3, 0),
            lambda: exact_coverage(scene="checker"),
            lambda: box_response(2, -1),
            lambda: box_response(np.inf, 0.5),
            lambda: cosine_window_integral(0, 0, 2),
            lambda: cosine_window_integral(0, 0.5, 2, progress=1.1),
            lambda: cosine_spectral_lines(2, sample_rate=0),
            lambda: cosine_spectral_lines(-2),
            lambda: cosine_spectral_lines(2, phase=np.nan),
        ]:
            with self.assertRaises(ValueError):
                call()


if __name__ == "__main__":
    unittest.main()
