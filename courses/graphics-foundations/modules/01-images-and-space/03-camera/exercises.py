"""两道相机练习；直接运行本文件自检。只用 NumPy，无需启动页面。"""

import numpy as np
from numpy.testing import assert_allclose


def project_xy(point, fov_y_degrees, aspect):
    """TODO 1：相机前方点 (x,y,z)，返回 NDC 的 (x,y)。

    使用 d=-z，s=cot(FOV/2)；不处理深度映射或裁剪。
    提示：角度控件用度，NumPy 三角函数用弧度。
    """
    raise NotImplementedError("请完成相似三角形到 NDC 的两个坐标")


def clip_one_plane(start, end, plane):
    """TODO 2：裁剪齐次线段，只保留 plane @ p >= 0 的部分。

    例如 plane=(-1,0,0,1) 表示 x<=w。返回 (2,4) 两端点，
    完全在外返回 None。交点参数 t=g0/(g0-g1)。边界算在内。
    注意：两点都在平面上时，不需要求交，更不能除以零。
    """
    raise NotImplementedError("请实现一个半空间的线段裁剪")


def check():
    assert_allclose(project_xy([2, 1, -4], 90, 2), [.25, .25], atol=1e-12)
    assert_allclose(project_xy([0, 0, -3], 45, 1), [0, 0], atol=1e-12)
    assert_allclose(project_xy([1, 1, -4], 60, 1),
                    np.asarray(project_xy([1, 1, -2], 60, 1))/2)
    plane = np.array([-1, 0, 0, 1])
    inside, outside = np.array([0., 0, 0, 1]), np.array([2., 0, 0, 1])
    result = clip_one_plane(inside, outside, plane)
    assert_allclose(result, [[0, 0, 0, 1], [1, 0, 0, 1]])
    assert_allclose(clip_one_plane(outside, inside, plane), result[::-1])
    assert clip_one_plane(outside, outside*2, plane) is None
    boundary = np.array([1., 0, 0, 1])
    assert_allclose(clip_one_plane(boundary, boundary, plane), [boundary, boundary])
    assert_allclose(clip_one_plane(inside, inside*.5, plane), [inside, inside*.5])
    print("8 项检查通过：相似三角形、反向线段、全外、边界与全内。")


if __name__ == "__main__":
    try:
        check()
    except NotImplementedError as error:
        print(f"练习还未完成：{error}")
