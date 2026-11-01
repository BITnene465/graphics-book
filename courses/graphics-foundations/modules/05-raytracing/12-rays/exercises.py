"""基础射线的两个 TODO；只用 NumPy，直接运行文件自检。"""

import numpy as np
from numpy.testing import assert_allclose


def closest_sphere_t(origin, direction, center, radius, t_min=1e-5, t_max=np.inf):
    """TODO 1：求两个二次根，过滤 [t_min,t_max]，返回最小合法 t。

    无命中返回 +inf；不要假设方向已归一化，也不要只检查较小的根。
    """
    raise NotImplementedError('请完成球的最近合法交点参数')


def reflected(direction, unit_normal):
    """TODO 2：切向分量保留、法向分量反向；不在这里改变方向长度。"""
    raise NotImplementedError('请用点积写出反射方向')


def check():
    center = [0, 0, 0]
    assert_allclose(closest_sphere_t([0, 0, -3], [0, 0, 1], center, 1), 2)
    assert_allclose(closest_sphere_t([0, 0, -3], [0, 0, 2], center, 1), 1)
    assert_allclose(closest_sphere_t([0, 0, 0], [1, 0, 0], center, 1), 1)
    assert_allclose(closest_sphere_t([1, 0, -3], [0, 0, 1], center, 1), 3)
    assert np.isinf(closest_sphere_t([0, 0, 3], [0, 0, 1], center, 1))
    assert_allclose(closest_sphere_t([0, 0, -3], [0, 0, 1], center, 1, 3, 5), 4)
    assert np.isinf(closest_sphere_t([0, 0, -3], [0, 0, 1], center, 1, 0, 1))
    assert_allclose(reflected([1, -1, 0], [0, 1, 0]), [1, 1, 0])
    incoming = np.array([1., -2., .5]); normal = np.array([0., 1., 0.])
    assert_allclose(reflected(reflected(incoming, normal), normal), incoming)
    assert_allclose(np.linalg.norm(reflected(incoming, normal)), np.linalg.norm(incoming))
    print('10 项检查通过：双根、非单位方向、内球、切线、背后、范围和反射。')


if __name__ == '__main__':
    try:
        check()
    except NotImplementedError as error:
        print(f'练习还未完成：{error}')
