import unittest
import numpy as np
from numpy.testing import assert_allclose, assert_array_equal
import core


class PipelineTests(unittest.TestCase):
    def test_grid_counts_and_winding(self):
        for n in (1, 4, 8):
            scene = core.grid_scene(n)
            self.assertEqual(len(scene["vertices"]), (n + 1) ** 2 + 4)
            self.assertEqual(len(scene["faces"]), 2 * n * n + 2)
            triangles = scene["vertices"][scene["faces"]]
            self.assertTrue(
                np.all(
                    np.cross(
                        triangles[:, 1] - triangles[:, 0],
                        triangles[:, 2] - triangles[:, 0],
                    )[:, 2]
                    > 0
                )
            )

    def test_vertex_stages_are_independently_hand_computable(self):
        scene = core.grid_scene(1)
        model = core.model_matrix([1, 2, 3], [0, 0, 90], [2, 1, 0.5])
        frame = core.vertex_stage(scene, model, np.eye(4), np.eye(4), 0)
        assert_allclose(frame["world"][0], [1.9, -0.4, 3], atol=1e-14)
        assert_allclose(frame["clip"][:, :3], frame["world"])
        assert_allclose(frame["normal"], np.tile([0, 0, 1], (8, 1)))

    def test_wave_normals_match_independent_finite_differences(self):
        scene = core.grid_scene(5)
        frame = core.vertex_stage(scene, np.eye(4), np.eye(4), np.eye(4), 0.35)

        def h(x, y):
            return 0.35 * np.sin(np.pi * x) * np.cos(np.pi * y)

        for i in (0, 6, 13, 22):
            x, y = scene["vertices"][i, :2]
            eps = 1e-6
            expected = np.array(
                [
                    -(h(x + eps, y) - h(x - eps, y)) / (2 * eps),
                    -(h(x, y + eps) - h(x, y - eps)) / (2 * eps),
                    1,
                ]
            )
            assert_allclose(
                frame["normal"][i], expected / np.linalg.norm(expected), atol=1e-10
            )

    def test_early_depth_changes_work_not_pixels(self):
        args = dict(size=80, wave=0, eye=(0, 0, 4), divisions=4)
        early = core.render_frame(**args, early_depth=True)
        late = core.render_frame(**args, early_depth=False)
        assert_array_equal(early["owner"], late["owner"])
        assert_allclose(early["image"], late["image"])
        self.assertLess(
            early["stats"]["shaded_samples"], late["stats"]["shaded_samples"]
        )
        self.assertEqual(
            late["stats"]["covered_samples"], late["stats"]["shaded_samples"]
        )

    def test_depth_order_independence_and_painter_failure(self):
        args = dict(size=64, wave=0, eye=(0, 0, 4), divisions=2)
        a = core.render_frame(**args)
        b = core.render_frame(**args, reverse=True)
        assert_array_equal(a["owner"], b["owner"])
        assert_allclose(a["image"], b["image"])
        wrong = core.render_frame(**args, depth_test=False)
        self.assertGreater(np.count_nonzero(wrong["owner"] != a["owner"]), 500)

    def test_disabled_depth_has_identical_early_and_late_work(self):
        args = dict(size=48, divisions=3, wave=0.4, eye=(0.3, 0.2, 3), depth_test=False)
        for reverse in (False, True):
            with self.subTest(reverse=reverse):
                early = core.render_frame(**args, reverse=reverse, early_depth=True)
                late = core.render_frame(**args, reverse=reverse, early_depth=False)
                for key in (
                    "owner",
                    "depth",
                    "image",
                    "world",
                    "uv",
                    "normal",
                    "weights",
                ):
                    assert_array_equal(early[key], late[key])
                self.assertEqual(early["stats"], late["stats"])
                self.assertEqual(
                    early["stats"]["covered_samples"], early["stats"]["shaded_samples"]
                )
                self.assertEqual(
                    early["stats"]["covered_samples"], early["stats"]["depth_writes"]
                )

    def test_near_and_far_plane_surfaces_survive_and_write_boundary_depths(self):
        # 前方平面 z=0，轴向相机距离恰为 4；把它分别放在近、远边界。
        for near, far, expected in ((4, 5, 0), (0.1, 4, 1)):
            with self.subTest(near=near, far=far):
                frame = core.render_frame(
                    size=32, divisions=2, wave=0, eye=(0, 0, 4), near=near, far=far
                )
                front = (frame["owner"] >= 0) & (frame["owner"] < 8)
                self.assertGreater(np.count_nonzero(front), 100)
                assert_allclose(frame["depth"][front], expected, rtol=0, atol=2e-15)
                # 远面合法深度 1 仍应通过以 +∞ 清空的缓冲。
                self.assertGreater(frame["stats"]["depth_writes"], 0)
                row, col = np.argwhere(front)[0]
                probe = core.inspect_pixel(frame, row, col)
                winner = [
                    candidate
                    for candidate in probe["candidates"]
                    if candidate["passed"]
                ][-1]
                self.assertEqual(winner["face"], probe["face"])
                self.assertEqual(winner["depth"], probe["depth"])

    def test_probe_agrees_with_render_for_nearly_equal_depths(self):
        # z 缩放使两表面的深度仅差几个浮点末位；旧的批量/单行点积
        # 会在 (9,10) 等像素得出相互矛盾的严格比较结果。
        args = dict(size=32, divisions=1, wave=0, eye=(0, 0, 4), scale=(1, 1, 2e-14))
        for reverse in (False, True):
            for early_depth in (False, True):
                frame = core.render_frame(
                    **args, reverse=reverse, early_depth=early_depth
                )
                self.assertGreaterEqual(frame["owner"][9, 10], 0)
                for row, col in np.argwhere(frame["owner"] >= 0):
                    probe = core.inspect_pixel(frame, row, col)
                    winner = [
                        candidate
                        for candidate in probe["candidates"]
                        if candidate["passed"]
                    ][-1]
                    self.assertEqual(winner["face"], probe["face"])
                    self.assertEqual(winner["depth"], probe["depth"])

    def test_probe_reconstructs_original_triangle_and_actual_color(self):
        frame = core.render_frame(
            size=96, divisions=5, wave=0.4, near=2.9, eye=(0.3, 0.2, 3)
        )
        rows, cols = np.where(frame["owner"] >= 0)
        for k in np.linspace(0, len(rows) - 1, 15).astype(int):
            row, col = int(rows[k]), int(cols[k])
            p = core.inspect_pixel(frame, row, col)
            self.assertTrue(p["hit"])
            self.assertAlmostEqual(sum(p["weights"]), 1)
            assert_allclose(
                np.array(p["weights"]) @ p["vertices"]["world"], p["world"], atol=1e-12
            )
            assert_allclose(p["linear"], frame["image"][row, col])
            winning = [x for x in p["candidates"] if x["passed"]][-1]
            self.assertEqual(winning["face"], p["face"])
            self.assertAlmostEqual(winning["depth"], p["depth"])
        self.assertTrue(
            all(
                np.all(piece["clip"] @ core.raster.CLIP_PLANES.T >= -1e-12)
                for piece in frame["pieces"]
            )
        )

    def test_rigid_translation_of_scene_camera_and_light_preserves_image(self):
        args = dict(
            size=48,
            divisions=3,
            wave=0.2,
            eye=(2, 1, 5),
            target=(0, 0, 0),
            light=(-3, 4, 5),
        )
        original = core.render_frame(**args)
        shift = np.array([0.3, -0.7, 1.2])
        args.update(
            position=shift,
            eye=np.array(args["eye"]) + shift,
            target=shift,
            light=np.array(args["light"]) + shift,
        )
        translated = core.render_frame(**args)
        assert_allclose(original["image"], translated["image"], atol=1e-13)

    def test_backface_cull_uses_projected_winding(self):
        args = dict(size=48, divisions=3, wave=0, rotation=(0, 180, 0), eye=(0, 0, 4))
        both = core.render_frame(**args)
        culled = core.render_frame(**args, cull=True)
        self.assertGreater(both["stats"]["visible_pixels"], 0)
        self.assertEqual(culled["stats"]["visible_pixels"], 0)
        self.assertEqual(
            culled["stats"]["culled_triangles"], culled["stats"]["clipped_triangles"]
        )

    def test_outside_frustum_is_explicit_empty_frame(self):
        result = core.render_frame(size=32, position=(100, 0, 0))
        self.assertEqual(result["stats"]["visible_pixels"], 0)
        self.assertFalse(core.inspect_pixel(result, 16, 16)["hit"])
        assert_allclose(result["image"], np.broadcast_to(core.BACKGROUND, (32, 32, 3)))

    def test_fragment_modes_are_from_same_geometry(self):
        uv = np.array([[0.2, 0.7], [0.6, 0.9]])
        for mode in ("uv", "normal", "checker", "lit"):
            result = core.fragment_stage(
                np.array([[0, 0, 0], [1, 0, 0]]),
                [[0, 0, 1]] * 2,
                uv,
                [[0.1, 0.5, 0.2]] * 2,
                [0, 0, 4],
                [-3, 4, 5],
                mode,
            )
            self.assertTrue(np.isfinite(result).all())
            if mode == "uv":
                assert_allclose(result, np.column_stack([uv, [0, 0]]))
            if mode == "normal":
                assert_allclose(result, [[0.5, 0.5, 1]] * 2)

    def test_blend_hand_calculation_and_order(self):
        red = np.array([1, 0, 0])
        blue = np.array([0, 0, 1])
        black = np.zeros(3)
        a = core.source_over(red, core.source_over(blue, black, 0.5), 0.5)
        b = core.source_over(blue, core.source_over(red, black, 0.5), 0.5)
        assert_allclose(a, [0.5, 0, 0.25])
        assert_allclose(b, [0.25, 0, 0.5])
        assert_allclose(core.source_over(red, blue, 0), blue)
        assert_allclose(core.source_over(red, blue, 1), red)


if __name__ == "__main__":
    unittest.main()
