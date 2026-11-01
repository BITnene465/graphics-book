"""二维仿射变换：列向量，矩阵在左；正角度逆时针。

点可按 (N, 2) 存成数组，但公式仍是 M @ p。批量实现用转置表达它。
"""

import numpy as np


def translation(tx, ty):
    """平移只改变点的位置，不改变方向向量。"""
    return np.array([[1., 0., tx], [0., 1., ty], [0., 0., 1.]])


def rotation(angle):
    """angle 的单位是弧度。两列分别是旋转后的 x、y 基向量。"""
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, -s, 0.], [s, c, 0.], [0., 0., 1.]])


def scaling(sx, sy):
    """负比例产生反射；零比例是合法但不可逆的压扁操作。"""
    return np.diag([float(sx), float(sy), 1.])


def compose(*matrices):
    """compose(T, R, S) = T @ R @ S；最右边的变换最先作用。"""
    result = np.eye(3)
    for matrix in matrices:
        result = result @ matrix
    return result


def apply(matrix, coordinates, *, vector=False):
    """对点 (...,2) 或向量应用仿射矩阵；点补 1，向量补 0。

    本章只处理仿射变换。投影变换及除以 w 在下一章明确引入。
    """
    matrix, coordinates = np.asarray(matrix, float), np.asarray(coordinates, float)
    if matrix.shape != (3, 3) or coordinates.ndim == 0 or coordinates.shape[-1] != 2:
        raise ValueError("需要 3×3 矩阵，以及末维为 2 的坐标")
    if not np.isfinite(matrix).all() or not np.isfinite(coordinates).all():
        raise ValueError("矩阵与坐标必须有限")
    if not np.array_equal(matrix[2], [0., 0., 1.]):
        raise ValueError("本函数只处理最后一行为 [0, 0, 1] 的仿射矩阵")
    weight = np.full(coordinates.shape[:-1] + (1,), 0. if vector else 1.)
    homogeneous = np.concatenate([coordinates, weight], axis=-1)
    return (homogeneous @ matrix.T)[..., :2]


def inverse(matrix):
    """逆仿射矩阵：先撤销平移，再用 A⁻¹ 撤销线性变换。

    拒绝奇异或数值上接近奇异的线性部分，避免给初学者假的精确答案。
    """
    matrix = np.asarray(matrix, float)
    apply(matrix, [0., 0.])  # 复用形状、有限性和仿射检查。
    linear, offset = matrix[:2, :2], matrix[:2, 2]
    if np.linalg.cond(linear) >= 1 / (32 * np.finfo(float).eps):
        raise ValueError("线性部分奇异或接近奇异，不能可靠地恢复原坐标")
    inverse_linear = np.linalg.inv(linear)
    result = np.eye(3)
    result[:2, :2] = inverse_linear
    result[:2, 2] = -inverse_linear @ offset
    return result
