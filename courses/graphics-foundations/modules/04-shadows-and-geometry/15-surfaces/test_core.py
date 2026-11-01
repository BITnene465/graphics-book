"""手算曲面、方向/尺度、两轮构造和真实退化情形；不依赖界面。"""

import unittest

import numpy as np
from numpy.testing import assert_allclose

from core import (
    de_casteljau_patch,
    evaluate_patch,
    join_diagnostics,
    patch_mesh,
    stitch_patches,
    surface_frame,
    surface_partials,
)


PLANE = np.array([[[0, 0, 1], [0, 3, 0]], [[2, 0, 2], [2, 3, 1]]], float)
SADDLE = np.array([[[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 1]]], float)


def cubic_pair():
    left = np.zeros((4, 4, 3))
    right = np.zeros_like(left)
    for i, (x, z) in enumerate(zip([-2, -1.8, -1, 0], [0, 0.2, 0.3, 0])):
        for j in range(4):
            left[i, j] = [x, j / 3, z + 0.2 * x * j / 3]
            right[i, j] = [0.2 + i, j / 3, 0.2 * (i + j)]
    return left, right


class PatchTests(unittest.TestCase):
    def test_broadcast_plane_and_corners(self):
        u, v = np.array([0, 0.25, 1])[:, None], np.array([0, 0.5, 1])[None, :]
        points = evaluate_patch(PLANE, u, v)
        ub, vb = np.broadcast_arrays(u, v)
        assert_allclose(points, np.stack([2 * ub, 3 * vb, 1 + ub - vb], axis=-1))
        for i in (0, 1):
            for j in (0, 1):
                assert_allclose(evaluate_patch(PLANE, i, j), PLANE[i, j])

    def test_hand_computed_two_stage_interpolation(self):
        # 在双线性鞍面先取 u=1/4，得到沿 v 的两控制点。
        result = de_casteljau_patch(SADDLE, 0.25, 0.5)
        self.assertEqual(
            [x.shape for x in result["first_levels"]], [(2, 2, 3), (1, 2, 3)]
        )
        assert_allclose(result["intermediate"], [[0.25, 0, 0], [0.25, 1, 0.25]])
        assert_allclose(result["position"], [0.25, 0.5, 0.125])
        other = de_casteljau_patch(SADDLE, 0.25, 0.5, order="v")
        assert_allclose(other["intermediate"], [[0, 0.5, 0], [1, 0.5, 0.5]])
        assert_allclose(other["position"], result["position"])
        result["first_levels"][0][0, 0] = 100
        assert_allclose(SADDLE[0, 0], [0, 0, 0])

    def test_nonsquare_degrees_and_both_construction_orders(self):
        rng = np.random.default_rng(25)
        control = rng.normal(size=(4, 3, 3))
        for u, v in [(0, 0), (0.2, 0.7), (1, 1)]:
            expected = evaluate_patch(control, u, v)
            for order in ("u", "v"):
                result = de_casteljau_patch(control, u, v, order)
                assert_allclose(result["position"], expected, atol=1e-14)
                self.assertEqual(
                    result["intermediate"].shape, (3 if order == "u" else 4, 3)
                )

    def test_plane_differentials_normal_area_and_curvature(self):
        frame = surface_frame(PLANE, 0.37, 0.81)
        assert_allclose(frame["du"], [2, 0, 1])
        assert_allclose(frame["dv"], [0, 3, -1])
        for name in ("duu", "duv", "dvv"):
            assert_allclose(frame[name], 0)
        assert_allclose(frame["cross"], [-3, 2, 6])
        assert_allclose(frame["area"], 7)
        assert_allclose(frame["normal"], np.array([-3, 2, 6]) / 7)
        self.assertTrue(frame["regular"])
        assert_allclose([frame["mean_curvature"], frame["gaussian_curvature"]], 0)

    def test_saddle_independent_first_second_derivatives_and_curvatures(self):
        u, v = np.array([0, 0.3, 0.8]), np.array([0, 0.6, 0.2])
        frame = surface_frame(SADDLE, u, v)
        zeros, ones = np.zeros(3), np.ones(3)
        assert_allclose(frame["position"], np.stack([u, v, u * v], axis=-1))
        assert_allclose(frame["du"], np.stack([ones, zeros, v], axis=-1))
        assert_allclose(frame["dv"], np.stack([zeros, ones, u], axis=-1))
        assert_allclose(frame["duv"], [[0, 0, 1]] * 3)
        assert_allclose(frame["duu"], 0)
        assert_allclose(frame["dvv"], 0)
        determinant = 1 + u * u + v * v
        assert_allclose(frame["area"], np.sqrt(determinant))
        assert_allclose(frame["mean_curvature"], -u * v / determinant**1.5)
        assert_allclose(frame["gaussian_curvature"], -1 / determinant**2)

    def test_quadratic_paraboloid_curvature_and_orientation(self):
        # S=(u,v,(u²+v²)/2)，原点向上的两个主曲率都是 +1。
        control = np.array(
            [
                [[i / 2, j / 2, (i * (i - 1) + j * (j - 1)) / 4] for j in range(3)]
                for i in range(3)
            ]
        )
        frame = surface_frame(control, 0, 0)
        assert_allclose(frame["duu"], [0, 0, 1])
        assert_allclose(frame["dvv"], [0, 0, 1])
        assert_allclose(frame["duv"], 0)
        assert_allclose([frame["mean_curvature"], frame["gaussian_curvature"]], [1, 1])
        reversed_frame = surface_frame(control[::-1], 1, 0)
        assert_allclose(reversed_frame["normal"], -frame["normal"])
        assert_allclose(
            [reversed_frame["mean_curvature"], reversed_frame["gaussian_curvature"]],
            [-1, 1],
        )

    def test_partial_derivatives_independent_finite_differences(self):
        control = np.random.default_rng(5).normal(size=(4, 4, 3))
        u, v, h = 0.4, 0.6, 1e-4
        part = surface_partials(control, u, v)
        centre = evaluate_patch(control, u, v)
        plus_u, minus_u = evaluate_patch(control, u + h, v), evaluate_patch(
            control, u - h, v
        )
        plus_v, minus_v = evaluate_patch(control, u, v + h), evaluate_patch(
            control, u, v - h
        )
        assert_allclose(part["du"], (plus_u - minus_u) / (2 * h), atol=1e-7)
        assert_allclose(part["dv"], (plus_v - minus_v) / (2 * h), atol=1e-7)
        assert_allclose(part["duu"], (plus_u - 2 * centre + minus_u) / h**2, atol=2e-7)
        assert_allclose(part["dvv"], (plus_v - 2 * centre + minus_v) / h**2, atol=2e-7)
        mixed = (
            evaluate_patch(control, u + h, v + h)
            - evaluate_patch(control, u + h, v - h)
            - evaluate_patch(control, u - h, v + h)
            + evaluate_patch(control, u - h, v - h)
        ) / (4 * h**2)
        assert_allclose(part["duv"], mixed, atol=5e-7)

    def test_affine_covariance_and_reflection_orientation(self):
        control = np.random.default_rng(7).normal(size=(4, 3, 3))
        transform = np.array([[-2, 0.3, 0], [0.1, 1.2, 0.4], [0, 0.2, 0.7]])
        translation = np.array([4, -2, 8])
        old = surface_frame(control, [0.2, 0.7], [0.4, 0.8])
        new = surface_frame(control @ transform.T + translation, [0.2, 0.7], [0.4, 0.8])
        assert_allclose(new["position"], old["position"] @ transform.T + translation)
        for key in ("du", "dv", "duu", "duv", "dvv"):
            assert_allclose(new[key], old[key] @ transform.T, atol=2e-14)
        expected_cross = (
            np.linalg.det(transform) * old["cross"] @ np.linalg.inv(transform)
        )
        assert_allclose(new["cross"], expected_cross, atol=2e-14)
        assert_allclose(
            new["normal"],
            expected_cross / np.linalg.norm(expected_cross, axis=-1, keepdims=True),
        )

    def test_uniform_scale_preserves_regularity_and_curvature_units(self):
        baseline = surface_frame(SADDLE, 0.3, 0.4)
        for scale in (1e-40, 0.1, 10, 1e40):
            result = surface_frame(SADDLE * scale, 0.3, 0.4)
            self.assertTrue(result["regular"])
            assert_allclose(result["normal"], baseline["normal"])
            assert_allclose(result["area"] / scale / scale, baseline["area"])
            assert_allclose(
                result["mean_curvature"] * scale, baseline["mean_curvature"]
            )
            assert_allclose(
                result["gaussian_curvature"] * scale * scale,
                baseline["gaussian_curvature"],
            )

    def test_degree_zero_and_degenerate_boundary_have_no_fabricated_normals(self):
        point = np.array([[[2, 3, 4]]])
        frame = surface_frame(point, [0, 0.5], 1)
        assert_allclose(frame["position"], [[2, 3, 4]] * 2)
        self.assertFalse(np.any(frame["regular"]))
        self.assertTrue(np.isnan(frame["normal"]).all())
        self.assertTrue(np.isnan(frame["mean_curvature"]).all())
        assert_allclose(frame["area"], 0)
        # S=(u,u*v,0)：u=0 整条参数边缩成一个点，内部仍是正则平面。
        folded = [[[0, 0, 0], [0, 0, 0]], [[1, 0, 0], [1, 1, 0]]]
        result = surface_frame(folded, [0, 0.25], 0.4)
        self.assertEqual(result["regular"].tolist(), [False, True])
        self.assertTrue(np.isnan(result["normal"][0]).all())
        assert_allclose(result["normal"][1], [0, 0, 1])

    def test_nearly_parallel_tangents_use_dimensionless_threshold(self):
        control = [[[0, 0, 0], [1, 1e-14, 0]], [[1, 0, 0], [2, 1e-14, 0]]]
        frame = surface_frame(control, 0.5, 0.5)
        self.assertFalse(frame["regular"])
        self.assertGreater(frame["area"], 0)
        self.assertTrue(np.isnan(frame["gaussian_curvature"]))
        self.assertTrue(surface_frame(control, 0.5, 0.5, tolerance=1e-16)["regular"])

    def test_mesh_uv_winding_shared_vertices_and_analytic_normals(self):
        mesh = patch_mesh(PLANE, (2, 3))
        self.assertEqual(mesh["vertices"].shape, (12, 3))
        self.assertEqual(mesh["faces"].shape, (12, 3))
        assert_allclose(mesh["vertices"], evaluate_patch(PLANE, *mesh["uv"].T))
        triangles = mesh["vertices"][mesh["faces"]]
        face_cross = np.cross(
            triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
        )
        self.assertTrue(np.all(face_cross @ np.array([-3, 2, 6]) > 0))
        assert_allclose(mesh["normals"], np.tile(np.array([-3, 2, 6]) / 7, (12, 1)))
        self.assertTrue(mesh["regular"].all())
        # 2×3 个格子，面积合计恰好是参数域上的常数 |Su×Sv|=7。
        assert_allclose(np.linalg.norm(face_cross, axis=-1).sum() / 2, 7)

    def test_invalid_inputs_and_nonfinite_data(self):
        calls = [
            lambda: evaluate_patch([], 0, 0),
            lambda: evaluate_patch(np.zeros((4, 4, 2)), 0, 0),
            lambda: evaluate_patch(PLANE * np.nan, 0, 0),
            lambda: evaluate_patch(PLANE, -0.1, 0),
            lambda: evaluate_patch(PLANE, np.inf, 0),
            lambda: de_casteljau_patch(PLANE, [0.2], 0.3),
            lambda: de_casteljau_patch(PLANE, 0.2, 0.3, "x"),
            lambda: surface_frame(PLANE, 0, 0, tolerance=1),
            lambda: patch_mesh(PLANE, 0),
            lambda: patch_mesh(PLANE, True),
            lambda: patch_mesh(PLANE, (2, 2.5)),
        ]
        for call in calls:
            with self.subTest(call=call), self.assertRaises(ValueError):
                call()


