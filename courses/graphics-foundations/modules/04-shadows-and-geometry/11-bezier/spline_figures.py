"""分段、局部支撑、有理权重；几何求值都交给 core.py / splines.py。"""

import numpy as np

BLUE, GREEN, GOLD, WHITE, MUTED, RED = (
    "#78b9f5",
    "#79d6b0",
    "#f0cd82",
    "#e7edf4",
    "#8292a8",
    "#ec8b91",
)
COLORS = [BLUE, GREEN, GOLD, RED, "#ae9be8", "#72ccd7", "#ddac80"]
CONTROL = [[0, 0], [0.6, 1.8], [1.6, 2.2], [3, 0.1], [4.4, 2.1], [5.4, 1.5], [6, 0]]
KNOTS = {
    "simple": [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4],
    "triple": [0, 0, 0, 0, 2, 2, 2, 4, 4, 4, 4],
}
DEFAULTS = {
    "spline-join": dict(
        left=[[-3, -0.3], [-2.4, 1.6], [-1.0, 1.4], [0, 0]],
        right=[[0.35, -0.4], [1.1, -1.0], [2.4, 1.2], [3.4, 0]],
        mode="C1",
        left_duration=1.0,
        right_duration=1.0,
        tangent_scale=1.5,
    ),
    "bspline-local": dict(control=CONTROL, knots="simple", u=0.75, selected=1),
    "rational-arc": dict(middle=[1, 1], weight=2**-0.5, parameter=0.5),
}
CONTROLS = {
    "spline-join": [
        dict(
            key="mode",
            label="连接约束",
            options=[dict(value=s, label=s) for s in ("free", "C0", "G1", "C1", "C2")],
        ),
        dict(key="left_duration", label="左段时长", min=0.5, max=2.0, step=0.05),
        dict(key="right_duration", label="右段时长", min=0.5, max=2.0, step=0.05),
        dict(
            key="tangent_scale",
            label="G1 手柄倍率",
            when=dict(mode="G1"),
            min=0.1,
            max=3.0,
            step=0.05,
        ),
    ],
    "bspline-local": [
        dict(
            key="knots",
            label="内部结点",
            options=[
                dict(value="simple", label="单重 · 1 / 2 / 3"),
                dict(value="triple", label="三重 · 2"),
            ],
        ),
        dict(
            key="selected",
            label="观察控制点",
            options=[dict(value=i, label=f"P{i}") for i in range(7)],
        ),
    ],
    "rational-arc": [],
}


def _mapped_handle(d, point, key, label, *, scale=1, offset=(0, 0), **kwargs):
    d.handle(np.asarray(point) * scale + offset, key, label, **kwargs)
    d.handles[-1]["mapping"] = dict(scale=[scale, scale], offset=list(offset))


def _vector_panel(d, key, bounds, left, right, title, unit):
    """两侧始终共用同一个显示倍率；数值保留真实时间单位。"""
    xmin, xmax, ymin, ymax = bounds
    center = np.array([(xmin + xmax) / 2, ymin + 1.05])
    multiplier = 0.8 / max(np.linalg.norm(left), np.linalg.norm(right), 1e-12)
    with d.panel(key, bounds):
        d.text([xmin + 0.18, ymax - 0.25], title, WHITE, 13)
        d.line([center + [-0.95, 0], center + [0.95, 0]], MUTED, 0.7, 0.5)
        d.line([center + [0, -0.75], center + [0, 0.75]], MUTED, 0.7, 0.5)
        d.arrow(center, center + multiplier * left, BLUE)
        # 右侧用细线与小头，相等时蓝色轮廓仍可见；零向量只留原点。
        end = center + multiplier * right
        d.line([center, end], GREEN, 1.3)
        length = np.linalg.norm(right)
        if length > 1e-12:
            direction = right / length
            normal = np.array([-direction[1], direction[0]])
            d.polygon(
                [
                    end,
                    end - 0.08 * direction + 0.027 * normal,
                    end - 0.08 * direction - 0.027 * normal,
                ],
                GREEN,
                1,
            )
        d.dot(center, WHITE, 0.035)
        d.text(
            [xmin + 0.18, ymin + 0.28],
            f"左 {np.linalg.norm(left):.3g} · 右 {np.linalg.norm(right):.3g} {unit}",
            MUTED,
            12,
        )


