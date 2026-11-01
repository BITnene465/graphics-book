"""先填两个 TODO，再直接运行本文件。无 UI 依赖。"""

import numpy as np
from numpy.testing import assert_allclose


def pixel_depth(weights, clip_z, clip_w):
    """TODO 1：屏幕重心权重 + 顶点 clip z/w → 一个 [0,1] 深度。

    提示：先得到每个顶点的 z_ndc，直接按屏幕权重插值，再映射到 [0,1]。
    不要把普通属性的透视校正归一化分母再次用在 z_ndc 上。
    """
    raise NotImplementedError("请完成一次像素深度插值")


def nearest_fragment(depths, owners):
    """TODO 2：按提交顺序比较候选深度，返回 (最终深度, owner)。

    初始化 (+inf, -1)，使用严格 <；相同深度先画者赢。
    depths 中 +inf 表示该图元没有覆盖此像素。空列表返回初始化状态。
    """
    raise NotImplementedError("请完成严格小于的深度测试")


def check():
    assert_allclose(pixel_depth([.5, .5, 0], [2/9, 68/9, 8/3], [2, 8, 4]), 55/72)
    assert_allclose(pixel_depth([1, 0, 0], [-1, 1, 1], [1, 1, 1]), 0)
    assert_allclose(pixel_depth([0, 1, 0], [-1, 1, 1], [1, 1, 1]), 1)
    assert nearest_fragment([.7, .2, .6], [3, 8, 1]) == (.2, 8)
    assert nearest_fragment([.6, .2, .7], [1, 8, 3]) == (.2, 8)
    assert nearest_fragment([.4, .4], [2, 9]) == (.4, 2)
    assert nearest_fragment([.4, .4], [9, 2]) == (.4, 9)
    assert nearest_fragment([np.inf, 1.], [-1, 7]) == (1., 7)
    assert nearest_fragment([], []) == (np.inf, -1)
    print("9 项检查通过：手算深度、端点、顺序、平局、远平面与背景。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"练习还未完成：{error}")