class SeamTests(unittest.TestCase):
    def test_unequal_spans_hand_calculated_c2_control_rows(self):
        left, right = cubic_pair()
        original_left, original_right = left.copy(), right.copy()
        a, b = stitch_patches(left, right, "C2", left_span=2, right_span=3)
        # 在 v=0：P3=(0,0,0)，P2=(-1,0,.3)，P1=(-1.8,0,.2)。
        assert_allclose(b[0, 0], [0, 0, 0])
        assert_allclose(b[1, 0], [1.5, 0, -0.45])
        assert_allclose(b[2, 0], [3.45, 0, -1.8])
        assert_allclose(b[3], original_right[3])
        assert_allclose(left, original_left)
        assert_allclose(right, original_right)
        self.assertFalse(np.shares_memory(a, left))
        self.assertFalse(np.shares_memory(b, right))
        report = join_diagnostics(a, b, left_span=2, right_span=3)
        self.assertTrue(report["c2"])
        assert_allclose(report["left_du"][0], [1.5, 0, -0.45])
        assert_allclose(report["left_duu"][0], [0.3, 0, -0.6])
        assert_allclose(report["duu_gap"], 0, atol=2e-15)
        self.assertTrue(report["g1"])

    def test_each_join_mode_changes_only_necessary_rows(self):
        left, right = cubic_pair()
        for mode, count in (("free", 0), ("C0", 1), ("G1", 2), ("C1", 2), ("C2", 3)):
            with self.subTest(mode=mode):
                a, b = stitch_patches(left, right, mode, tangent_scale=2)
                assert_allclose(a, left)
                assert_allclose(b[count:], right[count:])
                report = join_diagnostics(a, b)
                if mode != "free":
                    self.assertTrue(report["c0"])
                if mode in ("G1", "C1", "C2"):
                    self.assertTrue(report["g1"])
                if mode in ("C1", "C2"):
                    self.assertTrue(report["c1"])
                if mode == "C2":
                    self.assertTrue(report["c2"])
                if mode == "G1":
                    self.assertFalse(report["c1"])

    def test_g1_transverse_ratio_is_sufficient_not_necessary(self):
        # 平面右片沿 u 同时向 v 方向剪切；切平面一致，横向导数并不同向。
        left = np.array([[[i / 3 - 1, j / 3, 0] for j in range(4)] for i in range(4)])
        right = np.array(
            [[[i / 3, j / 3 + i / 6, 0] for j in range(4)] for i in range(4)]
        )
        report = join_diagnostics(left, right)
        self.assertTrue(report["g1"])
        self.assertTrue(report["c0"])
        self.assertFalse(report["c1"])
        self.assertFalse(report["proportional_cross_tangents"].any())
        assert_allclose(report["normal_angle_degrees"], 0)

    def test_opposite_orientations_are_not_g1_extension(self):
        left = np.array([[[i / 3 - 1, j / 3, 0] for j in range(4)] for i in range(4)])
        right = np.array([[[-i / 3, j / 3, 0] for j in range(4)] for i in range(4)])
        report = join_diagnostics(left, right)
        self.assertTrue(report["c0"])
        self.assertTrue(report["g1_defined"].all())
        self.assertFalse(report["g1"])
        assert_allclose(report["normal_angle_degrees"], 180)

    def test_matching_zero_derivatives_do_not_define_tangent_planes(self):
        left = np.zeros((4, 4, 3))
        left[:, :, 1] = np.arange(4) / 3
        for mode in ("G1", "C2"):
            a, b = stitch_patches(left, left, mode)
            report = join_diagnostics(a, b, v=[0, 0.5, 1])
            self.assertTrue(report["c2"])
            self.assertFalse(report["g1"])
            self.assertFalse(report["g1_defined"].any())
            self.assertTrue(np.isnan(report["normal_angle_degrees"]).all())
            self.assertFalse(report["proportional_cross_tangents"].any())

    def test_position_gap_prevents_geometric_and_parametric_continuity(self):
        left, right = cubic_pair()
        a, b = stitch_patches(left, right, "C2")
        b[:, :, 2] += 0.1
        report = join_diagnostics(a, b)
        assert_allclose(report["position_error"], 0.1)
        self.assertFalse(report["c0"])
        self.assertFalse(report["c1"])
        self.assertFalse(report["c2"])
        self.assertFalse(report["g1"])

    def test_invalid_seam_inputs(self):
        left, right = cubic_pair()
        for call in [
            lambda: stitch_patches(PLANE, right),
            lambda: stitch_patches(left, right, "G0"),
            lambda: stitch_patches(left, right, left_span=0),
            lambda: stitch_patches(left, right, right_span=np.inf),
            lambda: stitch_patches(left, right, tangent_scale=-1),
            lambda: join_diagnostics(left, right, v=[]),
            lambda: join_diagnostics(left, right, v=[1.1]),
            lambda: join_diagnostics(left, right, tolerance=0),
        ]:
            with self.subTest(call=call), self.assertRaises(ValueError):
                call()


if __name__ == "__main__":
    unittest.main()