def spline_join(p, t, Drawing, curve_core, spline_core, encode):
    left = np.asarray(p["left"], float)
    right = np.asarray(p["right"], float)
    timing = dict(left_duration=p["left_duration"], right_duration=p["right_duration"])
    undefined = False
    try:
        left, right = spline_core.cubic_join(
            left, right, p["mode"], **timing, tangent_scale=p["tangent_scale"]
        )
    except ValueError:
        if p["mode"] != "G1" or np.linalg.norm(left[3] - left[2]) > 1e-12:
            raise
        left, right = spline_core.cubic_join(left, right, "C0", **timing)
        undefined = True
    info = spline_core.join_diagnostics(left, right, **timing)
    d = Drawing((-4.4, 4.4, -4.35, 3.3))
    # 固定映射不追着正在编辑的点缩放；只在切换模式或时长时预留范围。
    ratio = p["right_duration"] / p["left_duration"]
    extent = {
        "free": 1,
        "C0": 1,
        "G1": max(1, p["tangent_scale"]),
        "C1": max(1, ratio),
        "C2": max(1, ratio + ratio**2),
    }[p["mode"]]
    scale = 0.82 / extent
    offset = np.array([0.0, 0.8])
    # 视图在一次编辑中缓存边界。报告新包络仅供显式 F / 恢复视图使用，
    # 参数到图形的映射保持不变，拖点时不会自动追随或缩放。
    envelope = (
        np.concatenate([left, right, np.asarray(p["left"]), np.asarray(p["right"])])
        * scale
        + offset
    )
    low, high = envelope.min(axis=0) - 0.35, envelope.max(axis=0) + 0.35
    plot_bounds = (
        min(-4.35, low[0]),
        max(4.35, high[0]),
        min(-1.4, low[1]),
        max(3.25, high[1]),
    )
    d.bounds = (
        min(-4.4, plot_bounds[0]),
        max(4.4, plot_bounds[1]),
        min(-4.35, plot_bounds[2]),
        max(3.3, plot_bounds[3]),
    )
    with d.panel("joined-curves", plot_bounds):
        d.text([-4.05, 2.9], "两段三次曲线", WHITE, 14)
        mode = (
            "G1 未定义 · 仅连接位置" if undefined else f"{p['mode']} · 约束点自动联动"
        )
        d.text([-4.05, -1.02], mode, RED if undefined else MUTED, 12)
        sample = np.linspace(0, 1, 161)
        for name, control, color in (("left", left, BLUE), ("right", right, GREEN)):
            d.line(control * scale + offset, color, 1, 0.55, dash=True)
            d.line(curve_core.evaluate(control, sample) * scale + offset, color, 3)
            locked = (
                {"free": 0, "C0": 1, "G1": 2, "C1": 2, "C2": 3}[p["mode"]]
                if name == "right"
                else 0
            )
            if undefined and name == "right":
                locked = 1
            for i, point in enumerate(control):
                label = ("P" if name == "left" else "Q") + str(i)
                if i >= locked:
                    _mapped_handle(
                        d,
                        point,
                        name,
                        label,
                        scale=scale,
                        offset=offset,
                        index=i,
                        limits=[-5, 5, -2.5, 2.25],
                    )
                else:
                    d.dot(point * scale + offset, color, 0.05)
                    if i:
                        d.text(point * scale + offset + [0.1, 0.17], label, color, 12)
        gap = np.linalg.norm(info["endpoint_gap"])
        d.text([1.4, 2.9], f"接点距离 {gap:.3g}", GOLD, 12)
    _vector_panel(
        d,
        "join-velocity",
        (-4.35, -0.15, -4.3, -1.55),
        info["left_velocity"],
        info["right_velocity"],
        "端点 · 两侧速度",
        "单位/s",
    )
    _vector_panel(
        d,
        "join-acceleration",
        (0.15, 4.35, -4.3, -1.55),
        info["left_acceleration"],
        info["right_acceleration"],
        "端点 · 两侧加速度",
        "单位/s²",
    )
    d.formula = (
        r"\begin{aligned}"
        r"v_L&=\frac{3(P_3-P_2)}{T_L},\quad v_R=\frac{3(Q_1-Q_0)}{T_R}\\"
        r"a_L&=\frac{6(P_3-2P_2+P_1)}{T_L^2}\\"
        r"a_R&=\frac{6(Q_2-2Q_1+Q_0)}{T_R^2}"
        r"\end{aligned}"
    )
    d.values = {
        "约束": p["mode"],
        "G1 状态": (
            "左端切向为零，方向未定义；未施加 G1"
            if undefined
            else (
                "位置未接上"
                if not info["c0"]
                else (
                    "同向"
                    if info["g1"]
                    else ("不同向" if info["g1_defined"] else "存在零切向，未定义")
                )
            )
        ),
        "有效左控制点": left.round(6).tolist(),
        "有效右控制点": right.round(6).tolist(),
        "左 / 右时长": [p["left_duration"], p["right_duration"]],
        "左 / 右速度": [
            info["left_velocity"].round(6).tolist(),
            info["right_velocity"].round(6).tolist(),
        ],
        "左 / 右加速度": [
            info["left_acceleration"].round(6).tolist(),
            info["right_acceleration"].round(6).tolist(),
        ],
        "位置 / 速度 / 加速度差": [
            float(np.linalg.norm(info[k]))
            for k in ("endpoint_gap", "velocity_gap", "acceleration_gap")
        ],
        "检验 C0 / C1 / C2": [bool(info[k]) for k in ("c0", "c1", "c2")],
        "箭头": "每组两侧使用相同倍率；速度与加速度两幅各自缩放，不能跨幅比较箭头长度",
    }
    return d


