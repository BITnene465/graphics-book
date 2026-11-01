"""曲面章的三个数学窗口；曲面、偏导与接缝诊断由 core.py 求值。"""

import numpy as np

BLUE, GREEN, GOLD = "#78b9f5", "#79d6b0", "#f0cd82"
WHITE, MUTED, RED = "#e7edf4", "#8292a8", "#ec8b91"
COLORS = [BLUE, GREEN, GOLD, "#bd9bea"]

DEFAULTS = {
    "patch-construction": dict(uv=[0.38, 0.62], height=1.0, order="v"),
    "patch-frame": dict(uv=[0.38, 0.62], squeeze=1.0, bend=0.6, twist=0.45),
    "patch-seam": dict(
        right=[[0.12, 0.2], [0.65, 0.85], [1.25, -0.15], [2, 0.3]],
        mode="C1",
        left_span=1.0,
        right_span=1.0,
        tangent_scale=1.7,
        v=0.5,
    ),
}
CONTROLS = {
    "patch-construction": [
        dict(
            key="order",
            label="先求值的方向",
            options=[
                dict(value="v", label="先 v → 后 u"),
                dict(value="u", label="先 u → 后 v"),
            ],
        ),
        dict(key="height", label="控制网起伏", min=-1.5, max=1.5, step=0.05),
    ],
    "patch-frame": [
        dict(key="squeeze", label="v 方向伸缩", min=-1, max=1, step=0.02),
        dict(key="bend", label="弯曲", min=0, max=1.2, step=0.05),
        dict(key="twist", label="扭转", min=-0.8, max=0.8, step=0.05),
    ],
    "patch-seam": [
        dict(
            key="mode",
            label="接缝约束",
            options=[
                dict(value=s, label="自由" if s == "free" else s)
                for s in ("free", "C0", "G1", "C1", "C2")
            ],
        ),
        dict(key="left_span", label="左参数跨度", min=0.5, max=2, step=0.05),
        dict(key="right_span", label="右参数跨度", min=0.5, max=2, step=0.05),
        dict(
            key="tangent_scale",
            label="G1 局部横向倍率",
            min=0.2,
            max=2.5,
            step=0.05,
            when=dict(mode="G1"),
        ),
    ],
}


def _project(points):
    """固定的平行投影：交互时不追随几何自动缩放。"""
    p = np.asarray(points)
    return np.stack(
        [
            p[..., 0] - 0.55 * p[..., 1],
            0.25 * p[..., 0] + 0.32 * p[..., 1] + 0.8 * p[..., 2],
        ],
        -1,
    )


def _visible_step(origin, directions, maximum):
    """只缩短切向小格的参数步长；投影与相机保持固定。"""
    step = maximum
    for direction in np.atleast_2d(directions):
        for value, slope, low, high in zip(
            origin, direction, (-3.15, -1.0), (1.3, 2.85)
        ):
            if slope > 0:
                step = min(step, (high - value) / slope)
            elif slope < 0:
                step = min(step, (low - value) / slope)
    return max(0, step)


def _number(value, digits=4):
    return "≈ 0" if abs(value) < 1e-10 else f"{value:.{digits}g}"


def _graph_net(squeeze=1.0, bend=0.6, twist=0.45):
    """精确表示 (x,s y,b x²+s k x y)，x=2u-1、y=2v-1。"""
    x = np.linspace(-1, 1, 4)
    x2 = np.array([1, -1 / 3, -1 / 3, 1])
    p = np.zeros((4, 4, 3))
    p[..., 0] = x[:, None]
    p[..., 1] = squeeze * x[None, :]
    p[..., 2] = bend * x2[:, None] + squeeze * twist * x[:, None] * x[None, :]
    return p


