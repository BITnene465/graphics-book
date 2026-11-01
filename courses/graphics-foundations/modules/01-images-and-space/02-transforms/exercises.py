"""动手写两个函数。先预测，再运行；可查同目录 core.py。

从 graphic 运行：
uv run python courses/graphics-foundations/modules/01-images-and-space/02-transforms/exercises.py
"""
import numpy as np


def rotate_about(point, center, angle):
    """TODO 1：二维 point 绕 center 逆时针旋转 angle 弧度，返回 (2,)。

    提示：先把旋转中心搬到原点，旋转，再搬回来。不能先旋转后减中心。
    """
    raise NotImplementedError("请实现 rotate_about")


def recover_point(matrix, transformed):
    """TODO 2：matrix 是 3×3 仿射矩阵，恢复 transformed 对应的原坐标。

    提示：q = A p + t。可以用 np.linalg.solve；奇异时应抛出 ValueError
    或 np.linalg.LinAlgError，而不是返回任意坐标。
    """
    raise NotImplementedError("请实现 recover_point")


def check():
    from numpy.testing import assert_allclose
    assert_allclose(rotate_about([2, 1], [1, 1], np.pi / 2), [1, 2], atol=1e-12)
    assert_allclose(rotate_about([3, -2], [3, -2], .8), [3, -2], atol=1e-12)
    assert_allclose(rotate_about([4, 1], [1, 2], 0), [4, 1], atol=1e-12)
    assert_allclose(rotate_about([1, 0], [0, 0], -np.pi / 2), [0, -1], atol=1e-12)
    matrix = np.array([[0., -2., 3.], [1., 0., -1.], [0., 0., 1.]])
    assert_allclose(recover_point(matrix, [-1, 0]), [1, 2], atol=1e-12)
    assert_allclose(recover_point(np.eye(3), [-2, 5]), [-2, 5], atol=1e-12)
    singular = np.diag([0., 1., 1.])
    try:
        recover_point(singular, [0, 2])
    except (ValueError, np.linalg.LinAlgError):
        pass
    else:
        raise AssertionError("奇异变换丢失信息，应显式拒绝恢复")
    print("7 项自检通过：绕任意中心、正负旋转、逆变换与奇异反例。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"尚未完成：{error}。先实现第一个函数，再继续第二个。")
