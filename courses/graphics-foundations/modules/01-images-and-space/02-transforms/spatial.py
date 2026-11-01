"""三维向量与任意轴旋转：有限的 3 分量数组，角度统一用弧度。

这里的叉积采用右手坐标系。所有旋转轴都经过原点；绕另一点旋转时，
先减去该点的位置，再旋转，最后加回来。只有 NumPy，没有界面依赖。
"""

import numpy as np


def vector3(value):
    """拒绝形状不符或非有限数，避免广播偷偷改变数学对象。"""
    vector = np.asarray(value, dtype=float)
    if vector.shape != (3,) or not np.isfinite(vector).all():
        raise ValueError("需要三个有限数构成的向量")
    return vector


def unit(vector):
    """零向量没有方向；不能把它随意替换成某个坐标轴。"""
    vector = vector3(vector)
    # 先按最大分量缩放，防止很大/很小的合法向量在平方时溢出/下溢。
    scale = float(np.max(np.abs(vector)))
    if scale == 0:
        raise ValueError("零向量没有可归一化的方向")
    scaled = vector / scale
    return scaled / np.linalg.norm(scaled)


def dot(a, b):
    """点积是逐分量乘积的和；可正、可负、可为零。"""
    return float(np.sum(vector3(a) * vector3(b)))


def angle_between(a, b):
    """两个非零向量的无向夹角，返回 [0, π] 中的弧度值。"""
    cosine = dot(unit(a), unit(b))
    return float(np.arccos(np.clip(cosine, -1.0, 1.0)))


def project(vector, direction):
    """向整条直线投影，方向非零；投影系数允许为负。

    unit(direction) 写法与 (a·b)/(b·b) b 等价，却避免先平方很小的 b。
    零的被投影向量合法；零的投影方向不合法。
    """
    axis = unit(direction)
    return dot(vector, axis) * axis


def cross(a, b):
    """右手叉积。交换输入会反号；零向量或共线向量得到零向量。"""
    ax, ay, az = vector3(a)
    bx, by, bz = vector3(b)
    return np.array([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx])


def parallelogram_area(a, b):
    """边为 a、b 的平行四边形面积；共线时为零。"""
    return float(np.linalg.norm(cross(a, b)))


def split_along(vector, axis):
    """返回沿轴和平面内的两部分，二者相加恢复原向量。"""
    vector = vector3(vector)
    parallel = project(vector, axis)
    return parallel, vector - parallel


def rotation_matrix(axis, angle):
    """Rodrigues 矩阵：R = cosθ I + (1−cosθ) kkᵀ + sinθ [k]×。

    k 为归一化轴，正角遵循右手规则：绕 +z 转 π/2 把 +x 送到 +y。
    零轴即使 angle=0 也被拒绝，避免掩盖调用者尚未定义旋转轴的问题。
    """
    k = unit(axis)
    if not np.isscalar(angle) or not np.isfinite(angle):
        raise ValueError("旋转角必须是有限的弧度值")
    x, y, z = k
    skew = np.array([[0.0, -z, y], [z, 0.0, -x], [-y, x, 0.0]])
    cosine, sine = np.cos(angle), np.sin(angle)
    return cosine * np.eye(3) + (1 - cosine) * np.outer(k, k) + sine * skew


def rotate(vector, axis, angle):
    """按分解式旋转向量，便于逐项对应图中的平行、垂直与叉积项。"""
    k = unit(axis)
    if not np.isscalar(angle) or not np.isfinite(angle):
        raise ValueError("旋转角必须是有限的弧度值")
    parallel, perpendicular = split_along(vector, k)
    return (
        parallel
        + np.cos(angle) * perpendicular
        + np.sin(angle) * cross(k, perpendicular)
    )