def _wire(d, core, control, *, color=MUTED, opacity=0.4, scale=1, offset=(0, 0)):
    samples = np.linspace(0, 1, 61)
    for fixed in np.linspace(0, 1, 9):
        for u, v in ((samples, fixed), (fixed, samples)):
            points = core.evaluate_patch(control, u, v)
            d.line(_project(points) * scale + offset, color, 0.9, opacity)


def _uv_panel(d, uv, bounds, title="参数平面 → 曲面上的点"):
    xmin, xmax, ymin, ymax = bounds
    side = min(xmax - xmin - 1.0, ymax - ymin - 1.2)
    origin = np.array([xmin + 0.5, ymax - 0.65 - side])
    with d.panel("parameter-domain", bounds):
        d.text([xmin + 0.2, ymax - 0.3], title, WHITE, 13)
        corners = origin + side * np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])
        d.line(corners, MUTED, 1.1)
        for value in (0.25, 0.5, 0.75):
            d.line(origin + side * np.array([[value, 0], [value, 1]]), MUTED, 0.6, 0.3)
            d.line(origin + side * np.array([[0, value], [1, value]]), MUTED, 0.6, 0.3)
        u, v = uv
        d.line(origin + side * np.array([[u, 0], [u, 1]]), BLUE, 1.5)
        d.line(origin + side * np.array([[0, v], [1, v]]), GREEN, 1.5)
        d.text(origin + [-0.2, -0.25], "0", MUTED, 12)
        d.text(origin + [side - 0.02, -0.25], "u → 1", BLUE, 12)
        d.text(origin + [-0.28, side + 0.05], "v ↑ 1", GREEN, 12)
        d.handle(origin + side * np.asarray(uv), "uv", "(u,v)", limits=[0, 1, 0, 1])
        d.handles[-1]["mapping"] = dict(scale=[side, side], offset=origin.tolist())


def patch_construction(p, t, Drawing, core, encode):
    control = _graph_net(bend=0.65 * p["height"], twist=0.5 * p["height"])
    u, v = np.clip(p["uv"], 0, 1)
    order = p["order"]
    steps = core.de_casteljau_patch(control, u, v, order=order)
    reverse = core.de_casteljau_patch(control, u, v, order="u" if order == "v" else "v")
    samples = np.linspace(0, 1, 101)
    d = Drawing((-3.3, 4.5, -3.4, 2.8))
    with d.panel("surface-construction", (-3.25, 1.7, -1.1, 2.75)):
        d.text([-3, 2.4], "四条曲线，生成一条等参线", WHITE, 14)
        shift, scale = np.array([-0.8, 0.5]), 0.9
        _wire(d, core, control, scale=scale, offset=shift)
        for i, fixed in enumerate(np.linspace(0, 1, 4)):
            # 第一轮的四条控制曲线不是曲面的四条等参线；它们是固定控制网行。
            row = control[i : i + 1] if order == "v" else control[:, i : i + 1]
            curve = core.evaluate_patch(
                row, 0 if order == "v" else samples, samples if order == "v" else 0
            )
            d.line(_project(curve) * scale + shift, COLORS[i], 1.4, 0.75)
        intermediate = np.asarray(steps["intermediate"])
        d.line(_project(intermediate) * scale + shift, GOLD, 1.4, 0.7, dash=True)
        for i, point in enumerate(intermediate):
            d.dot(_project(point) * scale + shift, COLORS[i], 0.045)
        iso = core.evaluate_patch(
            control, samples if order == "v" else u, v if order == "v" else samples
        )
        d.line(_project(iso) * scale + shift, WHITE, 3)
        d.dot(_project(steps["position"]) * scale + shift, GOLD, 0.075)
        d.text(
            [-3, -0.76], f"先固定 {order} = {(v if order == 'v' else u):.2f}", MUTED, 12
        )
    _uv_panel(d, [u, v], (1.85, 4.45, -1.1, 2.75))
    with d.panel("second-casteljau", (-3.25, 4.45, -3.35, -1.3)):
        d.text([-3, -1.62], "第二轮 · 同一个插值比例反复使用", WHITE, 13)
        # 用独立平行投影展开各层，避免原图中的短边重叠遮住过程。
        colors = [MUTED, BLUE, GREEN, GOLD]
        levels = steps["second_levels"]
        for level, points in enumerate(levels):
            center = np.array([-2.25 + level * 1.8, -2.65])
            projected = _project(np.asarray(points)) * 0.6 + center
            d.line(projected, colors[level], 1.8)
            for point in projected:
                d.dot(point, colors[level], 0.05)
            d.text(center + [-0.2, -0.46], f"{len(points)} 点", colors[level], 12)
    d.formula = (
        r"\begin{aligned}Q_i(v)&=\sum_{j=0}^{3}b_j^3(v)P_{ij}\\"
        r"S(u,v)&=\sum_{i=0}^{3}b_i^3(u)Q_i(v)\\"
        r"&=\sum_{i,j}b_i^3(u)b_j^3(v)P_{ij}\end{aligned}"
    )
    if order == "u":
        d.formula = (
            r"\begin{aligned}R_j(u)&=\sum_{i=0}^{3}b_i^3(u)P_{ij}\\"
            r"S(u,v)&=\sum_{j=0}^{3}b_j^3(v)R_j(u)\\"
            r"&=\sum_{i,j}b_i^3(u)b_j^3(v)P_{ij}\end{aligned}"
        )
    d.values = {
        "参数 (u,v)": [float(u), float(v)],
        "第一轮求值方向": order,
        "中间四个控制点": intermediate.round(7).tolist(),
        "曲面点": np.asarray(steps["position"]).round(7).tolist(),
        "交换两轮顺序的位置差": float(
            np.linalg.norm(steps["position"] - reverse["position"])
        ),
        "彩色曲线": "由原控制网的四行或四列单独形成；中间两条一般不在曲面上",
        "白色曲线": "由第一轮得到的四点形成，整条位于曲面上",
        "坐标约定": "P[i,j] 第一轴对应 u、第二轴对应 v；投影仅用于显示",
    }
    return d


