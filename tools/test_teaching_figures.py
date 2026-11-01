"""教学插图的独立算例与完整参数遍历；不启动 HTTP 服务或浏览器。"""

import copy
import itertools
import json
from pathlib import Path
import sys
import unittest

import numpy as np
from numpy.testing import assert_allclose

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import teaching_figures as figures
import studio_render


def frame(identifier, progress=1, **params):
    return figures.render(identifier, params, progress)


def lines(result, color, width):
    return [
        np.asarray(item["points"])
        for item in result["items"]
        if item["kind"] == "line" and item["color"] == color and item["width"] == width
    ]


class TeachingFigures(unittest.TestCase):
    def test_mipmap_diagram_queries_actual_linear_levels(self):
        core = studio_render._core("07")
        uv = [0.36, 0.63]
        pyramid = core.build_mipmaps(core.checker_texture(16, 6))
        for lod in (0, 1.35, 3.999, 4):
            result = frame("mipmap-levels", lod=lod, point=uv, frequency=6)
            expected = core.sample_trilinear(pyramid, uv, lod)
            assert_allclose(result["values"]["线性 RGB"], expected, atol=0.000005)
            self.assertEqual(result["values"]["两层"], [int(lod), min(int(lod) + 1, 4)])

    def test_filter_comparison_handles_share_pixel_and_background_is_explicit(self):
        result = frame("texture-minification", point=[0.5, 0.55])
        handles = result["handles"]
        self.assertEqual(len({h["id"] for h in handles}), 4)
        for h in handles:
            assert_allclose(
                (np.asarray(h["at"]) - h["mapping"]["offset"]) / h["mapping"]["scale"],
                [0.5, 0.55],
            )
        self.assertTrue(result["values"]["命中纹理平面"])
        self.assertFalse(
            frame("texture-minification", point=[0, 0])["values"]["命中纹理平面"]
        )

    def test_catalog_all_options_progress_and_slider_extremes(self):
        catalog = figures.catalog()
        self.assertTrue(catalog)
        self.assertEqual(len({item["id"] for item in catalog}), len(catalog))
        self.assertEqual(
            {item["chapter"] for item in catalog},
            {item["id"] for item in studio_render.catalog()},
        )
        for spec in catalog:
            self.assertTrue(0 <= spec["initialProgress"] <= 1)
            source = (studio_render.ROOT / spec["sourcePath"]).resolve()
            self.assertTrue(source.is_relative_to(studio_render.ROOT))
            source_lines = source.read_text().splitlines()
            self.assertTrue(
                source_lines[spec["sourceLine"] - 1].startswith(("@figure(", "def "))
            )
            if spec["id"] in ("casteljau-steps", "light-lobes"):
                self.assertTrue(0 < spec["initialProgress"] < 1)
            choices = []
            for control in spec["controls"]:
                values = (
                    [item["value"] for item in control["options"]]
                    if "options" in control
                    else [
                        control["min"],
                        (control["min"] + control["max"]) / 2,
                        control["max"],
                    ]
                )
                choices.append((control["key"], values))
            variants = [
                spec["defaults"],
                *[
                    dict(zip([key for key, _ in choices], values))
                    for values in itertools.product(*(values for _, values in choices))
                ],
            ]
            for params, progress in itertools.product(variants, (0, 0.5, 1)):
                with self.subTest(figure=spec["id"], params=params, progress=progress):
                    result = figures.render(spec["id"], params, progress)
                    json.dumps(result, allow_nan=False)
                    self.assertEqual(result["id"], spec["id"])
                    self.assertGreater(len(result["items"]), 0)

    def test_handle_domains_produce_finite_frames(self):
        for spec in figures.catalog():
            for handle in frame(spec["id"])["handles"]:
                if "limits" not in handle:
                    continue
                for end in (0, 1):
                    params = copy.deepcopy(spec["defaults"])
                    value = params[handle["key"]]
                    indices = handle["axes"]
                    limits = handle["limits"]
                    target = value[handle["index"]] if "index" in handle else value
                    if isinstance(target, list):
                        for axis in indices:
                            target[handle.get("components", [0, 1])[axis]] = limits[2 * axis + end]
                    else:
                        params[handle["key"]] = limits[end]
                    with self.subTest(figure=spec["id"], handle=handle["key"], end=end):
                        for progress in (0, 0.5, 1):
                            json.dumps(
                                figures.render(spec["id"], params, progress),
                                allow_nan=False,
                            )

    def test_pixel_counts_and_black_white_encoding(self):
        for n in (1, 2, 4, 8):
            result = frame("pixel-sampling", samples=n, point=[0, 0])
            dots = [item for item in result["items"] if item["kind"] == "circle"]
            self.assertEqual(len(dots), n * n)
            self.assertEqual(result["values"]["已累计样本"], n * n)
            self.assertEqual(result["values"]["总样本"], n * n)
            points = np.array([item["at"] for item in dots])
            expected = np.mean(np.sum(points**2, axis=1) < 0.56**2)
            self.assertAlmostEqual(result["values"]["覆盖估计"], expected, places=4)
        values = frame("color-average", mix=0.5)["values"]
        self.assertEqual(values["错误屏幕编码"], 0.5)
        self.assertAlmostEqual(values["正确屏幕编码"], 0.735, places=3)

    def test_active_matrix_and_order(self):
        for t, expected, determinant in (
            (0, [1, 2], 1),
            (0.5, [1.5, 4], 3),
            (1, [2, 6], 6),
        ):
            values = frame("basis-transform", t, basis=[[2, 0], [0, 3]], point=[1, 2])[
                "values"
            ]
            assert_allclose(values["结果"], expected)
            self.assertEqual(values["当前行列式"], determinant)
            assert_allclose(np.asarray(values["当前矩阵列"]).T @ [1, 2], expected)
        result = frame("transform-order", angle=90, point=[1, 0])
        assert_allclose(lines(result, figures.BLUE, 2.5)[0][0], [1.4, -0.4], atol=1e-12)
        assert_allclose(lines(result, figures.GREEN, 2.5)[0][0], [0.4, 0.6], atol=1e-12)

    def test_projection_geometry_and_outside_clip_volume(self):
        self.assertEqual(
            frame("projection-rays", point=[3, 1.5], focal=1)["values"]["投影高度 y′"],
            0.5,
        )
        result = frame("perspective-divide", point=[1, 2])
        self.assertEqual(result["values"]["w"], 2)
        assert_allclose(
            result["values"]["NDC"], [np.sqrt(3) / 2, 0, (10.2 - 2) / 9.8], atol=0.00051
        )
        outside = frame("perspective-divide", point=[2.5, 1])
        self.assertFalse(outside["values"]["位于裁剪体内"])
        self.assertGreater(outside["values"]["NDC"][0], 1)
        # 除法本身不会把体外点压进 [-1,1]，也不应在视图边界外藏掉它。
        self.assertGreater(outside["bounds"][1], 2 + 1.3 * outside["values"]["NDC"][0])

    def test_barycentric_hand_calculation_and_degeneracy(self):
        assert_allclose(
            frame("barycentric-area", point=[0, 0])["values"]["权重"], [0.3, 0.3, 0.4]
        )
        result = frame("barycentric-area", vertices=[[0, 0], [1, 0], [2, 0]])
        self.assertIsNone(result["values"]["权重"])
        json.dumps(result, allow_nan=False)

    def test_shared_edge_ownership_and_array_row_direction(self):
        for offset in (-0.25, 0, 0.25):
            for closed in (False, True):
                result = frame("edge-rule", offset=offset, closed=closed)
                active = {
                    tuple(item["at"]): item["color"]
                    for item in result["items"]
                    if item["kind"] == "circle" and item["color"] != figures.MUTED
                }
                expected = set()
                for x, y in itertools.product(np.arange(6) + 0.5, repeat=2):
                    inside = (
                        (
                            0.5 + offset <= x <= 4.5 + offset
                            and 0.5 + offset <= y <= 4.5 + offset
                        )
                        if closed
                        else (
                            0.5 + offset <= x < 4.5 + offset
                            and 0.5 + offset < y <= 4.5 + offset
                        )
                    )
                    if inside:
                        expected.add((x, y))
                self.assertEqual(set(active), expected)
                red = {point for point, color in active.items() if color == figures.RED}
                self.assertEqual(
                    red,
                    (
                        {point for point in expected if point[0] == point[1]}
                        if closed
                        else set()
                    ),
                )
        self.assertEqual(frame("edge-rule", closed=True)["values"]["重复归属样本"], 5)

    def test_far_plane_and_exact_depth_tie(self):
        for order in ("AB", "BA"):
            result = frame("depth-order", a=1, b=1, order=order)
            self.assertEqual(result["values"]["可见片元"], order[0])
            self.assertEqual(result["values"]["缓冲深度"], 1)
            painter = frame("depth-order", a=1, b=1, order=order, method="painter")
            self.assertEqual(painter["values"]["可见片元"], order[-1])
        first = frame("depth-precision", 0, near=0.2, distance=4)["values"]
        self.assertEqual(first["探针深度"], 0)
        self.assertEqual(first["量化距离误差"], 0)
        last = frame("depth-precision", 1, near=0.2, distance=4, bits=8)["values"]
        depth = 10 / 9.8 - 2 / (9.8 * 4)
        self.assertAlmostEqual(last["探针深度"], depth, places=7)
        self.assertAlmostEqual(last["量化后"], round(depth * 255) / 255, places=7)

    def test_normal_orthogonality_and_lobe_direction(self):
        good = frame("normal-transform", scale=[2, 0.6], angle=40)["values"]
        self.assertEqual(good["正确点积"], 0)
        self.assertGreater(abs(good["错误点积"]), 0.5)
        uniform = frame("normal-transform", scale=[1.2, 1.2], angle=40)["values"]
        self.assertEqual(uniform["错误点积"], 0)
        result = frame("light-lobes", angle=35, exponent=64)
        specular = lines(result, figures.YELLOW, 2.5)[0]
        peak = specular[np.argmax(np.linalg.norm(specular, axis=1))]
        self.assertAlmostEqual(np.rad2deg(np.arctan2(*peak)), -35, delta=0.6)
        diffuse = lines(result, figures.GREEN, 2)[0]
        assert_allclose(np.linalg.norm(diffuse, axis=1), np.cos(np.deg2rad(35)))

    def test_uv_two_depths_and_texture_corner_convention(self):
        self.assertEqual(
            frame("perspective-uv", far=4, probe=0.5)["values"]["正确 u"], 0.2
        )
        self.assertEqual(
            frame("perspective-uv", far=1, probe=0.5)["values"]["正确 u"], 0.5
        )
        values = frame("texture-filter", point=[0.5, 0.5])["values"]
        assert_allclose(values["权重"], [0.25] * 4)
        assert_allclose(values["线性颜色"], [0.5] * 3)
        for uv, color, corner in (
            ([0, 1], [1, 0, 0], [0, 0]),
            ([1, 1], [0, 1, 0], [0, 1]),
            ([0, 0], [0, 0, 1], [1, 0]),
            ([1, 0], [1, 1, 1], [1, 1]),
        ):
            values = frame("texture-filter", point=uv)["values"]
            assert_allclose(values["线性颜色"], color)
            self.assertEqual(values["纹素行列"], [corner] * 4)
            self.assertAlmostEqual(sum(values["权重"]), 1)

    def test_alias_samples_with_phase_and_exact_coverage(self):
        result = frame("sampling-alias", 0.5, frequency=9, phase=0.3)
        self.assertEqual(result["values"]["有符号混叠频率"], 1)
        points = np.array(
            [item["at"] for item in result["items"] if item["kind"] == "circle"]
        )
        assert_allclose(
            points[:, 1], np.sin(2 * np.pi * points[:, 0] + 0.3 + np.pi), atol=1e-14
        )
        for samples, estimate in ((4, 0.25), (16, 0.375)):
            # 将正文 [0,1]²、x+y≤.75 平移到以原点为中心的像素。
            values = frame(
                "sample-coverage", point=[-0.125, -0.125], angle=45, samples=samples
            )["values"]
            self.assertEqual(values["真实覆盖率"], 0.5 * 0.75**2)
            self.assertEqual(values["采样估计"], estimate)

    def test_shadow_visibility_bias_and_drawn_depth(self):
        self.assertFalse(
            frame("shadow-compare", point=[0, 0], height=1.3)["values"]["可见"]
        )
        self.assertTrue(
            frame("shadow-compare", point=[1, 0], height=1.3)["values"]["可见"]
        )
        result = frame("shadow-bias", bias=0.02)
        assert_allclose(lines(result, figures.WHITE, 2)[0][:, 1], [0.8, 0.8])
        self.assertEqual(result["values"]["错误自阴影"], 0)
        self.assertEqual(result["values"]["错误漏光"], 0)
        self.assertGreater(frame("shadow-bias", bias=0)["values"]["错误自阴影"], 0)
        self.assertGreater(frame("shadow-bias", bias=0.1)["values"]["错误漏光"], 0)

    def test_ellipsoid_gradient_and_circle_refinement(self):
        values = frame("surface-normal", 0, axes=[2, 1], angle=45)["values"]
        assert_allclose(values["赤道点"], [np.sqrt(2), 1 / np.sqrt(2), 0], atol=0.00051)
        assert_allclose(
            values["单位法线"], [1 / np.sqrt(5), 2 / np.sqrt(5)], atol=0.00051
        )
        self.assertEqual(values["点积"], 0)
        self.assertAlmostEqual(values["径向与切向点积"], -0.6, places=5)
        for n in (4, 8, 16, 32):
            start = frame("mesh-refine", 0, segments=n)["values"][
                "当前折线最大径向误差"
            ]
            middle = frame("mesh-refine", 0.5, segments=n)["values"][
                "当前折线最大径向误差"
            ]
            end = frame("mesh-refine", 1, segments=n)["values"]["当前折线最大径向误差"]
            self.assertAlmostEqual(start, 1.35 * (1 - np.cos(np.pi / n)), places=6)
            self.assertAlmostEqual(end, 1.35 * (1 - np.cos(np.pi / (2 * n))), places=6)
            self.assertGreater(start, middle)
            self.assertGreater(middle, end)

    def test_casteljau_and_secant_limit(self):
        points = [[0, 0], [0, 2], [3, 2], [3, 0]]
        assert_allclose(
            frame("casteljau-steps", 0.5, points=points)["values"]["曲线点"], [1.5, 1.5]
        )
        start = frame("bezier-tangent", 0, points=points, position=0.35)["values"]
        end = frame("bezier-tangent", 1, points=points, position=0.35)["values"]
        assert_allclose(
            end["解析导数"], [18 * 0.35 * (1 - 0.35), 6 - 12 * 0.35], atol=0.00051
        )
        self.assertLess(end["误差"], start["误差"] / 100)

    def test_ray_candidate_roots_interval_and_degenerate_direction(self):
        values = frame("ray-intersection", origin=[-3, 0], aim=[0, 0])["values"]
        assert_allclose(values["实根"], [2, 4])
        self.assertEqual(values["首个合法根"], 2)
        self.assertEqual(
            frame("ray-intersection", origin=[-3, 0], aim=[0, 0], t_min=3)["values"][
                "首个合法根"
            ],
            4,
        )
        self.assertIsNone(
            frame("ray-intersection", origin=[-3, 0], aim=[0, 0], t_max=1)["values"][
                "首个合法根"
            ]
        )
        self.assertEqual(
            frame("ray-intersection", origin=[0, 0], aim=[1, 0])["values"][
                "首个合法根"
            ],
            1,
        )
        invalid = frame("ray-intersection", origin=[0, 0], aim=[0, 0])["values"]
        self.assertFalse(invalid["方向有效"])
        self.assertIsNone(invalid["首个合法根"])

    def test_reflection_components_and_path(self):
        result = frame("ray-reflection", 0.5, normal=[0, 1], incoming=[-1, 1])
        values = result["values"]
        self.assertAlmostEqual(values["入射法向分量"], -1 / np.sqrt(2), places=4)
        self.assertAlmostEqual(values["反射法向分量"], 1 / np.sqrt(2), places=4)
        self.assertEqual(values["反射长度"], 1)
        dot = next(item for item in result["items"] if item["kind"] == "circle")
        assert_allclose(dot["at"], [0, 0])


if __name__ == "__main__":
    unittest.main()
