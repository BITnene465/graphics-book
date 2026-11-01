"""完成两个 TODO 后直接运行；不依赖渲染器或本章答案模块。"""

import numpy as np


def tensor_point(control, u, v):
    """TODO 1：两轮 de Casteljau 求值，返回三维曲面点。

    control.shape 为 (m+1,n+1,3)，第一轴对应 u，第二轴对应 v。
    u、v 在 [0,1]；两个方向至少各有一个控制点。不得修改输入。
    可写一个简短的局部曲线插值函数，再复用两次。
    """
    raise NotImplementedError("请实现 tensor_point")


def c1_control_row(left, left_span, right_span):
    """TODO 2：返回右三次曲面的 Q[1]，shape=(4,3)。

    left.shape=(4,4,3)，右边界 Q[0] 已经等于 left[3]。
    左右局部 u 都在 [0,1]；全局横向参数的跨度分别是两个正数。
    比较 S_u/跨度，逐列构造右侧第 1 行，不改动 left。
    """
    raise NotImplementedError("请实现 c1_control_row")


def check():
    from numpy.testing import assert_allclose

    axis = np.linspace(0, 1, 4)
    plane = np.zeros((4, 4, 3))
    plane[..., 0] = axis[:, None]
    plane[..., 1] = axis[None, :]
    plane[..., 2] = 2 * axis[:, None] + 3 * axis[None, :]
    backup = plane.copy()
    assert_allclose(tensor_point(plane, 0.25, 0.75), [0.25, 0.75, 2.75])
    assert_allclose(tensor_point(plane, 0, 0), plane[0, 0])
    assert_allclose(tensor_point(plane, 1, 0), plane[-1, 0])
    assert_allclose(tensor_point(plane, 0, 1), plane[0, -1])
    assert_allclose(tensor_point(plane, 1, 1), plane[-1, -1])
    assert_allclose(plane, backup)
    bump = np.zeros((4, 4, 3))
    bump[1, 1, 2] = 1
    assert_allclose(tensor_point(bump, 0.5, 0.5), [0, 0, 9 / 64])
    assert_allclose(tensor_point([[[2, 3, 4]]], 0.2, 0.8), [2, 3, 4])
    q0 = plane[-1]
    q1 = c1_control_row(plane, 2, 3)
    # dS/d(global u) = [1/2,0,1] on both sides.
    assert_allclose(3 * (q1 - q0) / 3, np.tile([0.5, 0, 1], (4, 1)))
    assert_allclose(c1_control_row(plane, 3, 1), q0 + np.array([1 / 9, 0, 2 / 9]))
    assert_allclose(plane, backup)
    print("11 项自检通过：张量积、边角、轴顺序、输入保留与参数跨度。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"尚未完成：{error}。先让一轮曲线插值通过，再把它沿另一轴复用。")
