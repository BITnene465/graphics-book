"""重心坐标：从二维叉积，到覆盖判断，再到属性插值。仅依赖 NumPy。"""

import numpy as np


def cross2(u, v):
    """二维叉积 uₓvᵧ − uᵧvₓ：有向平行四边形面积，交换 u、v 会变号。"""
    u, v = np.asarray(u, dtype=float), np.asarray(v, dtype=float)
    if u.shape != (2,) or v.shape != (2,):
        raise ValueError("cross2 的输入必须是两个二维向量")
    if not np.isfinite(u).all() or not np.isfinite(v).all():
        raise ValueError("向量坐标必须是有限数")
    return float(u[0] * v[1] - u[1] * v[0])


def barycentric(point, vertices):
    """返回 P 相对 A、B、C 的三个权重；形状分别为 (2,) 与 (3, 2)。

    P−A = λB(B−A) + λC(C−A)。两边分别与 AC、AB 做叉积即可求解；
    最后 λA = 1−λB−λC。分子、分母都是有向面积，不对负权重截断。
    先按边长归一化，再检查面积，避免将固定的像素阈值误用于不同尺度。
    """
    point, vertices = np.asarray(point, dtype=float), np.asarray(vertices, dtype=float)
    if point.shape != (2,) or vertices.shape != (3, 2):
        raise ValueError("point 必须为 (2,)，vertices 必须为 (3, 2)")
    if not np.isfinite(point).all() or not np.isfinite(vertices).all():
        raise ValueError("点和顶点坐标必须是有限数")
    a, b, c = vertices
    ab, ac = b - a, c - a
    scale = max(np.max(np.abs(ab)), np.max(np.abs(ac)))
    if scale == 0:
        raise ValueError("退化三角形：三个顶点重合")
    if not np.isfinite(scale):
        raise ValueError("坐标范围过大，请先缩小场景")
    ab, ac, ap = ab / scale, ac / scale, (point - a) / scale
    denominator = cross2(ab, ac)
    if abs(denominator) <= 32 * np.finfo(float).eps:
        raise ValueError("退化或接近退化的三角形：有向面积相对边长过小")
    weight_b = cross2(ap, ac) / denominator
    weight_c = cross2(ab, ap) / denominator
    return np.array([1 - weight_b - weight_c, weight_b, weight_c])


def is_inside(weights, tolerance=1e-9):
    """三个权重和为 1 且都非负时覆盖此点；容差只用于浮点舍入误差。"""
    weights = np.asarray(weights, dtype=float)
    if weights.shape != (3,) or not np.isfinite(weights).all():
        raise ValueError("weights 必须包含三个有限权重")
    if not np.isfinite(tolerance) or tolerance < 0:
        raise ValueError("tolerance 必须是非负有限数")
    return bool(
        abs(weights.sum() - 1) <= tolerance
        and np.all(weights >= -tolerance)
        and np.all(weights <= 1 + tolerance)
    )


def interpolate(weights, attributes):
    """λA·属性A + λB·属性B + λC·属性C；属性形状为 (3,) 或 (3, 通道数)。

    位置与线性 RGB 都能代入；允许负权重，所以外部点得到的是外推结果。
    """
    weights, attributes = np.asarray(weights, dtype=float), np.asarray(attributes, dtype=float)
    if weights.shape != (3,) or attributes.ndim not in (1, 2) or attributes.shape[0] != 3:
        raise ValueError("需要三个权重，以及形状为 (3,) 或 (3, 通道数) 的属性")
    if not np.isfinite(weights).all() or not np.isfinite(attributes).all():
        raise ValueError("权重与属性必须是有限数")
    return weights @ attributes


def linear_to_srgb(linear):
    """将线性 RGB 编码为显示用 sRGB；先裁到 [0, 1]，再用标准分段函数。"""
    linear = np.asarray(linear, dtype=float)
    if not np.isfinite(linear).all():
        raise ValueError("线性颜色必须是有限数")
    linear = np.clip(linear, 0, 1)
    return np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055)
