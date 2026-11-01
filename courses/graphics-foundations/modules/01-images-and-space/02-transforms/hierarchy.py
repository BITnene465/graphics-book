"""一般仿射坐标架与二维两连杆 FK；列向量约定，角度统一用弧度。

基矩阵的列是用世界坐标表示的三根基向量。一般基可以既不垂直也不等长，
改写坐标需要解线性方程，不能直接拿点积充当逆矩阵。这里只用 NumPy。
"""

import numpy as np


def _finite_array(value, shape, name):
    result = np.asarray(value, dtype=float)
    if result.shape != shape or not np.isfinite(result).all():
        raise ValueError(f"{name} 需要形状 {shape} 的有限数")
    return result


def vector3(value):
    return _finite_array(value, (3,), "三维向量")


def basis_matrix(basis_x, basis_y, basis_z):
    """每列是一根基向量，而非基向量的端点；原点另行保存。"""
    return np.column_stack([vector3(v) for v in (basis_x, basis_y, basis_z)])


def basis_diagnostics(basis, rcond=1e-6):
    """用相对奇异值检查退化，不拿依赖单位尺度的 det≈0 代替条件数。

    singular 表示数值秩不足，near_singular 表示仍可逆但坐标极敏感。
    后两者都不供本教学演示求解。共同缩放三根基不改变这个相对判据。
    """
    basis = _finite_array(basis, (3, 3), "基矩阵")
    if not np.isscalar(rcond) or not np.isfinite(rcond) or not 0 < rcond < 1:
        raise ValueError("rcond 必须在 0 与 1 之间")
    scale = float(np.max(np.abs(basis)))
    if scale == 0:
        return dict(state="singular", relative_min=0.0, condition=None)
    singular_values = np.linalg.svd(basis / scale, compute_uv=False)
    ratio = float(singular_values[-1] / singular_values[0])
    if ratio <= 3 * np.finfo(float).eps:
        state = "singular"
    elif ratio <= rcond:
        state = "near_singular"
    else:
        state = "regular"
    return dict(
        state=state, relative_min=ratio, condition=None if ratio == 0 else 1 / ratio
    )


def world_to_local(point, origin, basis, rcond=1e-6):
    """解 Bc=p−o。拒绝数值退化/近奇异基，不返回貌似可靠的坐标。"""
    point, origin = vector3(point), vector3(origin)
    basis = _finite_array(basis, (3, 3), "基矩阵")
    state = basis_diagnostics(basis, rcond)["state"]
    if state != "regular":
        raise ValueError(f"基为 {state}，无法稳定改写坐标")
    return np.linalg.solve(basis, point - origin)


def local_to_world(coordinates, origin, basis):
    """p=o+Bc；即便 B 退化，正向的线性组合也仍然有定义。"""
    basis = _finite_array(basis, (3, 3), "基矩阵")
    return vector3(origin) + basis @ vector3(coordinates)


def rigid2(angle, translation=(0, 0)):
    """二维刚体齐次矩阵 T(translation)R(angle)，先旋转后平移。"""
    if not np.isscalar(angle) or not np.isfinite(angle):
        raise ValueError("角度必须是有限的弧度值")
    x, y = _finite_array(translation, (2,), "二维平移")
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, -s, x], [s, c, y], [0.0, 0.0, 1.0]])


def apply2(matrix, points):
    """将一个点 (2,) 或一批点 (...,2) 从局部送到外部坐标架。"""
    matrix = _finite_array(matrix, (3, 3), "二维齐次矩阵")
    if not np.array_equal(matrix[2], [0, 0, 1]):
        raise ValueError("这里只接受仿射矩阵，最后一行必须是 [0,0,1]")
    points = np.asarray(points, dtype=float)
    if points.ndim < 1 or points.shape[-1] != 2 or not np.isfinite(points).all():
        raise ValueError("点需要形状 (...,2) 的有限数")
    return points @ matrix[:2, :2].T + matrix[:2, 2]


def two_link_fk(base, parent_angle, child_angle, length1, length2):
    """返回父架 M₁、子架 M₂ 和世界坐标下的 [基座, 肘, 末端]。

    M₁=T(base)R(θ₁)，M₂=M₁T(L₁,0)R(θ₂)。第二个角相对父架，
    不是相对世界；长度允许为零但不能为负。本函数只做正向运动学。
    """
    lengths = _finite_array([length1, length2], (2,), "连杆长度")
    if np.any(lengths < 0):
        raise ValueError("连杆长度不能为负")
    parent = rigid2(parent_angle, base)
    child = parent @ rigid2(child_angle, [length1, 0])
    joints = np.array(
        [apply2(parent, [0, 0]), apply2(child, [0, 0]), apply2(child, [length2, 0])]
    )
    return parent, child, joints
