"""三维向量的三个同步正交投影视图；数学计算委托给 spatial.py。

浏览器接收已经投影好的矢量图。每个 handle 的 components 指明屏幕横、纵
坐标分别编辑原始三维数组的哪两个分量，其余分量保持不变。
"""

import numpy as np

BLUE, GREEN, YELLOW, PURPLE, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#c5a4ff",
    "#e8edf6",
    "#687c96",
)
SCALE = 0.55
PANELS = (
    (-4.9, (0, 1), "XY · 改 x、y"),
    (0.0, (1, 2), "YZ · 改 y、z"),
    (4.9, (2, 0), "ZX · 改 z、x"),
)


def _view(drawing, center, components, title):
    """返回从同一三维坐标到这个正交投影视图的线性映射。"""
    offset = np.array([center, 0.0])
    names, colors = "xyz", (BLUE, GREEN, PURPLE)
    drawing.text([center - 2.1, 2.55], title, WHITE, 13)
    for i in range(-4, 5):
        q = i * SCALE
        drawing.line([[center - 2.2, q], [center + 2.2, q]], MUTED, 0.6, 0.16)
        drawing.line([[center + q, -2.2], [center + q, 2.2]], MUTED, 0.6, 0.16)
    drawing.line([[center - 2.2, 0], [center + 2.2, 0]], MUTED, 0.9, 0.75)
    drawing.line([[center, -2.2], [center, 2.2]], MUTED, 0.9, 0.75)
    drawing.text(
        [center + 2.12, -0.18], names[components[0]], colors[components[0]], 12
    )
    drawing.text([center + 0.08, 2.05], names[components[1]], colors[components[1]], 12)
    drawing.text([center + SCALE, -0.2], "1", MUTED, 10)
    return lambda points: np.asarray(points)[..., list(components)] * SCALE + offset


def _handle(drawing, project, vector, key, center, components, label):
    drawing.handle(project(vector), key, label, axes=[0, 1], limits=[-2, 2, -2, 2])
    drawing.handles[-1].update(
        id=f"{key}:{components[0]}{components[1]}",
        components=list(components),
        color={"a": BLUE, "b": GREEN, "axis": BLUE, "point": WHITE}[key],
        mapping={"scale": [SCALE, SCALE], "offset": [center, 0]},
    )


def vector_products(p, t, Drawing, core):
    """两根三维向量同时确定投影、夹角、平行四边形与叉积方向。"""
    d = Drawing((-7.4, 7.4, -2.6, 3.05))
    a, b = core.vector3(p["a"]), core.vector3(p["b"])
    product = core.cross(a, b)
    area = core.parallelogram_area(a, b)
    a_nonzero, b_nonzero = np.any(a != 0), np.any(b != 0)
    projection = core.project(a, b) if b_nonzero else None
    angle = core.angle_between(a, b) if a_nonzero and b_nonzero else None
    # 共线时叉积本身仍有定义，只是不能再归一化为垂直方向。
    has_plane = area > 1e-12 * np.linalg.norm(a) * np.linalg.norm(b)
    normal = core.unit(product) if has_plane else None
    arc = None
    if has_plane:
        tangent = core.unit(b - core.project(b, a))
        angles = np.linspace(0, angle, 40)
        arc = 0.75 * (
            np.cos(angles[:, None]) * core.unit(a) + np.sin(angles[:, None]) * tangent
        )
    for center, components, title in PANELS:
        key = "".join("xyz"[i] for i in components)
        with d.panel(key, (center - 2.6, center + 2.6, -2.6, 3.05)):
            view = _view(d, center, components, title)
            origin = view([0, 0, 0])
            d.polygon(view([[0, 0, 0], a, a + b, b]), BLUE, 0.08 + 0.08 * t)
            d.line(view([a, a + b, b]), MUTED, 1.2, 0.8, True)
            d.arrow(origin, view(a), BLUE)
            d.arrow(origin, view(b), GREEN)
            if projection is not None:
                d.line(view([a, projection]), YELLOW, 1.3, 0.8, True)
                d.arrow(origin, view(projection), YELLOW)
                d.dot(view((1 - t) * a + t * projection), YELLOW, 0.055)
            if normal is not None:
                d.arrow(origin, view(normal), PURPLE, "n̂")
                d.line(view(arc), YELLOW, 1.1, 0.8)
            _handle(d, view, a, "a", center, components, "a")
            _handle(d, view, b, "b", center, components, "b")
    d.formula = (
        r"\begin{aligned}"
        r"\operatorname{proj}_{\mathbf b}\mathbf a&="
        r"\frac{\mathbf a\cdot\mathbf b}{\mathbf b\cdot\mathbf b}\mathbf b\\"
        r"A&=\|\mathbf a\times\mathbf b\|\\"
        r"\widehat{\mathbf n}&=\frac{\mathbf a\times\mathbf b}{A}\;(A>0)"
        r"\end{aligned}"
    )
    state = "普通位置"
    if not a_nonzero or not b_nonzero:
        state = "零向量：夹角无定义" + (
            "；投影方向无定义" if not b_nonzero else "；零向量的投影仍为零"
        )
    elif not has_plane:
        state = "共线（或数值上接近共线）：面积近零，垂直方向不唯一"
    d.values = {
        "a": a.round(3).tolist(),
        "b": b.round(3).tolist(),
        "a · b": round(core.dot(a, b), 5),
        "夹角 / °": None if angle is None else round(float(np.rad2deg(angle)), 3),
        "投影": None if projection is None else projection.round(4).tolist(),
        "a × b": product.round(4).tolist(),
        "真实三维面积": round(area, 5),
        "状态": state,
    }
    return d


