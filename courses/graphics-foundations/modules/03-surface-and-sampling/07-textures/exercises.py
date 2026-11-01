"""先完成 TODO，再运行本文件；不要直接调用 core.py 的答案。"""

import numpy as np


def correct_uv(weights, uv, vertex_w):
    """TODO 1：由屏幕重心权重、三个 UV 和三个 w 求透视正确 UV。"""
    raise NotImplementedError("分子插值 uv/w，分母插值 1/w")


def bilinear(c00, c10, c01, c11, s, t):
    """TODO 2：四个线性 RGB；s 向右、t 向下，均在 [0,1]。"""
    raise NotImplementedError("先做两次水平插值，再做一次垂直插值")


def lod_blend(lower_color, upper_color, lod):
    """TODO 3：相邻两层已完成双线性查询；用 LOD 的小数部分混合。

    lower_color 对应 floor(lod) 层，upper_color 对应下一层。
    此练习约定 lod >= 0，且两层已经按边界规则选好。
    """
    raise NotImplementedError("层级 2.25 对应两层的权重 0.75、0.25")


def check():
    tasks = [
        (
            "透视 UV",
            lambda: (
                np.testing.assert_allclose(
                    correct_uv([0.5, 0.5, 0], [[0, 0], [1, 0], [0, 1]], [1, 4, 2]),
                    [0.2, 0],
                ),
                np.testing.assert_allclose(
                    correct_uv([0.2, 0.3, 0.5], [[0, 0], [1, 0], [0, 1]], [2, 2, 2]),
                    [0.3, 0.5],
                ),
            ),
        ),
        (
            "双线性",
            lambda: (
                np.testing.assert_allclose(
                    bilinear([1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], 0.5, 0.5),
                    [0.5] * 3,
                ),
                np.testing.assert_allclose(
                    bilinear([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], 0.25, 0.75),
                    [0.25, 0.75, 0],
                ),
            ),
        ),
        (
            "层间混合",
            lambda: (
                np.testing.assert_allclose(
                    lod_blend([0.2] * 3, [0.6] * 3, 2.25), [0.3] * 3
                ),
                np.testing.assert_allclose(
                    lod_blend([0.1, 0.3, 0.7], [1, 1, 1], 2.0), [0.1, 0.3, 0.7]
                ),
                np.testing.assert_allclose(
                    lod_blend([0.4] * 3, [0.4] * 3, 5.81), [0.4] * 3
                ),
            ),
        ),
    ]
    for name, test in tasks:
        try:
            test()
            print(f"✓ {name}：通过，再用 t=0、1 或等 w 检查边界。")
        except NotImplementedError as error:
            print(f"· {name}：{error}")
        except (AssertionError, ValueError, TypeError) as error:
            print(f"✗ {name}：检查公式、数组广播与输入颜色空间。\n{error}")


if __name__ == "__main__":
    check()
