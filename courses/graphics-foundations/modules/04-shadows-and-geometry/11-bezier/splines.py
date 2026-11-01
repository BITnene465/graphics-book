"""曲线拼接、局部基函数和正权有理曲线；只有 NumPy，没有界面代码。

B 样条在内部结点处采用右侧片段，在活动域最后端点采用左极限。
导数沿用同一侧：重复结点处返回分段导数，不保证双侧导数存在。
采用 float64 教学计算；有限输入并不保证极端尺度也能稳定求值。
非有限计算结果会拒绝；浮点精度以下的坐标差异仍可能无法分辨。
"""

from math import comb

import numpy as np


def _points(control):
    points = np.asarray(control, dtype=float)
    if (
        points.ndim != 2
        or points.shape[0] == 0
        or points.shape[1] == 0
        or not np.isfinite(points).all()
    ):
        raise ValueError("控制点必须是非空、有限的 (N, D) 数组")
    return points


def _finite_result(values):
    if not np.isfinite(values).all():
        raise ValueError("计算超出浮点范围，请缩放坐标、结点或时长")
    return values


def _positive(value, name):
    if not np.isscalar(value) or not np.isfinite(value) or value <= 0:
        raise ValueError(f"{name}必须是有限正数")
    return float(value)


def _cubic_pair(left, right, left_duration, right_duration):
    left, right = _points(left), _points(right)
    if left.shape != right.shape or len(left) != 4:
        raise ValueError("两段三次 Bézier 必须具有相同的 (4, D) 形状")
    tl = _positive(left_duration, "左段时长")
    tr = _positive(right_duration, "右段时长")
    return left, right, tl, tr


def cubic_join(
    left,
    right,
    mode="free",
    left_duration=1,
    right_duration=1,
    tangent_scale=1,
):
    """固定左段，只约束右段必要的前几个控制点，返回两份独立数组。

    每段局部参数为 [0,1]，时长 TL、TR 把它换算为全局时间。
    G1 的 tangent_scale > 0 仅要求切线同向；零切线没有几何方向。
    C1/C2 约束全局时间的一阶/二阶导数，允许导数为零。
    """
    left, right, tl, tr = _cubic_pair(left, right, left_duration, right_duration)
    if mode not in ("free", "C0", "G1", "C1", "C2"):
        raise ValueError("拼接模式应为 free、C0、G1、C1 或 C2")
    scale = _positive(tangent_scale, "切线比例")
    left, right = left.copy(), right.copy()
    if mode == "free":
        return left, right

    right[0] = left[3]
    tangent = left[3] - left[2]
    if mode == "G1":
        if not np.any(tangent):
            raise ValueError("左段端点的切线为零，G1 几何方向未定义")
        right[1] = right[0] + scale * tangent
    elif mode in ("C1", "C2"):
        ratio = tr / tl
        right[1] = right[0] + ratio * tangent
        if mode == "C2":
            right[2] = (
                2 * right[1] - right[0] + ratio**2 * (left[3] - 2 * left[2] + left[1])
            )
    return left, _finite_result(right)


def _unit(vector):
    """先缩放再归一化；很小的非零向量也有方向。"""
    scale = np.max(np.abs(vector))
    if scale == 0:
        return None
    scaled = vector / scale
    return scaled / np.linalg.norm(scaled)