def patch_frame(p, t, Drawing, core, encode):
    control = _graph_net(p["squeeze"], p["bend"], p["twist"])
    u, v = np.clip(p["uv"], 0, 1)
    frame = core.surface_frame(control, u, v)
    regular = bool(frame["regular"])
    d = Drawing((-3.3, 4.8, -3.9, 3.0))
    with d.panel("surface-frame", (-3.25, 1.4, -1.1, 2.95)):
        d.text([-3, 2.62], "偏导张成切平面", WHITE, 14)
        shift, scale = np.array([-0.85, 0.35]), 1.1
        _wire(d, core, control, scale=scale, offset=shift)
        s, du, dv = (np.asarray(frame[name]) for name in ("position", "du", "dv"))
        origin = _project(s) * scale + shift
        delta = _visible_step(origin, _project([du, dv, du + dv]) * scale, 0.25)
        corners = np.array([s, s + delta * du, s + delta * (du + dv), s + delta * dv])
        d.polygon(_project(corners) * scale + shift, GOLD, 0.24)
        d.arrow(origin, _project(s + delta * du) * scale + shift, BLUE)
        d.arrow(origin, _project(s + delta * dv) * scale + shift, GREEN)
        if regular:
            length = _visible_step(origin, _project(frame["normal"]) * scale, 0.55)
            d.arrow(
                origin, _project(s + length * frame["normal"]) * scale + shift, GOLD
            )
        d.dot(origin, WHITE, 0.06)
        d.text([-3, -0.43], "蓝 Δu·Su    绿 Δv·Sv    金 法线方向", MUTED, 12)
        d.text([-3, -0.77], f"Δu = Δv = {delta:.3g} · 固定平行投影", MUTED, 12)
    _uv_panel(d, [u, v], (1.6, 4.75, -1.1, 2.95))
    with d.panel("local-area", (-3.25, 4.75, -3.85, -1.3)):
        d.text([-3, -1.65], "微分的线性映射 · 两幅采用相同数值倍率", WHITE, 13)
        area = float(frame["area"])
        # 在切平面自身的正交坐标中画，保留三维长度、夹角和面积。
        # 本例 Su 的 x 分量始终为 2，不会为零；退化时 Sv 的高度为 0。
        length = np.linalg.norm(du)
        a = np.array([length, 0.0])
        b = np.array([np.dot(dv, du / length), area / length])
        corners = np.array([[0, 0], a, a + b, b])
        span = np.ptp(corners, axis=0)
        factor = min(0.55, 2.75 / max(span[0], 1e-12), 1.0 / max(span[1], 1e-12))
        square_origin = np.array([-2.65, -3.18])
        square = square_origin + factor * np.array([[0, 0], [1, 0], [1, 1], [0, 1]])
        d.polygon(square, GOLD, 0.15)
        d.line(np.vstack([square, square[0]]), MUTED, 1.1)
        d.arrow(square_origin, square_origin + [factor, 0], BLUE)
        d.arrow(square_origin, square_origin + [0, factor], GREEN)
        d.text([-3, -2.16], "参数单位格", WHITE, 12)
        d.arrow([-1.5, -2.84], [-0.75, -2.84], MUTED)
        center = np.array([2.2, -2.82])
        translation = center - factor * (corners.min(0) + corners.max(0)) / 2
        quad = corners * factor + translation
        d.polygon(quad, GOLD, 0.24)
        d.line(np.vstack([quad, quad[0]]), GOLD, 1.2)
        d.arrow(quad[0], quad[1], BLUE)
        d.arrow(quad[0], quad[3], GREEN)
        d.text([0.15, -2.16], "切平面中的真实长度与夹角", WHITE, 12)
        d.text([-3, -3.61], "面积 1", MUTED, 12)
        d.text(
            [0.15, -3.61],
            f"面积倍率 {_number(area, 5)}" if regular else "面积 0 · 法线未定义",
            GOLD if regular else RED,
            14,
        )
    d.formula = (
        r"\begin{aligned}S_u&=\partial S/\partial u,\quad S_v=\partial S/\partial v\\"
        r"J_A&=\|S_u\times S_v\|\\"
        r"n&=\frac{S_u\times S_v}{J_A}\quad(J_A>0)\\"
        r"dA&=J_A\,du\,dv\end{aligned}"
    )
    d.values = {
        "曲面点": np.asarray(frame["position"]).round(7).tolist(),
        "Su": np.asarray(frame["du"]).round(7).tolist(),
        "Sv": np.asarray(frame["dv"]).round(7).tolist(),
        "叉积": np.asarray(frame["cross"]).round(7).tolist(),
        "局部面积倍率": float(frame["area"]),
        "上图 Δu = Δv": float(delta),
        "步长说明": "偏导过长时缩小参数小格，保持固定投影；下图仍比较完整偏导张成的单位格线性像",
        "正则": regular,
        "定向单位法线": (
            np.asarray(frame["normal"]).round(7).tolist() if regular else None
        ),
        "平均曲率 H": float(frame["mean_curvature"]) if regular else None,
        "高斯曲率 K": float(frame["gaussian_curvature"]) if regular else None,
        "所用精确曲面": "S=(x,s·y,b·x²+s·k·x·y)，x=2u−1，y=2v−1",
        "伸缩为负": "会反转参数化的定向；它不等于把观察相机翻面",
        "面积解释": "下图画微分对单位方格的线性像，采用切平面内的正交坐标；不是整块非线性曲面的面积",
    }
    return d


