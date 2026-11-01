"""物理方向约定、手算锚点、法线几何与分量图的独立检查。"""
import unittest
import numpy as np
from numpy.testing import assert_allclose
from core import display_rgba, ellipsoid_surface, light_at, normalize, shade, transform_normals


class LightingTests(unittest.TestCase):
    def test_normalize_and_zero(self):
        assert_allclose(normalize([3, 0, 4]), [.6, 0, .8])
        assert_allclose(normalize([0, 0, 0]), [0, 0, 0])
        assert_allclose(np.linalg.norm(normalize([[1, 2, 3], [-4, 2, 7]]), axis=-1), 1)

    def test_direction_normalization_is_scale_independent(self):
        expected = normalize([1., 2., 3.])
        assert_allclose(normalize(np.array([1., 2., 3.])*1e300), expected)
        assert_allclose(normalize(np.array([1., 2., 3.])*1e-300), expected)

    def test_correct_normal_stays_perpendicular_after_shear(self):
        a = np.array([[2, .7, 0], [0, .5, .2], [0, 0, 1.]])
        n, tangent = normalize([1, 1, 0]), normalize([1, -1, 0])
        transformed_n = transform_normals(n, a)
        assert_allclose(transformed_n @ (a @ tangent), 0, atol=1e-14)
        self.assertGreater(abs(transform_normals(n, a, correct=False) @ (a @ tangent)), .1)

    def test_ellipsoid_normal_matches_implicit_gradient(self):
        scale = np.array([1.6, .8, .5])
        p, local, mask = ellipsoid_surface(33, scale)
        n = transform_normals(local, np.diag(scale))
        assert_allclose(n[mask], normalize((p / scale**2)[mask]), atol=1e-14)
        assert_allclose(np.sum((p[mask]/scale)**2, axis=-1), 1, atol=1e-14)

    def test_image_rows_start_at_top_with_upward_geometry_y(self):
        p, n, mask = ellipsoid_surface(3, extent=1.)
        assert_allclose(p[0, 1, 1], 2/3)
        assert_allclose(p[2, 1, 1], -2/3)
        assert_allclose(p[1, :, 0], [-2/3, 0, 2/3])
        values = shade(n, [0, 1, 1], [0, 0, 1], kd=(1, 1, 1), ks=0, ambient=0)['total']
        self.assertGreater(values[0, 1, 0], values[2, 1, 0])
        image = display_rgba(values, mask).view(np.uint8).reshape(3, 3, 4)
        # Bokeh 第 0 行画在下方；显示后的上方仍然比下方亮。
        self.assertGreater(image[2, 1, 0], image[0, 1, 0])

    def test_uniform_scale_hides_wrong_normal(self):
        n = normalize([1, 2, 3])
        assert_allclose(transform_normals(n, np.eye(3)*2), transform_normals(n, np.eye(3)*2, correct=False))

    def test_singular_transform_is_explicit(self):
        with self.assertRaises(ValueError):
            transform_normals([0, 0, 1], np.diag([1, 0, 1]))

    def test_lambert_hand_calculation(self):
        value = shade([0, 0, 1], [.6, 0, .8], [0, 0, 1], kd=(.5, .25, 1), ks=0, ambient=0, irradiance=2)
        assert_allclose(value['diffuse'], [.8, .4, 1.6])

    def test_head_on_highlight(self):
        value = shade([0, 0, 1], [0, 0, 1], [0, 0, 1], kd=(0, 0, 0), ks=.3, exponent=64, ambient=0)
        assert_allclose(value['specular'], [.3, .3, .3])

    def test_backlight_and_opposite_halfway_are_zero(self):
        value = shade([0, 0, 1], [0, 0, -1], [0, 0, 1], ambient=0)
        assert_allclose(value['total'], 0)
        self.assertTrue(np.isfinite(value['total']).all())

    def test_invisible_surface_has_no_direct_component(self):
        value = shade([0, 0, -1], [0, 0, -1], [0, 0, 1], ambient=0)
        assert_allclose(value['total'], 0)

    def test_point_light_inverse_square_and_direction(self):
        direction, intensity = light_at([[0, 0, 0], [0, 0, -2]], [0, 0, 2], point_light=True, power=4)
        assert_allclose(direction, [[0, 0, 1], [0, 0, 1]])
        assert_allclose(intensity, [1, .25])

    def test_directional_light_independent_of_position(self):
        direction, intensity = light_at([[2, -5, 1], [-8, 1, 3]], [3, 0, 4], power=2)
        assert_allclose(direction, [[.6, 0, .8], [.6, 0, .8]])
        assert_allclose(intensity, [2, 2])

    def test_components_add_and_are_nonnegative(self):
        p, n, mask = ellipsoid_surface(64)
        light, intensity = light_at(p, [-2, 2, 3], point_light=True, power=4)
        value = shade(n, light, [0, 0, 1], irradiance=intensity)
        assert_allclose(value['total'], value['diffuse']+value['specular']+value['ambient'])
        for component in value.values():
            self.assertTrue(np.isfinite(component).all())
            self.assertGreaterEqual(component.min(), 0)
        self.assertGreater(value['total'][mask].max(), .1)

    def test_exponent_narrows_highlight(self):
        low = shade([0, 0, 1], [1, 0, 1], [0, 0, 1], exponent=4)['specular']
        high = shade([0, 0, 1], [1, 0, 1], [0, 0, 1], exponent=128)['specular']
        self.assertTrue(np.all(high < low))

    def test_same_rotation_of_all_directions_keeps_shading(self):
        a = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])
        n, light, view = [0, 0, 1], [1, 2, 3], [0, 1, 4]
        first = shade(n, light, view)
        second = shade(a@np.array(n), a@np.array(light), a@np.array(view))
        assert_allclose(first['total'], second['total'])

    def test_display_encoding_and_background(self):
        rgb = np.array([[[0., .5, 1.], [1, 1, 1]]])
        image = display_rgba(rgb, np.array([[True, False]]))
        channels = image.view(np.uint8).reshape(1, 2, 4)
        assert_allclose(channels[0, 0], [0, 188, 255, 255])
        assert_allclose(channels[0, 1], [247, 249, 243, 255])

    def test_display_flips_vertical_order_exactly_once(self):
        rgb = np.array([[[1., 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 1]]])
        mask = np.array([[True, False], [True, True]])
        channels = display_rgba(rgb, mask).view(np.uint8).reshape(2, 2, 4)
        np.testing.assert_array_equal(channels[0], [[0, 0, 255, 255], [255, 255, 255, 255]])
        np.testing.assert_array_equal(channels[1], [[255, 0, 0, 255], [247, 249, 243, 255]])

    def test_invalid_geometry_and_lighting(self):
        for call in [lambda: ellipsoid_surface(scale=[0, 1, 1]), lambda: normalize([np.nan, 1, 2]),
                     lambda: light_at([0, 0, 0], [0, 0, 0]),
                     lambda: light_at([0, 0, 1], [0, 0, 1], point_light=True),
                     lambda: shade([0, 0, 1], [0, 0, 1], [0, 0, 1], exponent=0)]:
            with self.assertRaises(ValueError):
                call()


if __name__ == '__main__':
    unittest.main()
