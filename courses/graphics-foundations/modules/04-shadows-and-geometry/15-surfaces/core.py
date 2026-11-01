"""张量积 Bézier 曲面：求值、微分、三角网格与双三次拼接。

控制网 P[i,j,xyz] 的第一轴沿 u，第二轴沿 v；两个参数都在 [0,1]。
这里使用 float64 教学计算。退化点没有法线或曲率，以 NaN 和 regular=False
明确标记；极端尺度导致的非有限算术结果则拒绝，不替换成看似合理的数值。
"""

from math import comb

import numpy as np


def _control(control):
    points = np.asarray(control, dtype=float)
    if (
        points.ndim != 3
        or points.shape[0] == 0
        or points.shape[1] == 0
        or points.shape[2] != 3
        or not np.isfinite(points).all()
    ):
        raise ValueError("控制网必须是非空、有限的 (nu, nv, 3) 数组")
    return points


def _parameters(u, v):
    u, v = np.broadcast_arrays(np.asarray(u, float), np.asarray(v, float))
    if any(not np.isfinite(t).all() or np.any((t < 0) | (t > 1)) for t in (u, v)):
        raise ValueError("u、v 必须是 [0,1] 内可广播的有限参数")
    return u, v


def _finite(values):
    if not np.isfinite(values).all():
        raise ValueError("计算超出浮点范围，请缩放控制网或参数跨度")
    return values


def _positive(value, name):
    if not np.isscalar(value) or not np.isfinite(value) or value <= 0:
        raise ValueError(f"{name}必须是有限正数")
    return float(value)


def _bernstein(t, degree):
    return np.stack(
        [comb(degree, i) * t**i * (1 - t) ** (degree - i) for i in range(degree + 1)],
        axis=-1,
    )


def _evaluate(points, u, v):
    bu, bv = _bernstein(u, len(points) - 1), _bernstein(v, points.shape[1] - 1)
    return _finite(np.einsum("...i,...j,ijc->...c", bu, bv, points, optimize=True))


def evaluate_patch(control, u, v):
    """S(u,v)=ΣᵢΣⱼ Bᵢᵐ(u) Bⱼⁿ(v) Pᵢⱼ；返回 broadcast(u,v).shape+(3,)。"""
    points = _control(control)
    u, v = _parameters(u, v)
    return _evaluate(points, u, v)


def _casteljau_levels(points, parameter):
    levels = [points.copy()]
    while len(levels[-1]) > 1:
        previous = levels[-1]
        levels.append((1 - parameter) * previous[:-1] + parameter * previous[1:])
    return levels


def de_casteljau_patch(control, u, v, order="u"):
    """以两轮 de Casteljau 求同一个点，返回教学用的所有中间层。

    仅接受标量 u、v。order='u' 先沿 u：first_levels[k] 形状为
    (nu-k,nv,3)，最后一层去掉首轴后是 v 曲线的控制点 intermediate。
    order='v' 先交换控制网前两轴：first_levels[k] 为 (nv-k,nu,3)，
    intermediate 是 u 曲线的控制点。second_levels 再收缩这条曲线，
    最后一层为 (1,3)。position 是该层唯一的点，所有数组独立于输入。
    """
    points = _control(control)
    u, v = _parameters(u, v)
    if u.ndim != 0 or order not in ("u", "v"):
        raise ValueError("构造过程需要标量 u、v，顺序为 u 或 v")
    first, second = (float(u), float(v)) if order == "u" else (float(v), float(u))
    first_levels = _casteljau_levels(
        points if order == "u" else points.swapaxes(0, 1), first
    )
    intermediate = first_levels[-1][0].copy()
    second_levels = _casteljau_levels(intermediate, second)
    return {
        "order": order,
        "first_parameter": first,
        "second_parameter": second,
        "first_levels": first_levels,
        "intermediate": intermediate,
        "second_levels": second_levels,
        "position": _finite(second_levels[-1][0].copy()),
    }


def _partial(points, u, v, u_order, v_order):
    # Bézier 的导数仍是 Bézier：次数 × 相邻控制点的差。
    if u_order >= points.shape[0] or v_order >= points.shape[1]:
        return np.zeros(u.shape + (3,))
    derived = points
    for axis, order in ((0, u_order), (1, v_order)):
        for _ in range(order):
            derived = (derived.shape[axis] - 1) * np.diff(derived, axis=axis)
    return _evaluate(derived, u, v)


def surface_partials(control, u, v):
    """返回局部参数的 du、dv、duu、duv、dvv；包括真实的零导数。"""
    points = _control(control)
    u, v = _parameters(u, v)
    orders = {"du": (1, 0), "dv": (0, 1), "duu": (2, 0), "duv": (1, 1), "dvv": (0, 2)}
    return {name: _partial(points, u, v, *order) for name, order in orders.items()}


def _norm(vector):
    # 避免先平方很大或很小的分量；零向量仍精确返回零。
    scale = np.max(np.abs(vector), axis=-1)
    scaled = np.divide(
        vector, scale[..., None], out=np.zeros_like(vector), where=scale[..., None] != 0
    )
    return scale * np.sqrt(np.sum(scaled * scaled, axis=-1))


