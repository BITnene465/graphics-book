"""手算锚点、几何不变量与反例；运行 python -m unittest discover -s 本目录。"""
import unittest
import numpy as np
from numpy.testing import assert_allclose
from core import apply, compose, inverse, rotation, scaling, translation


class TransformTests(unittest.TestCase):
    def test_identity_and_batch(self):
        points = np.array([[1, 2], [-3, 4], [0, 0]])
        assert_allclose(apply(compose(), points), points)
        self.assertEqual(apply(np.eye(3), points).shape, (3, 2))

    def test_translation_distinguishes_point_vector(self):
        t = translation(3, -2)
        assert_allclose(apply(t, [1, 2]), [4, 0])
        assert_allclose(apply(t, [1, 2], vector=True), [1, 2])

    def test_positive_quarter_turn(self):
        assert_allclose(apply(rotation(np.pi / 2), [1, 0]), [0, 1], atol=1e-15)

    def test_columns_are_basis_images(self):
        m = compose(translation(2, 3), rotation(.7), scaling(2, .5))
        assert_allclose(apply(m, np.eye(2), vector=True).T, m[:2, :2])

    def test_noncommuting_hand_calculation(self):
        t, r = translation(2, 0), rotation(np.pi / 2)
        assert_allclose(apply(compose(t, r), [1, 0]), [2, 1], atol=1e-15)
        assert_allclose(apply(compose(r, t), [1, 0]), [0, 3], atol=1e-15)

    def test_composition_matches_sequential_application(self):
        a, b = translation(2, -1), compose(rotation(.8), scaling(.4, 1.5))
        points = [[1, 2], [0, -1]]
        assert_allclose(apply(compose(a, b), points), apply(a, apply(b, points)))

    def test_rotation_preserves_length_and_dot_product(self):
        r, u, v = rotation(1.2), np.array([2, 3]), np.array([-1, 4])
        ru, rv = apply(r, u, vector=True), apply(r, v, vector=True)
        assert_allclose(ru @ rv, u @ v)
        assert_allclose(np.linalg.norm(ru), np.linalg.norm(u))

    def test_affine_midpoint_and_difference(self):
        m = compose(translation(3, 2), rotation(.7), scaling(2, .4))
        a, b = np.array([1, 3]), np.array([-2, 5])
        assert_allclose(apply(m, (a + b) / 2), (apply(m, a) + apply(m, b)) / 2)
        assert_allclose(apply(m, b) - apply(m, a), apply(m, b - a, vector=True))

    def test_reflection_area_sign(self):
        m = compose(rotation(.3), scaling(-2, .5))
        basis = apply(m, np.eye(2), vector=True)
        signed_area = basis[0, 0] * basis[1, 1] - basis[0, 1] * basis[1, 0]
        assert_allclose(signed_area, -1)

    def test_inverse_roundtrip_and_order(self):
        t, r, s = translation(2, -1), rotation(.8), scaling(.4, -1.2)
        m = compose(t, r, s)
        assert_allclose(inverse(m), compose(inverse(s), inverse(r), inverse(t)), atol=1e-15)
        assert_allclose(apply(inverse(m), apply(m, [2, 5])), [2, 5])

    def test_singular_collapse_and_inverse_failure(self):
        m = scaling(0, 1)
        assert_allclose(apply(m, [1, 2]), apply(m, [8, 2]))
        with self.assertRaises(ValueError):
            inverse(m)

    def test_near_singular_rejected_but_small_uniform_scale_valid(self):
        with self.assertRaises(ValueError):
            inverse(scaling(1, 1e-16))
        assert_allclose(inverse(scaling(1e-12, 1e-12)), scaling(1e12, 1e12))

    def test_invalid_data_is_explicit(self):
        for m, p in [(np.eye(2), [1, 2]), (np.eye(3), [1]),
                     (np.eye(3), [np.nan, 2]), (np.ones((3, 3)), [1, 2])]:
            with self.subTest(matrix=m, point=p), self.assertRaises(ValueError):
                apply(m, p)


if __name__ == "__main__":
    unittest.main()
