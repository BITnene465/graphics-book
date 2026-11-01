"""独立坐标手算、周期边界、反射不变量与单像素针孔参考。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

import core


class DirectionMapsTests(unittest.TestCase):
    def test_six_axes_have_declared_image_coordinates(self):
        axes = np.array(
            [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        )
        expected = [[0, 0.5], [0.5, 0.5], [0, 0], [0, 1], [0.25, 0.5], [0.75, 0.5]]
        assert_allclose(core.direction_to_latlong(axes), expected)
        assert_allclose(core.latlong_to_direction(expected), axes, atol=2e-15)
        faces, uv = core.direction_to_cube(axes)
        assert_array_equal(faces, np.arange(6))
        assert_allclose(uv, np.full((6, 2), 0.5))
        assert_allclose(core.cube_to_direction(faces, uv), axes)

    def test_random_direction_roundtrips(self):
        rng = np.random.default_rng(1401)
        values = rng.normal(size=(13, 17, 3))
        expected = values / np.linalg.norm(values, axis=-1, keepdims=True)
        assert_allclose(
            core.latlong_to_direction(core.direction_to_latlong(values)),
            expected,
            atol=3e-15,
        )
        face, uv = core.direction_to_cube(values)
        assert_allclose(core.cube_to_direction(face, uv), expected, atol=5e-16)
        self.assertTrue(np.all((uv >= 0) & (uv <= 1)))

    def test_cube_orientations_and_ties_by_hand(self):
        # +X 面往右走面向 −Z，往下走面向 −Y；+Y 面的下方是 +Z。
        assert_allclose(
            core.cube_to_direction(0, [1, 0.5]), [1 / np.sqrt(2), 0, -1 / np.sqrt(2)]
        )
        assert_allclose(
            core.cube_to_direction(0, [0.5, 1]), [1 / np.sqrt(2), -1 / np.sqrt(2), 0]
        )
        assert_allclose(
            core.cube_to_direction(2, [0.5, 1]), [0, 1 / np.sqrt(2), 1 / np.sqrt(2)]
        )
        face, uv = core.direction_to_cube([1, 1, 1])
        self.assertEqual(face, 0)
        assert_allclose(uv, [0, 0])

    def test_latlong_half_texel_seam_and_vertical_clamp(self):
        image = np.zeros((2, 4, 3))
        image[0, :, 0] = [0, 0.2, 0.6, 1]
        image[1, :, 0] = [0.2, 0.4, 0.8, 0.6]
        # u=0 在最末与最初纹素中心正中；v=0/1 都应夹取到极端一行。
        assert_allclose(core.sample_latlong(image, [0, 0]), [0.5, 0, 0])
        assert_allclose(core.sample_latlong(image, [1, 0]), [0.5, 0, 0])
        assert_allclose(core.sample_latlong(image, [0, -10]), [0.5, 0, 0])
        assert_allclose(core.sample_latlong(image, [0, 10]), [0.4, 0, 0])
        assert_allclose(core.sample_latlong(image, [0.125, 0.25]), image[0, 0])
        left = core.sample_latlong(image, [-1e-8, 0.5])
        right = core.sample_latlong(image, [1e-8, 0.5])
        assert_allclose(left, right, atol=1e-7)
        assert_allclose(
            core.sample_latlong(image, [2.37, 0.4]),
            core.sample_latlong(image, [0.37, 0.4]),
        )

    def test_constant_preservation_and_per_face_clamp_is_not_seamless(self):
        color = np.array([0.17, 0.43, 0.91])
        image = np.broadcast_to(color, (3, 7, 3)).copy()
        assert_allclose(
            core.sample_latlong(image, [[-3, -1], [1, 2], [0.234, 0.7]]),
            np.broadcast_to(color, (3, 3)),
        )
        cube = np.broadcast_to(color, (6, 3, 3, 3)).copy()
        directions = [[1, 0.2, 1], [-2, 5, -1], [0, -1, 0]]
        assert_allclose(
            core.sample_cubemap(cube, directions), np.broadcast_to(color, (3, 3))
        )
        # 不跨面混色：两个面存不同常量时，在选面边界两侧会保留不连续。
        cube[0] = [1, 0, 0]
        cube[4] = [0, 0, 1]
        assert_allclose(core.sample_cubemap(cube, [1 + 1e-6, 0, 1]), [1, 0, 0])
        assert_allclose(core.sample_cubemap(cube, [1, 0, 1 + 1e-6]), [0, 0, 1])

    def test_build_maps_really_sample_the_analytic_function_at_centers(self):
        image = core.build_latlong(8, 4, pattern="direction")
        expected = (
            np.array(
                [
                    np.sin(np.pi / 8) * np.cos(np.pi / 8),
                    np.cos(np.pi / 8),
                    np.sin(np.pi / 8) * np.sin(np.pi / 8),
                ]
            )
            + 1
        ) / 2
        assert_allclose(image[0, 0], expected)
        cube = core.build_cubemap(1, pattern="direction")
        assert_allclose(cube[:, 0, 0], (core.FACE_FORWARD + 1) / 2)

    def test_discrete_direction_maps_approximate_continuous_environment(self):
        directions = np.random.default_rng(91).normal(size=(80, 3))
        reference = core.analytic_environment(directions, pattern="direction")
        latlong = core.sample_latlong(
            core.build_latlong(256, 128, pattern="direction"),
            core.direction_to_latlong(directions),
        )
        cube = core.sample_cubemap(
            core.build_cubemap(64, pattern="direction"), directions
        )
        assert_allclose(latlong, reference, atol=2e-4)
        assert_allclose(cube, reference, atol=0.003)

    def test_zero_directions_and_invalid_coordinates_are_rejected(self):
        for d in ([0, 0, 0], [1, 2], [np.nan, 1, 2]):
            with self.assertRaises(ValueError):
                core.direction_to_latlong(d)
            with self.assertRaises(ValueError):
                core.direction_to_cube(d)
        with self.assertRaises(ValueError):
            core.latlong_to_direction([0, 2])
        with self.assertRaises(ValueError):
            core.cube_to_direction(6, [0.5, 0.5])
        with self.assertRaises(ValueError):
            core.cube_to_direction(0, [-1, 0])
        with self.assertRaises(ValueError):
            core.sample_cubemap(np.zeros((5, 4, 4, 3)), [1, 0, 0])
        assert_allclose(
            core.normalize([1e-300, 1e-300, 0]), [1 / np.sqrt(2), 1 / np.sqrt(2), 0]
        )


class ReflectionAndRenderingTests(unittest.TestCase):
    def test_reflection_sign_angles_unit_length_and_involution(self):
        assert_allclose(core.reflect([1, -1, 0], [0, 2, 0]), [1, 1, 0])
        rng = np.random.default_rng(19)
        incident = core.normalize(rng.normal(size=(35, 3)))
        normal = core.normalize(rng.normal(size=(35, 3)))
        reflected = core.reflect(incident, normal)
        assert_allclose(np.linalg.norm(reflected, axis=-1), 1, atol=8e-16)
        dots = np.sum(incident * normal, axis=-1)
        assert_allclose(np.sum(reflected * normal, axis=-1), -dots, atol=8e-16)
        assert_allclose(
            reflected + dots[:, None] * normal,
            incident - dots[:, None] * normal,
            atol=8e-16,
        )
        assert_allclose(core.reflect(reflected, normal), incident, atol=2e-15)

    def test_environment_is_bounded_continuous_and_rotates_in_declared_direction(self):
        direction = np.random.default_rng(20).normal(size=(200, 3))
        for pattern in ("studio", "direction"):
            image = core.analytic_environment(direction, pattern=pattern)
            self.assertTrue(np.isfinite(image).all())
            self.assertTrue(np.all((image >= 0) & (image <= 1)))
            # 右手绕 +Y 的 +90° 主动旋转：(x,y,z)→(z,y,−x)。
            moved = direction[:, [2, 1, 0]] * [1, 1, -1]
            assert_allclose(
                core.analytic_environment(moved, np.pi / 2, pattern), image, atol=5e-15
            )
            assert_allclose(
                core.analytic_environment([1, 0, -1e-10], pattern=pattern),
                core.analytic_environment([1, 0, 1e-10], pattern=pattern),
                atol=1e-8,
            )
        assert_allclose(
            core.analytic_environment([0, 0, -1], np.pi / 2, "direction"),
            [1, 0.5, 0.5],
            atol=1e-15,
        )

    def test_center_pixel_reflects_back_towards_eye_by_hand(self):
        frame = core.render_sphere(
            size=1, eye=(0, 0, 3), pattern="direction", mode="analytic"
        )
        self.assertTrue(frame["mask"][0, 0])
        assert_allclose(frame["incident"][0, 0], [0, 0, -1])
        assert_allclose(frame["points"][0, 0], [0, 0, 1])
        assert_allclose(frame["normals"][0, 0], [0, 0, 1])
        assert_allclose(frame["reflected"][0, 0], [0, 0, 1])
        assert_allclose(frame["image"][0, 0], [0.5, 0.5, 1])

    def test_offcenter_pixel_uses_independent_pinhole_and_quadratic_reference(self):
        size, row, col, radius = 9, 3, 5, 1.0
        frame = core.render_sphere(
            size=size,
            eye=(0, 0, 3),
            fov=40,
            radius=radius,
            mode="analytic",
            pattern="direction",
        )
        # 不调用 core.camera_rays / reflect / environment：直接手写针孔、二次式与通道编码。
        a = np.tan(np.deg2rad(20))
        direction = np.array(
            [(2 * (col + 0.5) / size - 1) * a, (1 - 2 * (row + 0.5) / size) * a, -1]
        )
        direction /= np.sqrt(np.dot(direction, direction))
        origin = np.array([0, 0, 3])
        roots = np.roots(
            [
                np.dot(direction, direction),
                2 * np.dot(origin, direction),
                np.dot(origin, origin) - radius**2,
            ]
        )
        distance = np.min(roots[roots > 0])
        point = origin + distance * direction
        normal = point / radius
        reflected = direction - 2 * np.dot(direction, normal) * normal
        self.assertTrue(frame["mask"][row, col])
        assert_allclose(frame["incident"][row, col], direction, atol=1e-15)
        assert_allclose(frame["points"][row, col], point, atol=2e-14)
        assert_allclose(frame["image"][row, col], (reflected + 1) / 2, atol=2e-14)

    def test_background_and_invalid_geometry_buffers_are_finite(self):
        frame = core.render_sphere(
            size=11, eye=(0, 0, 3), fov=90, mode="analytic", pattern="direction"
        )
        background = ~frame["mask"]
        self.assertTrue(background.any())
        assert_allclose(
            frame["image"][background], (frame["incident"][background] + 1) / 2
        )
        for key in ("points", "normals", "reflected"):
            assert_array_equal(frame[key][background], 0)
        for value in frame.values():
            self.assertTrue(np.isfinite(value).all())
        assert_allclose(
            core.latlong_to_direction(frame["uv"])[background],
            frame["incident"][background],
            atol=1e-15,
        )

    def test_translating_camera_target_and_sphere_does_not_change_infinite_environment_image(
        self,
    ):
        shift = np.array([2.0, -3.0, 1.0])
        for mode in ("analytic", "latlong", "cube"):
            first = core.render_sphere(size=21, mode=mode, map_size=16)
            second = core.render_sphere(
                size=21,
                mode=mode,
                map_size=16,
                eye=np.array([3, 2, 5]) + shift,
                target=shift,
                center=shift,
            )
            assert_array_equal(second["mask"], first["mask"])
            assert_allclose(second["image"], first["image"], atol=3e-14)
            assert_allclose(
                second["points"][first["mask"]],
                first["points"][first["mask"]] + shift,
                atol=2e-14,
            )

    def test_analytic_and_sampled_render_paths_and_inside_sphere(self):
        reference = core.render_sphere(size=25, mode="analytic", pattern="direction")
        for mode in ("latlong", "cube"):
            frame = core.render_sphere(
                size=25, mode=mode, map_size=128, pattern="direction"
            )
            assert_allclose(frame["image"], reference["image"], atol=0.007)
        inside = core.render_sphere(
            size=1, eye=(0, 0, 0), target=(0, 0, -1), mode="analytic"
        )
        self.assertTrue(inside["mask"][0, 0])
        assert_allclose(inside["points"][0, 0], [0, 0, -1])

    def test_rotated_environment_returns_the_actual_unrotated_map_address(self):
        yaw, resolution = 0.73, 32
        reference = core.render_sphere(size=19, mode="analytic", pattern="direction")
        world_query = np.where(
            reference["mask"][..., None],
            reference["reflected"],
            reference["incident"],
        )
        # 列向量的逆旋转 R_y(−yaw)，独立写成矩阵后用行向量右乘转置。
        c, s = np.cos(yaw), np.sin(yaw)
        inverse_rotation = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
        expected_local = world_query @ inverse_rotation.T
        for mode in ("analytic", "latlong", "cube"):
            frame = core.render_sphere(
                size=19,
                env_yaw=yaw,
                mode=mode,
                map_size=resolution,
                pattern="direction",
            )
            assert_allclose(frame["lookup_direction"], expected_local, atol=2e-15)
            assert_allclose(frame["reflected"], reference["reflected"])
            assert_allclose(
                core.latlong_to_direction(frame["uv"]), expected_local, atol=2e-15
            )
            assert_allclose(
                core.cube_to_direction(frame["face"], frame["face_uv"]),
                expected_local,
                atol=2e-15,
            )
            if mode == "analytic":
                expected_color = (expected_local + 1) / 2
            elif mode == "latlong":
                baseline = core.build_latlong(
                    2 * resolution, resolution, pattern="direction"
                )
                expected_color = core.sample_latlong(baseline, frame["uv"])
            else:
                baseline = core.build_cubemap(resolution, pattern="direction")
                expected_color = core.sample_cubemap(baseline, expected_local)
            assert_allclose(frame["image"], expected_color, atol=1e-15)
        # 正对眼睛的镜面点查询世界 +Z；旋转 +90° 后实际访问基准图 −X。
        pixel = core.render_sphere(
            size=1,
            eye=(0, 0, 3),
            env_yaw=np.pi / 2,
            mode="analytic",
            pattern="direction",
        )
        assert_allclose(pixel["image"][0, 0], [0, 0.5, 0.5], atol=1e-15)
        assert_allclose(pixel["uv"][0, 0], [0.5, 0.5])
        self.assertEqual(pixel["face"][0, 0], 1)

    def test_invalid_render_parameters(self):
        for parameters in (
            dict(radius=0),
            dict(size=0),
            dict(mode="unknown"),
            dict(pattern="unknown"),
            dict(eye=(0, 0, 0)),
            dict(fov=180),
            dict(env_yaw=np.nan),
        ):
            with self.assertRaises(ValueError):
                core.render_sphere(**parameters)


if __name__ == "__main__":
    unittest.main()
