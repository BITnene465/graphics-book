"""用独立手算、积分原函数与不变量验证时间采样，不依赖浏览器图像。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose

from temporal import (
    apparent_speed,
    cosine_exposure,
    cosine_signal,
    frame_times,
    midpoint_times,
    shutter_interval,
    wheel_exposure,
    wheel_frame,
    wheel_reference,
)


class TemporalTests(unittest.TestCase):
    def test_eight_blades_one_rev_at_twelve_fps_aliases_to_minus_half(self):
        self.assertEqual(apparent_speed(1, 12, 8), -0.5)
        for time in frame_times(12):
            assert_allclose(
                wheel_frame(time, 1, resolution=32),
                wheel_frame(time, -0.5, resolution=32),
                atol=7e-15,
            )
        # 两次曝光之间，场景确实不同；不是两个标签指向同一张图。
        difference = wheel_frame(1 / 24, 1) - wheel_frame(1 / 24, -0.5)
        self.assertGreater(np.max(np.abs(difference)), 0.5)

    def test_alias_family_has_identical_samples_with_eightfold_symmetry(self):
        for speed, fps in [(0.7, 9), (-1.3, 12), (2.0, 17)]:
            for integer in (-2, -1, 1, 3):
                equivalent = speed + integer * fps / 8
                for time in frame_times(fps, 0.5):
                    assert_allclose(
                        wheel_frame(time, speed, resolution=16),
                        wheel_frame(time, equivalent, resolution=16),
                        atol=2e-14,
                    )

    def test_units_and_nyquist_endpoint_convention(self):
        assert_allclose(frame_times(12, 0.25), [0, 1 / 12, 2 / 12, 3 / 12])
        self.assertEqual(apparent_speed(1, 24), 1)
        self.assertEqual(apparent_speed(1, 16), -1)  # ±8 Hz is ambiguous at 16 Hz.
        self.assertEqual(apparent_speed(1, 8), 0)
        self.assertAlmostEqual(1 / 12 * 360, 30)
        self.assertAlmostEqual(-0.5 / 12 * 360, -15)

    def test_centered_shutter_endpoints_and_midpoints_by_hand(self):
        low, high, duration = shutter_interval(0.25, 12, 1)
        assert_allclose([low, high, duration], [5 / 24, 7 / 24, 1 / 12])
        assert_allclose(midpoint_times(0.25, duration, 2), [11 / 48, 13 / 48])
        assert_allclose(midpoint_times(0.25, duration, 1), [0.25])
        assert_allclose(midpoint_times(0.25, 0, 7), np.full(7, 0.25))

    def test_sinc_reference_against_independent_antiderivative(self):
        for center, duration, frequency, phase in [
            (0.31, 0.07, 8, 0.2),
            (-0.2, 0.12, -6.5, 1.7),
            (0.6, 0.31, 2.0, -0.4),
        ]:
            low, high = center - duration / 2, center + duration / 2
            integral = (
                np.sin(2 * np.pi * frequency * high + phase)
                - np.sin(2 * np.pi * frequency * low + phase)
            ) / (2 * np.pi * frequency * duration)
            expected = 0.55 + 0.45 * integral
            self.assertAlmostEqual(
                cosine_exposure(center, duration, frequency, phase), expected, places=14
            )

    def test_full_cycle_and_half_cycle_hand_calculation(self):
        self.assertAlmostEqual(cosine_exposure(0, 1 / 8, 8), 0.55)
        self.assertAlmostEqual(cosine_exposure(0, 1 / 16, 8), 0.55 + 0.9 / np.pi)
        self.assertAlmostEqual(
            cosine_exposure(0, 1 / 12, 8), 0.55 + 0.45 * 3 * np.sqrt(3) / (4 * np.pi)
        )

    def test_zero_duration_and_zero_velocity_preserve_instantaneous_image(self):
        for samples in (1, 2, 16):
            assert_allclose(wheel_exposure(0.37, 0, samples), wheel_frame(0.37))
            assert_allclose(
                wheel_exposure(0.37, 0.2, samples, speed=0), wheel_frame(0, speed=0)
            )
        assert_allclose(cosine_exposure(0.2, 0, 8), cosine_signal(0.2, 8))

    def test_one_midpoint_is_instantaneous_and_many_converge_to_reference(self):
        center, duration = 0.375, 1 / 12
        assert_allclose(wheel_exposure(center, duration, 1), wheel_frame(center))
        reference = wheel_reference(center, duration, resolution=24)
        errors = [
            np.max(
                np.abs(wheel_exposure(center, duration, n, resolution=24) - reference)
            )
            for n in (2, 4, 16, 64)
        ]
        self.assertTrue(all(a > b for a, b in zip(errors, errors[1:])))
        self.assertLess(errors[-1], 4e-5)

    def test_midpoints_can_alias_even_when_analytic_average_is_zero_ac(self):
        # fΔ=2，N=2；中点在 ±Δ/4，余弦均为 -1，正确值却是直流 .55。
        times = midpoint_times(0, 0.25, 2)
        estimate = cosine_signal(times, 8).mean()
        self.assertAlmostEqual(estimate, 0.1)
        self.assertAlmostEqual(cosine_exposure(0, 0.25, 8), 0.55)

    def test_exposure_is_linear_rgb_average_of_actual_times(self):
        times = midpoint_times(0.375, 1 / 12, 2)
        expected = sum(wheel_frame(t, resolution=12) for t in times) / 2
        assert_allclose(wheel_exposure(0.375, 1 / 12, 2, resolution=12), expected)
        self.assertTrue((expected >= 0).all() and (expected <= 1).all())

    def test_validation_rejects_invalid_inputs(self):
        for call in (
            lambda: frame_times(0),
            lambda: frame_times(5000),
            lambda: apparent_speed(np.nan, 12),
            lambda: apparent_speed(1, 12, 0),
            lambda: shutter_interval(0, 12, 1.1),
            lambda: midpoint_times(0, -1, 2),
            lambda: midpoint_times(0, 1, 0),
            lambda: midpoint_times(0, 1, 2.5),
            lambda: wheel_frame(0, resolution=257),
            lambda: cosine_exposure(0, -1, 8),
        ):
            with self.assertRaises(ValueError):
                call()


if __name__ == "__main__":
    unittest.main()
