"""综合实践的独立几何与颜色核对，不依赖界面或截图。"""
import unittest

import numpy as np

from main import inspect_pixel, render_frame


class FrameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame = render_frame(48, 64)
        cls.valid = cls.frame["owner"] >= 0

    def test_world_points_reproject_to_the_recorded_depth_and_pixel(self):
        rows, cols = np.nonzero(self.valid)
        world = self.frame["world"][self.valid]
        clip = np.column_stack([world, np.ones(len(world))]) @ self.frame["camera_vp"].T
        ndc = clip[:, :3] / clip[:, 3, None]
        np.testing.assert_allclose((ndc[:, 2] + 1) / 2, self.frame["depth"][self.valid], atol=1e-12)
        # 光栅顶点量化到 1/256 像素，世界点重投影不要求逐位落在中心。
        np.testing.assert_allclose((ndc[:, 0] + 1) * 24, cols + .5, atol=.01)
        np.testing.assert_allclose((ndc[:, 1] + 1) * 24, 48 - rows - .5, atol=.01)

    def test_linear_color_is_the_sum_of_recorded_components(self):
        parts = sum(self.frame[key] for key in ("ambient", "diffuse", "specular"))
        np.testing.assert_allclose(parts[self.valid], self.frame["linear_rgb"][self.valid])
        np.testing.assert_allclose(np.linalg.norm(self.frame["normal"][self.valid], axis=1), 1)
        self.assertTrue(np.all((self.frame["visibility"][self.valid] >= 0)
                               & (self.frame["visibility"][self.valid] <= 1)))

    def test_submission_order_preserves_the_image(self):
        reversed_frame = render_frame(48, 64, reverse=True)
        np.testing.assert_allclose(reversed_frame["depth"], self.frame["depth"], atol=1e-12)
        np.testing.assert_allclose(reversed_frame["linear_rgb"], self.frame["linear_rgb"], atol=1e-10)

    def test_background_and_probe_have_explicit_meanings(self):
        self.assertTrue(np.isnan(self.frame["world"][~self.valid]).all())
        self.assertTrue(np.isposinf(self.frame["depth"][~self.valid]).all())
        background = np.argwhere(~self.valid)[0]
        self.assertIsNone(inspect_pixel(self.frame, *background)["surface"])
        point = np.argwhere(self.valid)[len(np.argwhere(self.valid)) // 2]
        probe = inspect_pixel(self.frame, *point)
        self.assertAlmostEqual(probe["depth"], probe["reprojected_depth"], places=12)
        with self.assertRaises(ValueError):
            inspect_pixel(self.frame, -1, 0)


if __name__ == "__main__":
    unittest.main()
