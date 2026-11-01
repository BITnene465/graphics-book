"""先独立手算与实现，再运行本文件；完整参考在 core.py / procedural.py。"""

import numpy as np


def direction_uv(direction):
    """TODO：有限非零三维方向→经纬图(u,v)，y向上、v向下；u在[0,1)。"""
    raise NotImplementedError("先归一化，再用 atan2(z,x) 和 arccos(y)")


def octave_average(values, gain):
    """TODO：已经算好的有限尺度值，以 gain**k 加权并除以总权重。"""
    raise NotImplementedError("加权总和与权重总和分别计算；不要直接除以项数")


def check():
    for direction, expected in (
        ([1, 0, 0], [0, 0.5]),
        ([0, 0, 1], [0.25, 0.5]),
        ([-1, 0, 0], [0.5, 0.5]),
        ([0, 0, -1], [0.75, 0.5]),
    ):
        np.testing.assert_allclose(direction_uv(direction), expected, atol=1e-12)
    np.testing.assert_allclose(direction_uv([7, 0, 0]), [0, 0.5], atol=1e-12)
    np.testing.assert_allclose(octave_average([0.2, 0.8, 0.4], 0.5), 0.7 / 1.75)
    np.testing.assert_allclose(octave_average([0.37] * 6, 0.6), 0.37)
    np.testing.assert_allclose(octave_average([0.2, 0.8], 0), 0.2)
    print("两道练习通过：方向约定、幅度权重与常量保持。")


if __name__ == "__main__":
    check()
