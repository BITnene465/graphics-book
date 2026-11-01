"""两个独立 TODO：光空间坐标与 PCF。直接运行文件自检。"""

import numpy as np
from numpy.testing import assert_allclose


def light_coordinates(clip):
    """TODO 1：输入已裁剪且 w>0 的 (x,y,z,w)，返回 (u,v,depth)。

    uv 左上原点，NDC z 在 [-1,1]，depth 在 [0,1]。
    """
    raise NotImplementedError("请完成一次除法和三次范围映射")


def percentage_visible(current, samples, bias=0):
    """TODO 2：计算 mean(current-bias <= 每一个 stored sample)。

    相同深度通过，+inf 表示没有遮挡物。不要先求深度均值。
    """
    raise NotImplementedError("请先得到布尔比较结果，再平均")


def check():
    assert_allclose(light_coordinates([-2, 2, -2, 2]), [0, 0, 0])
    assert_allclose(light_coordinates([2, -2, 2, 2]), [1, 1, 1])
    assert_allclose(light_coordinates([0, 0, 0, 3]), [.5, .5, .5])
    assert_allclose(percentage_visible(.6, [.2, .8]), .5)
    assert_allclose(percentage_visible(.5, [.5]), 1)
    assert_allclose(percentage_visible(.6, [.2, .58, .7], .03), 2/3)
    assert_allclose(percentage_visible(.9, [np.inf]), 1)
    assert_allclose(percentage_visible(.7, [.2, .3, .4]), 0)
    print("8 项检查通过：UV 方向、深度端点、PCF、bias、平局和背景。")


if __name__ == '__main__':
    try:
        check()
    except NotImplementedError as error:
        print(f"练习还未完成：{error}")