def _seam_nets(right):
    left = np.array([[-2, 0.15], [-1.4, 1.0], [-0.55, -0.15], [0, 0]], float)
    y = np.linspace(-1, 1, 4)
    y2 = np.array([1, -1 / 3, -1 / 3, 1])
    nets = []
    for section in (left, np.asarray(right, float)):
        net = np.empty((4, 4, 3))
        net[..., 0] = section[:, 0, None]
        net[..., 1] = y[None, :]
        net[..., 2] = section[:, 1, None] + 0.25 * y2[None, :]
        nets.append(net)
    return nets


def _normal_curvature(frame):
    if not bool(frame["regular"]):
        return None
    return float(
        np.dot(frame["normal"], frame["duu"]) / np.dot(frame["du"], frame["du"])
    )


def patch_seam(p, t, Drawing, core, encode):
    spans = dict(left_span=p["left_span"], right_span=p["right_span"])
    raw_left, raw_right = _seam_nets(p["right"])
    left, right = core.stitch_patches(
        raw_left, raw_right, mode=p["mode"], tangent_scale=p["tangent_scale"], **spans
    )
    v = float(np.clip(p["v"], 0, 1))
    info = core.join_diagnostics(left, right, v=v, **spans)
    lf, rf = core.surface_frame(left, 1, v), core.surface_frame(right, 0, v)
    kl, kr = _normal_curvature(lf), _normal_curvature(rf)
    ratio = p["right_span"] / p["left_span"]
    extent = {
        "free": 1,
        "C0": 1,
        "G1": max(1, p["tangent_scale"]),
        "C1": max(1, ratio),
        "C2": max(1, ratio**2),
    }[p["mode"]]
    scale, offset = 1.5 / extent, np.array([0.0, 0.55])
    crown = 0.25 * (2 * v - 1) ** 2
    sample = np.linspace(0, 1, 151)
    curves = [core.evaluate_patch(net, sample, v)[:, [0, 2]] for net in (left, right)]
    sections = [
        core.de_casteljau_patch(net, 0, v, order="v")["intermediate"][:, [0, 2]]
        for net in (left, right)
    ]
    # 控制点可能远离曲线凸起；F 适配时也必须能找回仍可编辑的手柄。
    envelope = np.concatenate([*curves, *sections]) * scale + offset
    low, high = envelope.min(0) - 0.4, envelope.max(0) + 0.4
    bounds = (
        min(-3.5, low[0]),
        max(3.5, high[0]),
        min(-0.2, low[1]),
        max(2.6, high[1]),
    )
    d = Drawing((bounds[0], bounds[1], -3.6, bounds[3] + 0.1))
    with d.panel("seam-section", bounds):
        d.text([-3.2, 2.3], f"接缝横截面 · v = {v:.2f}", WHITE, 14)
        for section, curve, color in zip(sections, curves, (BLUE, GREEN)):
            d.line(section * scale + offset, color, 1, 0.5, dash=True)
            d.line(curve * scale + offset, color, 3)
        locked = {"free": 0, "C0": 1, "G1": 2, "C1": 2, "C2": 3}[p["mode"]]
        for i, point in enumerate(sections[1]):
            if i < locked:
                d.dot(point * scale + offset, GREEN, 0.045)
            else:
                d.handle(
                    point * scale + offset,
                    "right",
                    f"Q{i}",
                    index=i,
                    limits=[-0.5, 3, -1.5, 1.5],
                )
                d.handles[-1]["mapping"] = dict(
                    scale=[scale, scale], offset=(offset + [0, crown * scale]).tolist()
                )
    with d.panel("seam-tangents", (-3.5, -0.1, -2.25, -0.4)):
        d.text([-3.2, -0.7], "全局参数的一阶导数", WHITE, 13)
        vectors = [np.asarray(info[key])[[0, 2]] for key in ("left_du", "right_du")]
        factor = 0.55 / max(*(np.linalg.norm(a) for a in vectors), 1e-12)
        # 平移到并列原点，保持同一倍率；相等时两根箭头仍完整可见。
        for x, label, vector, color in zip(
            (-2.65, -1.25), ("左", "右"), vectors, (BLUE, GREEN)
        ):
            origin = np.array([x, -1.52])
            d.line([origin + [-0.3, 0], origin + [0.65, 0]], MUTED, 0.6, 0.4)
            d.arrow(origin, origin + factor * vector, color)
            d.dot(origin, color, 0.025)
            d.text(origin + [-0.05, -0.3], label, color, 12)
        d.text(
            [-3.2, -2.1],
            f"同倍率 · 向量差 {_number(float(info['du_error']))}",
            GOLD,
            12,
        )
    with d.panel("seam-curvature", (0.1, 3.5, -2.25, -0.4)):
        d.text([0.3, -0.7], "u 方向的法曲率", WHITE, 13)
        for x, label, value, color in ((0.3, "左", kl, BLUE), (1.92, "右", kr, GREEN)):
            d.text([x, -1.18], label, color, 12)
            d.text(
                [x, -1.67], "未定义" if value is None else _number(value, 5), color, 17
            )
        gap = abs(kl - kr) if kl is not None and kr is not None else None
        d.text(
            [0.3, -2.1],
            "退化处不比较" if gap is None else f"差值 {_number(gap)}",
            GOLD,
            12,
        )
    with d.panel("seam-position", (-3.5, 3.5, -3.55, -2.45)):
        d.text([-3.2, -2.72], "v · 沿接缝检查", WHITE, 13)
        d.line([[-1.1, -2.73], [3.1, -2.73]], MUTED, 1.5)
        d.handle([-1.1 + 4.2 * v, -2.73], "v", "v", axes=(0,), limits=[0, 1, 0, 0])
        d.handles[-1]["mapping"] = dict(scale=[4.2, 4.2], offset=[-1.1, -2.73])
        regular = bool(info["g1_defined"])
        angle = float(info["normal_angle_degrees"]) if regular else None
        text = "法线未定义" if angle is None else f"法线夹角 {_number(angle)}°"
        d.text(
            [-3.2, -3.34],
            f"位置差 {_number(float(info['position_error']))} · {text}",
            MUTED,
            12,
        )
    d.formula = (
        r"\begin{aligned}D_L&=S^L_u(1,v)/T_L,\quad D_R=S^R_u(0,v)/T_R\\"
        r"k_n&=\frac{n\cdot S_{uu}}{S_u\cdot S_u}\quad(J_A>0)\\"
        r"C^1&:\ C^0\ \text{且}\ D_L=D_R\\"
        r"C^2&:\ C^1\ \text{且}\ "
        r"\frac{S^L_{uu}}{T_L^2}=\frac{S^R_{uu}}{T_R^2}\end{aligned}"
    )
    d.values = {
        "模式": p["mode"],
        "沿接缝参数 v": v,
        "左 / 右参数跨度": [p["left_span"], p["right_span"]],
        "当前位置差": float(info["position_error"]),
        "全局一阶导数差": float(info["du_error"]),
        "全局二阶导数差": float(info["duu_error"]),
        "当前 C0 / C1 / C2": [bool(info[k]) for k in ("c0", "c1", "c2")],
        "当前 G1 可定义 / 通过": [bool(info["g1_defined"]), bool(info["g1"])],
        "左 / 右法曲率": [kl, kr],
        "曲率差": abs(kl - kr) if kl is not None and kr is not None else None,
        "法线夹角 (度)": (
            float(info["normal_angle_degrees"]) if bool(info["g1_defined"]) else None
        ),
        "诊断范围": "读数只检查当前 v；控制网的行关系才为整条接缝提供代数保证",
        "G1 构造": "正比例横向导数是充分构造；允许沿边切向混合的一般 G1 更宽泛",
        "曲率范围": "只比较 u 方向的法曲率；一个方向相同不足以证明整张曲面的 G2",
    }
    return d