def axis_rotation(p, t, Drawing, core):
    """绕原点的任意轴旋转；由平行、垂直、叉积三项构造当前点。"""
    d = Drawing((-7.4, 7.4, -2.6, 3.05))
    axis, point = core.vector3(p["axis"]), core.vector3(p["point"])
    valid = np.any(axis != 0)
    angle = np.deg2rad(p["angle"]) * t
    if valid:
        k = core.unit(axis)
        parallel, perpendicular = core.split_along(point, k)
        quarter_turn = core.cross(k, perpendicular)
        cosine_part = np.cos(angle) * perpendicular
        sine_part = np.sin(angle) * quarter_turn
        rotated = core.rotate(point, axis, angle)
        phase = np.linspace(0, 2 * np.pi, 100)
        orbit = (
            parallel
            + np.cos(phase[:, None]) * perpendicular
            + np.sin(phase[:, None]) * quarter_turn
        )
        current_path = (
            parallel
            + np.cos(np.linspace(0, angle, 70)[:, None]) * perpendicular
            + np.sin(np.linspace(0, angle, 70)[:, None]) * quarter_turn
        )
    for center, components, title in PANELS:
        key = "".join("xyz"[i] for i in components)
        with d.panel(key, (center - 2.6, center + 2.6, -2.6, 3.05)):
            view = _view(d, center, components, title)
            origin = view([0, 0, 0])
            d.arrow(origin, view(point), WHITE)
            d.arrow(origin, view(axis), BLUE)
            if valid:
                d.line(view([-3.5 * k, 3.5 * k]), BLUE, 1.0, 0.4, True)
                d.line(view(orbit), MUTED, 1.0, 0.55)
                d.line(view(current_path), YELLOW, 2.1)
                d.arrow(origin, view(parallel), BLUE)
                d.arrow(view(parallel), view(parallel + cosine_part), GREEN)
                d.arrow(view(parallel + cosine_part), view(rotated), PURPLE)
                d.line(view([point, parallel]), GREEN, 1.2, 0.4, True)
                d.dot(view(rotated), YELLOW, 0.065)
            _handle(d, view, axis, "axis", center, components, "轴 a")
            _handle(d, view, point, "point", center, components, "点 p")
    d.formula = (
        r"\mathbf p'=\underbrace{\mathbf p_\parallel}_{\text{沿轴不动}}"
        r"+\cos\theta\,\mathbf p_\perp"
        r"+\sin\theta\,(\widehat{\mathbf k}\times\mathbf p_\perp)"
    )
    if valid:
        d.values = {
            "当前角 / °": round(float(np.rad2deg(angle)), 2),
            "单位轴 k": k.round(4).tolist(),
            "旋转前 p": point.round(4).tolist(),
            "旋转后 p′": rotated.round(4).tolist(),
            "平行分量": parallel.round(4).tolist(),
            "垂直分量": perpendicular.round(4).tolist(),
            "k × p⊥": quarter_turn.round(4).tolist(),
            "旋转前长度": round(float(np.linalg.norm(point)), 5),
            "旋转后长度": round(float(np.linalg.norm(rotated)), 5),
            "轴向坐标（前/后）": [
                round(core.dot(point, k), 5),
                round(core.dot(rotated, k), 5),
            ],
            "状态": (
                "点在轴上：位置保持不变"
                if np.linalg.norm(perpendicular) < 1e-12
                else "绕轴的圆在投影中可能呈椭圆或线段"
            ),
        }
    else:
        d.values = {
            "状态": "零轴：旋转方向无定义，请恢复一个非零轴",
            "旋转前 p": point.round(4).tolist(),
            "旋转后 p′": None,
        }
    return d
