"""完成四个 TODO 后直接运行。输入控制点可以是二维或三维。"""

import numpy as np


def curve_point(control, t):
    """TODO 1：用 de Casteljau 逐层插值得到一个点，不改动输入 control。

    输入至少有一个点，t 位于 [0,1]。尽量不要直接抄展开的三次多项式。
    """
    raise NotImplementedError("请实现 curve_point")


def endpoint_tangents(control):
    """TODO 2：返回 (起点导数, 终点导数)。n 次曲线有 n+1 个控制点。

    一点常量曲线的两端导数均为零。不要归一化：零导数也是合法答案。
    """
    raise NotImplementedError("请实现 endpoint_tangents")


def join_velocity_handle(left, right_duration, left_duration):
    """TODO 3：已知左三次控制点，返回使全局时间速度连续的右侧 Q1。

    Q0=P3，两段局部参数各为[0,1]；实际时长均为正。
    手算先从 C_L'(1)/T_L = C_R'(0)/T_R 出发。
    """
    raise NotImplementedError("请实现 join_velocity_handle")


def rational_weights(basis, weights):
    """TODO 4：把非负且和为1的多项式基值，变为正权的有理基值。

    两个输入是一维等长数组；先逐项乘权，再除以总和。不要修改输入。
    """
    raise NotImplementedError("请实现 rational_weights")


def check():
    from numpy.testing import assert_allclose

    p = np.array([[0.0, 0.0], [0.0, 2.0], [3.0, 2.0], [3.0, 0.0]])
    backup = p.copy()
    assert_allclose(curve_point(p, 0.5), [1.5, 1.5])
    assert_allclose(curve_point(p, 0), p[0])
    assert_allclose(curve_point(p, 1), p[-1])
    assert_allclose(curve_point([[1, 2, 3], [5, 6, 7]], 0.25), [2, 3, 4])
    assert_allclose(p, backup)
    start, end = endpoint_tangents(p)
    assert_allclose(start, [0, 6])
    assert_allclose(end, [0, -6])
    assert_allclose(endpoint_tangents([[1, 1]] * 4), [[0, 0], [0, 0]])
    assert_allclose(endpoint_tangents([[1, 2, 3]]), [[0, 0, 0], [0, 0, 0]])
    assert_allclose(join_velocity_handle(p, 2, 1), [3, -4])
    assert_allclose(join_velocity_handle(p, 1, 2), [3, -1])
    b = np.array([0.25, 0.5, 0.25])
    w = np.array([1, np.sqrt(0.5), 1])
    r = rational_weights(b, w)
    assert_allclose(
        r, [1 / (2 + np.sqrt(2)), np.sqrt(2) / (2 + np.sqrt(2)), 1 / (2 + np.sqrt(2))]
    )
    # 正确的中点在单位圆上；普通多项式的(.75,.75)则在圆外。
    assert_allclose(r @ np.array([[1, 0], [1, 1], [0, 1]]), [np.sqrt(0.5)] * 2)
    assert_allclose(rational_weights(b, 9 * w), r)
    assert_allclose(b, [0.25, 0.5, 0.25])
    print("15 项自检通过：插值、导数、时长拼接与有理权重。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"尚未完成：{error}。从线段插值开始，再重复这一操作。")
