"""独立整数参考、手算插值、差分边界及坐标变换不变量。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

import procedural as noise


def scalar_hash(point, seed):
    """Python 任意精度整数参考，不复用 NumPy hash 的中间结果。"""
    h = seed
    for coordinate, salt in zip(point, (0x9E3779B9, 0x85EBCA77, 0xC2B2AE3D)):
        h ^= ((int(coordinate) % 2**32) * salt) % 2**32
    h = ((h ^ (h >> 16)) * 0x7FEB352D) % 2**32
    h = ((h ^ (h >> 15)) * 0x846CA68B) % 2**32
    return (h ^ (h >> 16)) / 2**32


class ProceduralTests(unittest.TestCase):
    def test_lattice_values_match_integer_reference(self):
        for dimension in (2, 3):
            points = np.random.default_rng(2).integers(-20, 21, (80, dimension))
            for seed in (0, 7, 2**32 - 1):
                expected = [scalar_hash(point, seed) for point in points]
                assert_array_equal(noise.lattice_hash(points, seed), expected)
                assert_array_equal(noise.value_noise(points, seed), expected)
        self.assertEqual(noise.value_noise([0, 0]), 0)

    def test_negative_coordinates_use_floor(self):
        probe = noise.noise_probe([-0.25, -1.75], seed=7)
        assert_array_equal(probe["cell"], [-1, -2])
        assert_allclose(probe["fraction"], [0.75, 0.25])
        sx, sy = (6 * s**5 - 15 * s**4 + 10 * s**3 for s in (0.75, 0.25))
        expected = 0
        for x, wx in ((-1, 1 - sx), (0, sx)):
            for y, wy in ((-2, 1 - sy), (-1, sy)):
                expected += scalar_hash([x, y], 7) * wx * wy
        self.assertAlmostEqual(float(probe["value"]), expected, places=14)

    def test_center_is_average_of_four_or_eight_corners(self):
        for dimension in (2, 3):
            point = np.full(dimension, 0.5)
            probe = noise.noise_probe(point, seed=19)
            expected = (
                sum(scalar_hash(corner, 19) for corner in probe["corners"])
                / 2**dimension
            )
            assert_allclose(probe["weights"], 1 / 2**dimension, atol=0)
            self.assertAlmostEqual(
                float(noise.value_noise(point, 19)), expected, places=15
            )

    def test_weights_are_convex_and_query_order_independent(self):
        for dimension in (2, 3):
            points = np.random.default_rng(11).uniform(-4, 4, (200, dimension))
            probe = noise.noise_probe(points, seed=7)
            self.assertGreaterEqual(probe["weights"].min(), 0)
            assert_allclose(probe["weights"].sum(axis=-1), 1, atol=1e-15)
            self.assertTrue(
                np.all(probe["value"] >= probe["corner_values"].min(axis=-1) - 1e-15)
            )
            self.assertTrue(
                np.all(probe["value"] <= probe["corner_values"].max(axis=-1) + 1e-15)
            )
            assert_array_equal(noise.value_noise(points[::-1], 7)[::-1], probe["value"])
            assert_array_equal(noise.value_noise(points[:9], 7), probe["value"][:9])

    def test_fade_and_cross_cell_derivatives_are_continuous(self):
        assert_array_equal(noise.fade([0, 0.5, 1]), [0, 0.5, 1])
        # 法向一阶和二阶导数都在格边趋零；切向导数不必为零。
        h = 1e-3
        for dimension in (2, 3):
            for axis in range(dimension):
                p = np.array([0.37, -0.41, 0.28][:dimension])
                p[axis] = -1
                e = np.eye(dimension)[axis] * h
                left, center, right = [
                    noise.value_noise(q, 7) for q in (p - e, p, p + e)
                ]
                self.assertLess(abs(float(left - right)), 2e-8)
                self.assertLess(abs(float((center - left) / h)), 1e-5)
                self.assertLess(abs(float((right - center) / h)), 1e-5)
                second_left = (
                    noise.value_noise(p - 2 * e, 7) - 2 * left + center
                ) / h**2
                second_right = (
                    noise.value_noise(p + 2 * e, 7) - 2 * right + center
                ) / h**2
                self.assertLess(abs(float(second_left)), 0.06)
                self.assertLess(abs(float(second_right)), 0.06)

    def test_fbm_normalization_and_independent_sum(self):
        points = np.array([[0.2, -0.4, 0.7], [-0.3, 1.1, 0.2]])
        for gain in (0, 0.5, 1):
            actual = noise.fbm(points, octaves=4, gain=gain, lacunarity=2, seed=7)
            expected = sum(
                gain**k * noise.value_noise(points * 2**k, 7) for k in range(4)
            ) / sum(gain**k for k in range(4))
            assert_allclose(actual, expected, atol=1e-15)
            self.assertTrue(np.all((actual >= 0) & (actual <= 1)))
        assert_array_equal(
            noise.fbm(points, octaves=1, seed=7), noise.value_noise(points, 7)
        )
        assert_allclose(
            noise.fbm(points, lacunarity=1, seed=7), noise.value_noise(points, 7)
        )
        self.assertGreater(
            np.max(np.abs(noise.fbm(points, seed=7) - noise.fbm(points, seed=19))), 0.02
        )

    def test_two_octave_hand_calculation(self):
        # 第一层在四角中心，第二层频率翻倍后恰落在 (1,1) 格点。
        center = (
            sum(scalar_hash(point, 7) for point in ((0, 0), (0, 1), (1, 0), (1, 1))) / 4
        )
        expected = (center + 0.5 * scalar_hash((1, 1), 7)) / 1.5
        self.assertAlmostEqual(
            float(noise.fbm([0.5, 0.5], octaves=2, gain=0.5, lacunarity=2, seed=7)),
            expected,
            places=15,
        )

    def test_object_and_world_coordinates_under_translation(self):
        local = np.array([[0.2, -0.5, 0.7], [-0.7, 0.2, 0.4]])
        translation = np.array([0.6, -0.2, 0.3])
        world = local + translation
        object_before = noise.fbm(local, seed=7)
        object_after = noise.fbm(world - translation, seed=7)
        assert_allclose(object_before, object_after, atol=2e-15)
        self.assertGreater(
            np.max(np.abs(noise.fbm(world, seed=7) - object_before)), 0.03
        )
        fixed_world = np.array([0.3, -0.2, 0.8])
        # 世界场不随物体移动；同一世界位置换物体局部标签后仍查询同一个值。
        assert_allclose(
            noise.fbm((fixed_world - translation) + translation, seed=7),
            noise.fbm(fixed_world, seed=7),
        )

    def test_invalid_inputs_and_supported_coordinate_boundary(self):
        for point in ([0], [0, 0, 0, 0], [np.nan, 0], [np.inf, 0], [2**21, 0]):
            with self.assertRaises(ValueError):
                noise.value_noise(point)
        for seed in (-1, 2**32, 1.5, True):
            with self.assertRaises(ValueError):
                noise.value_noise([0, 0], seed)
        for options in (
            dict(octaves=0),
            dict(octaves=True),
            dict(gain=-0.1),
            dict(lacunarity=0.5),
        ):
            with self.assertRaises(ValueError):
                noise.fbm([0, 0], **options)
        with self.assertRaises(ValueError):
            noise.lattice_hash([0.1, 0])
        self.assertTrue(np.isfinite(noise.value_noise([2**20, -(2**20)])))

    def test_actual_sphere_pixels_follow_the_selected_coordinate_space(self):
        import procedural_figures as figures

        p = {**figures.DEFAULTS["fbm-coordinate-space"], "shift": [0, 0]}
        options = {key: p[key] for key in ("octaves", "gain", "lacunarity", "seed")}
        before = figures._sphere_images(p, noise, options)
        assert_array_equal(before["object"], before["world"])
        # 恰好平移十个屏幕样本，比较同一局部材质点的实际显示颜色。
        moved = figures._sphere_images(
            {**p, "shift": [10 * 3.2 / 192, 0]}, noise, options
        )
        assert_allclose(moved["object"][:, 10:], before["object"][:, :-10], atol=1e-12)
        self.assertGreater(
            np.max(np.abs(moved["world"][:, 10:] - before["world"][:, :-10])), 0.05
        )


if __name__ == "__main__":
    unittest.main()