def surface_frame(control, u, v, tolerance=1e-12):
    """解析切向量、定向法线、面积缩放和平均/高斯曲率。

    n=(Su×Sv)/|Su×Sv|，dA=|Su×Sv| du dv。regular 要求两个切向量非零，
    且其夹角正弦大于无量纲 tolerance（小于 1）；这是一条数值正则阈值，
    不是忽略整个小尺度曲面的绝对面积阈值。非正则点的 n、H、K 为 NaN。
    H 的符号依赖上述法线朝向，K 与朝向无关；曲率单位为长度⁻¹、长度⁻²。
    """
    tol = _positive(tolerance, "正则阈值")
    if tol >= 1:
        raise ValueError("正则阈值必须小于 1")
    position = evaluate_patch(control, u, v)
    derivatives = surface_partials(control, u, v)
    du, dv = derivatives["du"], derivatives["dv"]
    a, b = _finite(_norm(du)), _finite(_norm(dv))
    unit_u = np.divide(du, a[..., None], out=np.zeros_like(du), where=a[..., None] != 0)
    unit_v = np.divide(dv, b[..., None], out=np.zeros_like(dv), where=b[..., None] != 0)
    unit_cross = np.cross(unit_u, unit_v)
    sine = _norm(unit_cross)
    cross = _finite(np.cross(du, dv))
    area = _finite(_norm(cross))
    regular = (a > 0) & (b > 0) & (sine > tol) & (area > 0)
    normal = np.divide(
        unit_cross,
        sine[..., None],
        out=np.full_like(du, np.nan),
        where=regular[..., None],
    )

    # 先将第一基本形式的两条切向量各自归一化，再计算曲率。
    # 其行列式为 sin²θ，避免 E*G-F² 在近共线处相减丢失精度。
    safe_a, safe_b = np.where(regular, a, 1), np.where(regular, b, 1)
    cosine = np.sum(unit_u * unit_v, axis=-1)
    e = np.sum(derivatives["duu"] * normal, axis=-1) / safe_a / safe_a
    f = np.sum(derivatives["duv"] * normal, axis=-1) / safe_a / safe_b
    g = np.sum(derivatives["dvv"] * normal, axis=-1) / safe_b / safe_b
    denominator = np.where(regular, sine * sine, 1)
    mean = (e + g - 2 * cosine * f) / (2 * denominator)
    gaussian = (e * g - f * f) / denominator
    _finite(mean[regular])
    _finite(gaussian[regular])
    return {
        "position": position,
        **derivatives,
        "cross": cross,
        "area": area,
        "normal": normal,
        "regular": regular,
        "mean_curvature": mean,
        "gaussian_curvature": gaussian,
    }


def patch_mesh(control, divisions=24):
    """均匀参数采样的三角网格；divisions 为整数或 (u 段数,v 段数)。

    顶点按 u 为外层、v 为内层展开。每格两面 (a,b,c)、(a,c,d) 的
    参数域绕序朝 +u×+v，局部细化后的几何绕序趋向解析 Su×Sv 的朝向。
    过粗采样可能跨过曲面折叠，不能保证每个大三角形都保持这个方向。
    三角形只是曲面的分段线性近似，细分数不会改变解析曲面或解析法线。
    退化顶点仍保留；调用方可用 regular 掩码处理，不能虚构法线。
    """
    counts = (divisions, divisions) if np.isscalar(divisions) else tuple(divisions)
    if len(counts) != 2 or any(
        not isinstance(n, (int, np.integer)) or isinstance(n, (bool, np.bool_)) or n < 1
        for n in counts
    ):
        raise ValueError("细分段数应为正整数或两个正整数")
    nu, nv = counts
    u, v = np.meshgrid(
        np.linspace(0, 1, nu + 1), np.linspace(0, 1, nv + 1), indexing="ij"
    )
    frame = surface_frame(control, u, v)
    indices = np.arange((nu + 1) * (nv + 1)).reshape(nu + 1, nv + 1)
    a, b, c, d = indices[:-1, :-1], indices[1:, :-1], indices[1:, 1:], indices[:-1, 1:]
    faces = np.stack(
        [np.stack([a, b, c], axis=-1), np.stack([a, c, d], axis=-1)], axis=-2
    )
    return {
        "vertices": frame["position"].reshape(-1, 3),
        "faces": faces.reshape(-1, 3),
        "uv": np.stack([u, v], axis=-1).reshape(-1, 2),
        "normals": frame["normal"].reshape(-1, 3),
        "regular": frame["regular"].reshape(-1),
    }


def _cubic_pair(left, right, left_span, right_span):
    left, right = _control(left), _control(right)
    if left.shape != (4, 4, 3) or right.shape != (4, 4, 3):
        raise ValueError("拼接要求两个 (4,4,3) 双三次控制网")
    return (
        left,
        right,
        _positive(left_span, "左侧参数跨度"),
        _positive(right_span, "右侧参数跨度"),
    )


