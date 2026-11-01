"""三维平面镜像与简单错切；列向量、齐次点，距离与世界坐标同单位。"""

import numpy as np


def unit(vector):
    vector = np.asarray(vector, float)
    if vector.shape != (3,) or not np.isfinite(vector).all():
        raise ValueError("法向需要三个有限分量")
    scale = np.max(np.abs(vector))
    if scale == 0:
        raise ValueError("零法向不能确定一个平面")
    scaled = vector / scale
    return scaled / np.linalg.norm(scaled)


def plane_reflection(normal, distance=0.0):
    """关于 n̂·p=d 的镜像。distance 是沿单位法向的有符号距离。

    p′ = p − 2(n̂·p − d)n̂；这是一个仿射映射，只有 d=0 时是线性映射。
    反转 normal 时也须反转 distance，才仍表示同一个平面。
    """
    n = unit(normal)
    if not np.isscalar(distance) or not np.isfinite(distance):
        raise ValueError("平面距离必须有限")
    matrix = np.eye(4)
    matrix[:3, :3] -= 2 * np.outer(n, n)
    matrix[:3, 3] = 2 * distance * n
    return matrix


def shear_matrix(amount, displacement_axis=0, source_axis=1):
    """令目标分量增加 amount×来源分量，其他分量不变。

    默认 x′=x+k y，y′=y，z′=z；两轴不同保证这是简单错切，det=1。
    """
    if not np.isscalar(amount) or not np.isfinite(amount):
        raise ValueError("错切系数必须有限")
    if displacement_axis not in (0, 1, 2) or source_axis not in (0, 1, 2):
        raise ValueError("坐标轴编号必须为0、1、2")
    if displacement_axis == source_axis:
        raise ValueError("简单错切的两个轴必须不同")
    matrix = np.eye(4)
    matrix[displacement_axis, source_axis] = amount
    return matrix


def transform_points(matrix, points):
    """单点 (3,) 或点数组 (...,3)；只接受最后一行为 [0,0,0,1] 的仿射矩阵。"""
    matrix, points = np.asarray(matrix, float), np.asarray(points, float)
    if matrix.shape != (4, 4) or not np.isfinite(matrix).all():
        raise ValueError("需要有限的4×4矩阵")
    if not np.array_equal(matrix[3], [0, 0, 0, 1]):
        raise ValueError("本函数不执行透视除法")
    if points.ndim < 1 or points.shape[-1] != 3 or not np.isfinite(points).all():
        raise ValueError("点数组的最后一维必须是3个有限坐标")
    return points @ matrix[:3, :3].T + matrix[:3, 3]


def plane_patch(normal, distance=0.0, half_extent=1.8):
    """取无限平面的一块有限方形用于显示；角点顺序的法向为 n̂。"""
    n = unit(normal)
    helper = np.eye(3)[np.argmin(np.abs(n))]
    u = unit(np.cross(n, helper))
    v = np.cross(n, u)
    corners = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]])
    return distance * n + half_extent * (corners[:, :1] * u + corners[:, 1:] * v)