def bspline_local(p, t, Drawing, curve_core, spline_core, encode):
    points = np.asarray(p["control"], float)
    knots = KNOTS[p["knots"]]
    u, index = float(np.clip(p["u"], 0, 4)), int(p["selected"])
    sample = np.linspace(0, 4, 401)
    basis = spline_core.bspline_basis(knots, 3, sample)
    weights = spline_core.bspline_basis(knots, 3, u)
    curve = spline_core.evaluate_bspline(points, knots, 3, sample)
    point = spline_core.evaluate_bspline(points, knots, 3, u)
    reference = points.copy()
    reference[index] = CONTROL[index]
    baseline = spline_core.evaluate_bspline(reference, knots, 3, sample)
    d = Drawing((-0.65, 6.8, -4.5, 3.15))
    with d.panel("local-curve", (-0.6, 6.75, -0.8, 3.1)):
        d.text([-0.25, 2.83], "局部控制 · 曲线与控制网", WHITE, 14)
        d.line(baseline, MUTED, 1.3, 0.9, dash=True)
        d.line(points, MUTED, 1, 0.65)
        d.line(curve, WHITE, 2.3)
        affected = (sample >= knots[index]) & (sample <= knots[index + 4])
        d.line(curve[affected], COLORS[index], 4)
        for i, at in enumerate(points):
            d.handle(at, "control", f"P{i}", index=i, limits=[-0.25, 6.25, -0.3, 2.5])
            d.handles[-1]["select"] = dict(selected=i)
        d.dot(point, GOLD, 0.075)
        d.text(point + [0.12, -0.2], f"C({u:.2f})", GOLD, 12)
        d.text(
            [-0.25, -0.53],
            f"高亮 P{index} 的支撑区间 [{knots[index]}, {knots[index+4]}]",
            COLORS[index],
            12,
        )
    origin = np.array([0, -4.0])
    with d.panel("local-basis", (-0.6, 6.75, -4.45, -1.0)):
        d.text([-0.25, -1.3], "七个基函数 · 每个参数处权重和为 1", WHITE, 13)
        d.line([origin, origin + [6, 0]], MUTED, 1)
        for j in range(7):
            d.line(
                origin + np.column_stack([sample * 1.5, basis[:, j] * 2]),
                COLORS[j],
                2.7 if j == index else 1.3,
                1 if j == index else 0.7,
            )
            d.text([j * 0.88, -1.77], f"N{j}", COLORS[j], 12)
        d.line(
            [origin + [u * 1.5, 0], origin + [u * 1.5, 2.05]], GOLD, 1, 0.7, dash=True
        )
        for j, value in enumerate(weights):
            if value > 1e-10:
                d.dot(origin + [u * 1.5, value * 2], COLORS[j], 0.045)
        for knot in sorted(set(knots)):
            at = origin + [1.5 * knot, 0]
            d.line([at, at + [0, -0.05]], MUTED, 1)
            d.text(at + [-0.05, -0.24], str(knot), MUTED, 12)
        _mapped_handle(
            d,
            [u, 0],
            "u",
            "u",
            scale=1.5,
            offset=origin,
            axes=(0,),
            limits=[0, 4, 0, 0],
        )
    d.formula = (
        r"\begin{aligned}"
        r"C(u)&=\sum_i N_{i,3}(u)P_i,\quad\sum_iN_{i,3}(u)=1\\"
        r"\Delta C(u)&=N_{j,3}(u)\,\Delta P_j\\"
        r"N_{j,3}(u)&=0\quad\text{outside }[u_j,u_{j+4}]"
        r"\end{aligned}"
    )
    d.values = {
        "次数 / 控制点数": [3, 7],
        "完整结点向量": knots,
        "参数": u,
        "基函数值": weights.round(7).tolist(),
        "权重和": float(weights.sum()),
        "当前曲线点": point.round(7).tolist(),
        "观察控制点": index,
        "支撑区间": [knots[index], knots[index + 4]],
        "当前受影响点的基函数权重": float(weights[index]),
        "虚线参考": f"其余点沿用当前值，仅 P{index} 回到初始位置；灰线与彩线只在该基函数支撑内不同",
        "内部结点连续性保证": (
            "单重结点至少 C²"
            if p["knots"] == "simple"
            else "u=2 三重结点至少 C⁰；特殊控制点可更光滑"
        ),
    }
    return d