def stitch_patches(
    left, right, mode="free", left_span=1, right_span=1, tangent_scale=1
):
    """左 u=1 接右 u=0，同向 v；固定左片，仅改右片必要的控制行。

    C0 令 Q0j=P3j；C1 再令 Q1j=Q0j+(TR/TL)(P3j-P2j)；C2 再令
    Q2j=2Q1j-Q0j+(TR/TL)²(P3j-2P2j+P1j)。TL/TR 是全局参数跨度。
    G1 模式令 Q1j=Q0j+λ(P3j-P2j)，λ=tangent_scale>0：它在正则缝线上
    足以保证一致切平面，但不是一般 G1 的全部形式（还可混入沿缝切向量）。
    构造允许退化网；比例关系本身不能使退化点拥有切平面，请另查 diagnostics。
    返回两份独立数组，未受约束的控制行保留。
    """
    left, right, tl, tr = _cubic_pair(left, right, left_span, right_span)
    scale = _positive(tangent_scale, "横向切线比例")
    if mode not in ("free", "C0", "G1", "C1", "C2"):
        raise ValueError("拼接模式应为 free、C0、G1、C1 或 C2")
    left, right = left.copy(), right.copy()
    if mode != "free":
        right[0] = left[3]
        if mode in ("G1", "C1", "C2"):
            ratio = scale if mode == "G1" else tr / tl
            right[1] = right[0] + ratio * (left[3] - left[2])
        if mode == "C2":
            right[2] = (
                2 * right[1]
                - right[0]
                + (tr / tl) ** 2 * (left[3] - 2 * left[2] + left[1])
            )
    return left, _finite(right)


def join_diagnostics(left, right, v=None, left_span=1, right_span=1, tolerance=1e-9):
    """沿缝采样诊断；c0/c1/c2/g1 仅表示所有给定采样点通过，非全缝证明。

    位置和全局横向一/二阶导数分别使用绝对 tolerance；方向使用两个单位
    向量之差的 tolerance。一般 G1 检查正则点的定向法线是否一致，另外
    报告 proportional_cross_tangents：横向导数本身是否同向。这两者不同。
    normal_angle_degrees 在任一侧非正则时为 NaN，g1_defined 为 False。
    """
    left, right, tl, tr = _cubic_pair(left, right, left_span, right_span)
    tol = _positive(tolerance, "诊断容限")
    v = np.linspace(0, 1, 65) if v is None else np.asarray(v, float)
    if v.size == 0:
        raise ValueError("至少提供一个沿缝采样点")
    l, r = surface_frame(left, 1, v), surface_frame(right, 0, v)
    ld, rd = l["du"] / tl, r["du"] / tr
    ldd, rdd = l["duu"] / tl / tl, r["duu"] / tr / tr
    position_gap, du_gap, duu_gap = r["position"] - l["position"], rd - ld, rdd - ldd
    for value in (ld, rd, ldd, rdd, position_gap, du_gap, duu_gap):
        _finite(value)
    position_error, du_error, duu_error = (
        _finite(_norm(position_gap)),
        _finite(_norm(du_gap)),
        _finite(_norm(duu_gap)),
    )
    c0 = position_error <= tol
    c1, c2 = c0 & (du_error <= tol), c0 & (du_error <= tol) & (duu_error <= tol)
    defined = l["regular"] & r["regular"]
    normal_gap = _norm(l["normal"] - r["normal"])
    normal_cosine = np.clip(np.sum(l["normal"] * r["normal"], axis=-1), -1, 1)
    angle = np.degrees(np.arccos(normal_cosine))
    g1 = c0 & defined & (normal_gap <= tol)
    ln, rn = _norm(ld), _norm(rd)
    lu = np.divide(ld, ln[..., None], out=np.zeros_like(ld), where=ln[..., None] != 0)
    ru = np.divide(rd, rn[..., None], out=np.zeros_like(rd), where=rn[..., None] != 0)
    proportional = (ln > 0) & (rn > 0) & (_norm(lu - ru) <= tol)
    return {
        "v": v.copy(),
        "left_position": l["position"],
        "right_position": r["position"],
        "position_gap": position_gap,
        "position_error": position_error,
        "left_du": ld,
        "right_du": rd,
        "du_gap": du_gap,
        "du_error": du_error,
        "left_duu": ldd,
        "right_duu": rdd,
        "duu_gap": duu_gap,
        "duu_error": duu_error,
        "left_normal": l["normal"],
        "right_normal": r["normal"],
        "left_regular": l["regular"],
        "right_regular": r["regular"],
        "g1_defined": defined,
        "normal_angle_degrees": angle,
        "proportional_cross_tangents": proportional,
        "sample_c0": c0,
        "sample_c1": c1,
        "sample_c2": c2,
        "sample_g1": g1,
        "c0": bool(np.all(c0)),
        "c1": bool(np.all(c1)),
        "c2": bool(np.all(c2)),
        "g1": bool(np.all(g1)),
    }