def join_diagnostics(left, right, left_duration=1, right_duration=1, tolerance=1e-9):
    """从实际控制点独立检查连接，绝对误差容限作用于端点及导数。

    c1 包含 c0，c2 包含 c1，g1 包含 c0。g1_defined 只表示两条
    端点切线都非零；零切线时 tangent_cosine=None，g1=False。
    G1 方向判定为两个单位切向量的差不超过 tolerance。
    """
    left, right, tl, tr = _cubic_pair(left, right, left_duration, right_duration)
    tol = _positive(tolerance, "误差容限")
    lv = 3 * (left[3] - left[2]) / tl
    rv = 3 * (right[1] - right[0]) / tr
    la = 6 * (left[3] - 2 * left[2] + left[1]) / tl**2
    ra = 6 * (right[2] - 2 * right[1] + right[0]) / tr**2
    endpoint_gap, velocity_gap, acceleration_gap = right[0] - left[3], rv - lv, ra - la
    _finite_result(
        np.array([lv, rv, la, ra, endpoint_gap, velocity_gap, acceleration_gap])
    )
    c0 = bool(np.linalg.norm(endpoint_gap) <= tol)
    c1 = c0 and bool(np.linalg.norm(velocity_gap) <= tol)
    c2 = c1 and bool(np.linalg.norm(acceleration_gap) <= tol)
    unit_left, unit_right = _unit(lv), _unit(rv)
    defined = unit_left is not None and unit_right is not None
    cosine = float(np.clip(unit_left @ unit_right, -1, 1)) if defined else None
    g1 = c0 and defined and bool(np.linalg.norm(unit_left - unit_right) <= tol)
    return {
        "endpoint_gap": endpoint_gap,
        "left_velocity": lv,
        "right_velocity": rv,
        "left_acceleration": la,
        "right_acceleration": ra,
        "velocity_gap": velocity_gap,
        "acceleration_gap": acceleration_gap,
        "g1_defined": defined,
        "tangent_cosine": cosine,
        "g1": g1,
        "c0": c0,
        "c1": c1,
        "c2": c2,
    }


def _spline_inputs(knots, degree, u):
    if (
        not isinstance(degree, (int, np.integer))
        or isinstance(degree, (bool, np.bool_))
        or not 0 <= degree <= 8
    ):
        raise ValueError("B 样条次数必须是 0 到 8 的整数")
    knots = np.asarray(knots, dtype=float)
    if (
        knots.ndim != 1
        or len(knots) < 2 * (degree + 1)
        or not np.isfinite(knots).all()
        or np.any(np.diff(knots) < 0)
    ):
        raise ValueError("结点须为有限、非递减的一维数组，且至少有 2(p+1) 个")
    if np.max(np.unique(knots, return_counts=True)[1]) > degree + 1:
        raise ValueError("同一结点的重数不能超过 p+1")
    count = len(knots) - degree - 1
    start, end = knots[degree], knots[count]
    if not start < end:
        raise ValueError("活动参数域 [U[p], U[N]] 必须具有正长度")
    u = np.asarray(u, dtype=float)
    if not np.isfinite(u).all() or np.any((u < start) | (u > end)):
        raise ValueError(f"参数必须位于活动域 [{start:g}, {end:g}]")
    return knots, int(degree), u, count


def _basis_levels(knots, degree, u, count):
    """Cox–de Boor 自底向上递推；0/0 对应的项定义为零。"""
    values = ((u[..., None] >= knots[:-1]) & (u[..., None] < knots[1:])).astype(float)
    # 最后活动端点选择其左侧非空区间；递推仍使用准确的端点 u。
    # 这样不会用 nextafter 扰动端点，内部重复结点仍保持右连续。
    final_span = np.searchsorted(knots, knots[count], side="left") - 1
    endpoint_values = np.zeros(len(knots) - 1)
    endpoint_values[final_span] = 1
    values = np.where((u == knots[count])[..., None], endpoint_values, values)
    levels = [values]
    for order in range(1, degree + 1):
        n = len(knots) - order - 1
        left_width = knots[order : order + n] - knots[:n]
        right_width = knots[order + 1 : order + n + 1] - knots[1 : n + 1]
        left = np.divide(
            u[..., None] - knots[:n],
            left_width,
            out=np.zeros(u.shape + (n,)),
            where=left_width != 0,
        )
        right = np.divide(
            knots[order + 1 : order + n + 1] - u[..., None],
            right_width,
            out=np.zeros(u.shape + (n,)),
            where=right_width != 0,
        )
        values = left * values[..., :n] + right * values[..., 1 : n + 1]
        levels.append(values)
    return levels


def bspline_basis(knots, degree, u):
    """返回形状 u.shape+(N,) 的非负局部基函数，N=len(U)-p-1。

    允许非均匀结点，控制点数量至少 p+1，结点重数最多 p+1。
    定义域为 [U[p], U[N]]。内部半开区间 [U[i], U[i+1])
    保持右连续；最后端点取左极限（开区间夹持结点会精确插值末点）。
    """
    knots, degree, u, count = _spline_inputs(knots, degree, u)
    return _finite_result(_basis_levels(knots, degree, u, count)[degree])