def rational_arc(p, t, Drawing, curve_core, spline_core, encode):
    control = np.array([[1, 0], p["middle"], [0, 1]], float)
    weight = float(np.clip(p["weight"], 0.1, 3))
    parameter = float(np.clip(p["parameter"], 0, 1))
    weights = np.array([1, weight, 1])
    sample = np.linspace(0, 1, 201)
    curve = spline_core.rational_bezier(control, weights, sample)
    ordinary = curve_core.evaluate(control, sample)
    point = spline_core.rational_bezier(control, weights, parameter)
    lifted = np.column_stack([control * weights[:, None], weights])
    homogeneous = curve_core.evaluate(lifted, sample)
    hp = curve_core.evaluate(lifted, parameter)
    d = Drawing((-0.65, 6.55, -4.5, 3.3))
    transform = lambda x: np.asarray(x) * 2 + [0.3, 0.0]
    with d.panel("rational-plane", (-0.6, 3.1, -0.4, 3.25)):
        d.text([-0.25, 2.96], "有理二次曲线", WHITE, 14)
        angle = np.linspace(0, np.pi / 2, 100)
        d.line(
            transform(np.column_stack([np.cos(angle), np.sin(angle)])),
            WHITE,
            1,
            0.65,
            dash=True,
        )
        d.line(transform(control), MUTED, 1, 0.65)
        d.line(transform(ordinary), BLUE, 1.7)
        d.line(transform(curve), GREEN, 3)
        d.dot(transform(point), GOLD, 0.065)
        _mapped_handle(
            d,
            control[1],
            "middle",
            "P1",
            scale=2,
            offset=[0.3, 0],
            limits=[-0.1, 1.25, -0.1, 1.25],
        )
        for i in (0, 2):
            d.dot(transform(control[i]), WHITE, 0.035)
            d.text(transform(control[i]) + [0.1, -0.18], f"P{i}", MUTED, 12)
    with d.panel("rational-weights", (3.1, 6.5, -0.9, 3.25)):
        d.text([3.3, 2.96], "权重与采样参数", WHITE, 14)
        for y, label, color in (
            (2.28, "绿色 · 有理 Bézier", GREEN),
            (1.9, "蓝色 · 普通 Bézier", BLUE),
            (1.52, "虚线 · 单位圆", WHITE),
        ):
            d.text([3.2, y], label, color, 12)
        radial = np.max(np.abs(np.linalg.norm(curve, axis=1) - 1))
        d.text([3.3, 1.02], f"采样最大径向误差", MUTED, 12)
        d.text([3.3, 0.64], "≈ 0" if radial < 1e-12 else f"{radial:.5g}", GOLD, 15)
        d.text([3.3, 0.22], "w₁ · 权重", WHITE, 12)
        d.line([[3.55, 0.0], [5.95, 0.0]], MUTED, 1.5)
        _mapped_handle(
            d,
            [weight, 0],
            "weight",
            f"w₁ {weight:.3f}",
            scale=2.4 / 2.9,
            offset=[3.55 - 0.1 * 2.4 / 2.9, 0],
            axes=(0,),
            limits=[0.1, 3, 0, 0],
        )
        d.text([3.3, -0.34], "t · 参数", WHITE, 12)
        d.line([[3.55, -0.55], [5.95, -0.55]], MUTED, 1.5)
        _mapped_handle(
            d,
            [parameter, 0],
            "parameter",
            f"t {parameter:.2f}",
            scale=2.4,
            offset=[3.55, -0.55],
            axes=(0,),
            limits=[0, 1, 0, 0],
        )
    for axis, x0, letter in ((0, 0, "X"), (1, 3.55, "Y")):
        with d.panel(
            f"homogeneous-{letter}", (x0 - 0.6, x0 + 2.95, -4.45, -1.12), columns=2
        ):
            d.text(
                [x0 - 0.25, -1.4], f"齐次 {letter} / W → {letter.lower()}", WHITE, 13
            )
            origin = np.array([x0, -4.06])
            scale = 2.05 / max(float(np.max(np.abs(lifted))), 1)
            d.line([origin, origin + [2.6, 0]], MUTED, 0.8)
            d.line([origin, origin + [0, 2.25]], MUTED, 0.8)
            d.text(origin + [0.05, 2.16], "W", MUTED, 12)
            d.line(
                [origin + [-0.1, scale], origin + [2.4, scale]],
                WHITE,
                1,
                0.55,
                dash=True,
            )
            d.text(origin + [1.94, scale + 0.1], "W=1", MUTED, 12)
            d.line(origin + scale * lifted[:, [axis, 2]], MUTED, 1, 0.6)
            d.line(origin + scale * homogeneous[:, [axis, 2]], GREEN, 2.3)
            end = origin + scale * hp[[axis, 2]]
            projected = origin + scale * np.array([point[axis], 1])
            d.line([origin, end if hp[2] >= 1 else projected], GOLD, 1.2, 0.8)
            d.dot(end, GREEN, 0.055)
            d.dot(projected, GOLD, 0.055)
            d.text(
                [x0 - 0.25, -4.35],
                f"{hp[axis]:.3g} / {hp[2]:.3g} = {point[axis]:.3g}",
                GOLD,
                12,
            )
    d.formula = (
        r"\begin{aligned}"
        r"\widetilde P_i&=(w_iP_{ix},w_iP_{iy},w_i)\\"
        r"(X,Y,W)&=\sum_{i=0}^2b_i^2(t)\widetilde P_i\\"
        r"R(t)&=(X/W,Y/W)\\"
        r"&=\frac{\sum_i b_i^2(t)w_iP_i}{\sum_i b_i^2(t)w_i}"
        r"\end{aligned}"
    )
    b = curve_core.bernstein(parameter, 2)
    rational_weights = b * weights / np.dot(b, weights)
    d.values = {
        "控制点": control.tolist(),
        "权重": weights.tolist(),
        "t": parameter,
        "普通 Bernstein 权重": b.round(8).tolist(),
        "归一化有理权重": rational_weights.round(8).tolist(),
        "齐次控制点 (w x,w y,w)": lifted.round(8).tolist(),
        "齐次曲线点 (X,Y,W)": hp.round(8).tolist(),
        "投影后曲线点": point.round(8).tolist(),
        "201 个采样点最大径向误差": float(radial),
        "精确四分之一圆的条件": "P0=(1,0), P1=(1,1), P2=(0,1)，权重 (1,1/√2,1)；这里的浮点残差不是数学误差",
        "显示范围": "本图仅用正权重 0.1…3；数值核验中的最大误差是采样值，不是严格上界",
    }
    return d
