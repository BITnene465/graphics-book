"""手算、数值微分与真实缓冲不变量；不拿示意轮廓替代光栅输出。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose, assert_array_equal

import surface_maps as maps


class SurfaceMapTests(unittest.TestCase):
    def test_height_and_normal_by_hand(self):
        # u=1/4, v=0, f=1 时 h=0, h_u=-2πA；取 A=2.4/(2π) 得 h_x=-1。
        sample = maps.surface_sample(
            [0.25, 0], amplitude=2.4 / (2 * np.pi), frequency=1
        )
        assert_allclose(
            [sample["height"], sample["du"], sample["dv"]], [0, -2.4, 0], atol=1e-14
        )
        assert_allclose(sample["normal"], np.array([1, 0, 1]) / np.sqrt(2), atol=1e-14)
        assert_allclose(
            maps.decode_normal(sample["encoded"]), sample["normal"], atol=1e-14
        )

    def test_height_derivatives_by_independent_finite_difference(self):
        uv = np.random.default_rng(19).uniform(0.02, 0.98, (40, 2))
        h, du, dv = maps.height_field(uv, 0.37, 2.75, 0.1)
        for axis, derivative in enumerate((du, dv)):
            step = np.eye(2)[axis] * 1e-6
            measured = (
                maps.height_field(uv + step, 0.37, 2.75, 0.1)[0]
                - maps.height_field(uv - step, 0.37, 2.75, 0.1)[0]
            ) / 2e-6
            assert_allclose(measured, derivative, atol=2e-9)
        sample = maps.surface_sample(uv, 0.37, 2.75)
        shifted = maps.surface_sample(uv, 0.37, 2.75, offset=0.8)
        assert_allclose(shifted["height"] - sample["height"], 0.8)
        assert_array_equal(shifted["normal"], sample["normal"])
        pu = np.column_stack([np.full(40, 2.4), np.zeros(40), du])
        pv = np.column_stack([np.zeros(40), np.full(40, 1.8), dv])
        assert_allclose(np.sum(sample["normal"] * pu, axis=-1), 0, atol=1e-14)
        assert_allclose(np.sum(sample["normal"] * pv, axis=-1), 0, atol=1e-14)

    def test_normal_data_decode_and_tangent_basis(self):
        basis = maps.tangent_frame([0, 2, 0], [-3, 0, 0])
        assert_allclose(basis.T @ basis, np.eye(3))
        assert_allclose(maps.decode_normal([1, 0.5, 0.5], basis), [0, 1, 0])
        assert_allclose(maps.decode_normal([0.5, 1, 0.5], basis), [-1, 0, 0])
        assert_allclose(maps.decode_normal([0.5, 0.5, 1], basis), [0, 0, 1])
        # 错把中性法线当 sRGB：.5 变成约 .214，导致 x/y 不再为零。
        encoded = np.array([0.5, 0.5, 1.0])
        decoded_as_color = np.where(
            encoded <= 0.04045, encoded / 12.92, ((encoded + 0.055) / 1.055) ** 2.4
        )
        wrong = maps.decode_normal(decoded_as_color)
        self.assertGreater(np.rad2deg(np.arccos(wrong[2])), 38)
        self.assertLess(wrong[0], -0.4)

    def test_tangent_frame_orthogonalizes_uv_and_ignores_length_units(self):
        # p_v 含 T 分量；分别单位化两条 UV 切向量不会得到正交框架。
        for scale in (1e-200, 1, 1e200):
            basis = maps.tangent_frame(
                np.array([2, 0, 0]) * scale, np.array([3, 4, 0]) * scale
            )
            assert_allclose(basis, np.eye(3), atol=1e-15)
            assert_allclose(maps.decode_normal([0.5, 1, 0.5], basis), [0, 1, 0])
        for first, second in (([0, 0, 0], [0, 1, 0]), ([1, 0, 0], [1, 1e-14, 0])):
            with self.assertRaises(ValueError):
                maps.tangent_frame(first, second)

    def test_constant_height_has_no_bump_but_moves_geometry(self):
        result = maps.render_surface_maps(size=64, divisions=4, amplitude=0, offset=0.3)
        flat, bump, displaced = [
            result["frames"][name] for name in ("flat", "bump", "displacement")
        ]
        assert_array_equal(flat["image"], bump["image"])
        assert_allclose(displaced["vertices"][:, 2], 0.3)
        assert_allclose(
            displaced["normal"][displaced["owner"] >= 0],
            np.tile([0, 0, 1], ((displaced["owner"] >= 0).sum(), 1)),
        )
        self.assertGreater(
            np.count_nonzero((flat["owner"] >= 0) != (displaced["owner"] >= 0)), 20
        )

    def test_zero_height_all_three_paths_identical(self):
        result = maps.render_surface_maps(size=64, amplitude=0, divisions=4)
        for name in ("bump", "displacement"):
            for key in ("owner", "depth", "world", "uv", "normal", "image"):
                assert_array_equal(
                    result["frames"]["flat"][key], result["frames"][name][key]
                )

    def test_bump_cannot_change_geometry_or_visibility(self):
        result = maps.render_surface_maps(size=96, amplitude=0.45, divisions=8)
        flat, bump = result["frames"]["flat"], result["frames"]["bump"]
        for key in (
            "owner",
            "depth",
            "world",
            "uv",
            "weights",
            "vertices",
            "clip_vertices",
        ):
            self.assertIs(flat[key], bump[key])
            assert_array_equal(flat[key], bump[key])
        self.assertGreater(np.max(np.abs(flat["image"] - bump["image"])), 0.2)
        mask = bump["owner"] >= 0
        assert_allclose(np.linalg.norm(bump["normal"][mask], axis=-1), 1, atol=3e-15)

    def test_displacement_changes_actual_silhouette_and_depth(self):
        result = maps.render_surface_maps(size=96, amplitude=0.3, divisions=12)
        flat, moved = result["frames"]["flat"], result["frames"]["displacement"]
        mask, changed = flat["owner"] >= 0, moved["owner"] >= 0
        self.assertGreater(np.count_nonzero(mask != changed), 180)
        both = mask & changed
        self.assertGreater(
            np.max(np.abs(flat["depth"][both] - moved["depth"][both])), 0.0003
        )
        assert_allclose(
            moved["local_vertices"][:, 2],
            maps.height_field(moved["vertex_uv"], 0.3, 1.5)[0],
        )
        assert_array_equal(flat["faces"], moved["faces"])

    def test_overlapping_displaced_faces_keep_nearest_depth(self):
        frame = maps.render_surface_maps(
            size=48, amplitude=0.6, frequency=2, divisions=8, eye=(3, 1, 2.5), fov=60
        )["frames"]["displacement"]
        clip = frame["clip_vertices"]
        ndc = clip[:, :3] / clip[:, 3, None]
        self.assertTrue(np.all(np.abs(ndc) < 1))  # 本例全部在视锥内，不需裁剪。
        xy = np.rint((ndc[:, :2] + 1) * 24 * 256) / 256
        rows, cols = np.mgrid[:48, :48]
        points = np.stack([cols + 0.5, 47.5 - rows, np.ones_like(cols)], axis=-1)
        points = points.reshape(-1, 3)
        nearest = np.full(len(points), np.inf)
        owner = np.full(len(points), -1)
        hit_count = np.zeros(len(points), int)
        # 独立解线性方程求屏幕重心坐标，不调用待测光栅器的边函数/深度更新。
        for index, face in enumerate(frame["faces"]):
            matrix = np.vstack([xy[face].T, np.ones(3)])
            if abs(np.linalg.det(matrix)) < 1e-8:
                continue
            bary = np.linalg.solve(matrix, points.T).T
            inside = bary.min(axis=1) > 1e-3  # 避开 top-left 共享边归属。
            hit_count += inside
            candidate = (bary @ ndc[face, 2] + 1) / 2
            update = inside & (candidate < nearest)
            nearest[update], owner[update] = candidate[update], index
        overlap = hit_count > 1
        self.assertGreater(overlap.sum(), 50)
        assert_array_equal(frame["owner"].ravel()[overlap], owner[overlap])
        assert_allclose(frame["depth"].ravel()[overlap], nearest[overlap], atol=5e-15)

    def test_vertex_aliasing_does_not_erase_analytic_shading_normals(self):
        aliased = maps.render_surface_maps(
            size=48, amplitude=0.25, frequency=4, divisions=4
        )["frames"]["displacement"]
        constant = maps.render_surface_maps(
            size=48, amplitude=0, offset=0.25, divisions=4
        )["frames"]["displacement"]
        # f=4 的每个采样顶点都是波峰；真实网格无法保存顶点之间的起伏。
        assert_allclose(aliased["local_vertices"][:, 2], 0.25, atol=1e-15)
        assert_array_equal(aliased["owner"], constant["owner"])
        assert_allclose(aliased["depth"], constant["depth"], atol=1e-15)
        mask = aliased["owner"] >= 0
        # 着色仍查询连续高度场，因而不能把它称作这个平面网格的几何法线。
        self.assertGreater(
            np.max(np.abs(aliased["normal"][mask] - constant["normal"][mask])), 0.8
        )

    def test_pixel_buffers_reconstruct_original_vertices_after_clipping(self):
        result = maps.render_surface_maps(
            size=80, amplitude=0.4, divisions=5, eye=(0, 0, 3), near=2.9, far=3.15
        )
        frame = result["frames"]["displacement"]
        mask = frame["owner"] >= 0
        self.assertGreater(mask.sum(), 50)
        ids, weights = frame["faces"][frame["owner"][mask]], frame["weights"][mask]
        assert_allclose(weights.sum(axis=1), 1, atol=1e-14)
        assert_allclose(
            np.einsum("ni,nij->nj", weights, frame["vertices"][ids]),
            frame["world"][mask],
            atol=1e-14,
        )
        assert_allclose(
            np.einsum("ni,nij->nj", weights, frame["vertex_uv"][ids]),
            frame["uv"][mask],
            atol=1e-14,
        )
        # 本相机沿 -Z，实际世界位置到相机的深度是 3-z；不得把超范围顶点硬夹边。
        distance = 3 - frame["world"][mask, 2]
        self.assertGreaterEqual(distance.min(), 2.9 - 1e-12)
        self.assertLessEqual(distance.max(), 3.15 + 1e-12)
        self.assertGreaterEqual(frame["depth"][mask].min(), -1e-12)
        self.assertLessEqual(frame["depth"][mask].max(), 1 + 1e-12)
        assert_allclose(
            result["frames"]["flat"]["depth"][result["frames"]["flat"]["owner"] >= 0],
            3.15 / (3.15 - 2.9) * (1 - 2.9 / 3),
            atol=1e-14,
        )

    def test_near_far_and_behind_camera_exclusion(self):
        for options in (
            dict(near=4, far=6),
            dict(near=0.1, far=2),
            dict(position=(0, 0, 5)),
        ):
            result = maps.render_surface_maps(
                size=32, divisions=4, eye=(0, 0, 3), **options
            )
            for frame in result["frames"].values():
                self.assertFalse(np.any(frame["owner"] >= 0))
                self.assertTrue(np.isinf(frame["depth"]).all())
                assert_allclose(
                    frame["image"],
                    np.broadcast_to(maps.BACKGROUND, frame["image"].shape),
                )

    def test_nonuniform_transform_normals_stay_orthogonal(self):
        linear = np.array([[2.0, 0.3, 0], [0, 0.6, 0], [0, 0, 1.3]])
        result = maps.render_surface_maps(size=64, divisions=5, linear=linear)
        frame = result["frames"]["bump"]
        mask = frame["owner"] >= 0
        _, du, dv = maps.height_field(frame["uv"][mask])
        tangent_u = (
            np.column_stack([np.full(len(du), 2.4), np.zeros(len(du)), du]) @ linear.T
        )
        tangent_v = (
            np.column_stack([np.zeros(len(du)), np.full(len(du), 1.8), dv]) @ linear.T
        )
        assert_allclose(
            np.sum(frame["normal"][mask] * tangent_u, axis=-1), 0, atol=2e-14
        )
        assert_allclose(
            np.sum(frame["normal"][mask] * tangent_v, axis=-1), 0, atol=2e-14
        )
        wrong = maps.lighting.normalize(maps.height_normal(du, dv) @ linear.T)
        self.assertGreater(np.max(np.abs(np.sum(wrong * tangent_u, axis=-1))), 0.5)

    def test_refinement_reduces_geometry_error_not_bump_detail(self):
        errors = []
        for divisions in (4, 24):
            frame = maps.render_surface_maps(size=80, divisions=divisions)["frames"][
                "displacement"
            ]
            mask = frame["owner"] >= 0
            reference = maps.height_field(frame["uv"][mask])[0]
            errors.append(np.mean(np.abs(frame["world"][mask, 2] - reference)))
        self.assertLess(errors[1], errors[0] / 10)

    def test_light_drag_reuses_geometry_but_matches_fresh_render(self):
        frame = maps.render_surface_maps(size=48, divisions=4)
        light = [4, -2, 5]
        changed = maps.relight_surface_maps(frame, light)
        fresh = maps.render_surface_maps(size=48, divisions=4, light=light)
        for name in frame["frames"]:
            self.assertIs(
                changed["frames"][name]["owner"], frame["frames"][name]["owner"]
            )
            assert_array_equal(changed["images"][name], fresh["images"][name])
        self.assertGreater(
            np.max(np.abs(changed["images"]["bump"] - frame["images"]["bump"])), 0.1
        )

    def test_invalid_data_is_explicit(self):
        for encoded in ([0.5, 0.5, 0.5], [1.1, 0, 0], [0, float("nan"), 1]):
            with self.assertRaises(ValueError):
                maps.decode_normal(encoded)
        with self.assertRaises(ValueError):
            maps.tangent_frame([1, 0, 0], [2, 0, 0])
        with self.assertRaises(ValueError):
            maps.decode_normal([0.5, 0.5, 1], np.diag([1, 1, 2]))
        with self.assertRaises(ValueError):
            maps.decode_normal([0.5, 0.5, 1], np.diag([1, 1, 1 + 1e-7]))
        with self.assertRaises(ValueError):
            maps.decode_normal([0.5, 0.5, 1], np.diag([1, -1, 1]))
        for options in (
            dict(divisions=0),
            dict(near=3, far=2),
            dict(linear=np.diag([1, 0, 1])),
            dict(amplitude=float("nan")),
            dict(frequency=-1),
        ):
            with self.assertRaises(ValueError):
                maps.render_surface_maps(size=16, **options)


if __name__ == "__main__":
    unittest.main()