def basis_derivative(knots, degree, u, order=1):
    """B 样条基函数的分段导数；order=0 等于基函数本身。

    N'ᵢ,ₚ = p Nᵢ,ₚ₋₁/(Uᵢ₊ₚ−Uᵢ) − p Nᵢ₊₁,ₚ₋₁/(Uᵢ₊ₚ₊₁−Uᵢ₊₁)。
    递归应用得到高阶导数。内部结点取右侧，最后端点取左侧；
    若结点两侧不连续，该结果不是跨越结点的双侧导数。
    """
    knots, degree, u, count = _spline_inputs(knots, degree, u)
    if (
        not isinstance(order, (int, np.integer))
        or isinstance(order, (bool, np.bool_))
        or not 0 <= order <= 8
    ):
        raise ValueError("导数阶数必须是 0 到 8 的整数")
    if order > degree:
        return np.zeros(u.shape + (count,))
    derivatives = _basis_levels(knots, degree, u, count)
    for derivative_order in range(1, order + 1):
        next_derivatives = [None] * (degree + 1)
        for p in range(derivative_order, degree + 1):
            n = len(knots) - p - 1
            left_width = knots[p : p + n] - knots[:n]
            right_width = knots[p + 1 : p + n + 1] - knots[1 : n + 1]
            left = np.divide(p, left_width, out=np.zeros(n), where=left_width != 0)
            right = np.divide(p, right_width, out=np.zeros(n), where=right_width != 0)
            lower = derivatives[p - 1]
            next_derivatives[p] = left * lower[..., :n] - right * lower[..., 1 : n + 1]
        derivatives = next_derivatives
    return _finite_result(derivatives[degree])


def _rational_weights(weights, count):
    weights = np.asarray(weights, dtype=float)
    if (
        weights.shape != (count,)
        or not np.isfinite(weights).all()
        or np.any(weights <= 0)
    ):
        raise ValueError("每个控制点须有一个有限正权重")
    # 有理曲线不受所有权重的共同缩放影响，先缩放避免大权重乘法溢出。
    weights = weights / weights.max()
    if np.any(weights == 0):
        raise ValueError("权重比例超出了浮点数可表示范围")
    return weights


def _weighted_curve(points, basis, weights):
    weighted = basis * weights
    total = weighted.sum(axis=-1, keepdims=True)
    if np.any(total <= 0) or not np.isfinite(total).all():
        raise ValueError("有理曲线的加权分母超出浮点范围，请减小权重差异")
    return _finite_result((weighted / total) @ points)


def evaluate_bspline(control, knots, degree, u, weights=None):
    """普通 B 样条或正权 NURBS：Σ Nᵢ wᵢ Pᵢ / Σ Nᵢ wᵢ。"""
    points = _points(control)
    basis = bspline_basis(knots, degree, u)
    if basis.shape[-1] != len(points):
        raise ValueError("结点数量必须等于控制点数量 N 加 p+1")
    if weights is None:
        return _finite_result(basis @ points)
    return _weighted_curve(points, basis, _rational_weights(weights, len(points)))


def rational_bezier(control, weights, t):
    """正权有理 Bézier；等价于对 (wP,w) 作多项式求值后齐次除法。

    归一化后的权重 Bᵢ(t)wᵢ/ΣBⱼ(t)wⱼ 非负且和为 1，因此曲线
    在控制点凸包内。实现直接列出 Bernstein 公式，便于独立阅读。
    """
    points = _points(control)
    weights = _rational_weights(weights, len(points))
    t = np.asarray(t, dtype=float)
    if not np.isfinite(t).all() or np.any((t < 0) | (t > 1)):
        raise ValueError("参数必须位于 [0,1]")
    degree = len(points) - 1
    basis = np.stack(
        [comb(degree, i) * t**i * (1 - t) ** (degree - i) for i in range(degree + 1)],
        axis=-1,
    )
    return _weighted_curve(points, basis, weights)
