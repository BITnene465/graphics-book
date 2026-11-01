"""一般三维坐标架与二维父子坐标架；数学计算委托给 hierarchy.py。

两个演示均为静态参数实验，t 仅保留统一调用签名。一般基一次只开放选中
对象的三个投影柄；基向量柄的偏移包含局部原点，写回的仍是向量分量。
"""

import numpy as np

BLUE, GREEN, PURPLE, YELLOW, WHITE, MUTED, RED = (
    "#71b7ff",
    "#76dfb1",
    "#c5a4ff",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
    "#f38c98",
)
SCALE = 0.48
PANELS = (
    (-4.9, (0, 1), "XY · 横 x，纵 y"),
    (0.0, (1, 2), "YZ · 横 y，纵 z"),
    (4.9, (2, 0), "ZX · 横 z，纵 x"),
)
EDIT_LABELS = {
    "point": "p",
    "origin": "o",
    "basis_x": "b₁",
    "basis_y": "b₂",
    "basis_z": "b₃",
}
EDIT_COLORS = dict(
    point=YELLOW, origin=WHITE, basis_x=BLUE, basis_y=GREEN, basis_z=PURPLE
)


def _projection(d, center, components, title):
    d.text([center - 2.05, 2.57], title, WHITE, 13)
    for k in range(-4, 5):
        u = k * SCALE
        d.line([[center - 2.1, u], [center + 2.1, u]], MUTED, 0.65, 0.2)
        d.line([[center + u, -2.1], [center + u, 2.1]], MUTED, 0.65, 0.2)
    d.line([[center - 2.1, 0], [center + 2.1, 0]], MUTED, 0.9, 0.8)
    d.line([[center, -2.1], [center, 2.1]], MUTED, 0.9, 0.8)
    d.text([center + SCALE, -0.2], "1", MUTED, 10)
    d.text([center + 2.0, -0.2], "xyz"[components[0]], MUTED, 11)
    d.text([center + 0.08, 2.0], "xyz"[components[1]], MUTED, 11)
    offset = np.array([center, 0.0])
    return lambda v: np.asarray(v)[..., list(components)] * SCALE + offset


def general_basis(p, t, Drawing, core):
    """世界点固定时，只改写它在可平移、非正交三维坐标架中的坐标。"""
    d = Drawing((-7.35, 7.35, -2.8, 3.0))
    point, origin = core.vector3(p["point"]), core.vector3(p["origin"])
    basis = core.basis_matrix(p["basis_x"], p["basis_y"], p["basis_z"])
    diagnostics = core.basis_diagnostics(basis)
    regular = diagnostics["state"] == "regular"
    coordinates = core.world_to_local(point, origin, basis) if regular else None
    edit = p["edit"]
    if edit not in EDIT_LABELS:
        raise ValueError("edit 必须选择 point、origin 或一根 basis 向量")
    is_basis = edit.startswith("basis_")
    handle_point = origin + core.vector3(p[edit]) if is_basis else core.vector3(p[edit])
    limit = 2.5 if is_basis else (1.5 if edit == "origin" else 3.0)
    for center, components, title in PANELS:
        key = "".join("xyz"[i] for i in components)
        with d.panel(key, (center - 2.6, center + 2.6, -2.5, 3.0)):
            view = _projection(d, center, components, title)
            d.line(view([origin, point]), YELLOW, 1.3, 0.7, True)
            for index, color in enumerate((BLUE, GREEN, PURPLE)):
                d.arrow(view(origin), view(origin + basis[:, index]), color)
                if edit != ("basis_x", "basis_y", "basis_z")[index]:
                    d.text(
                        view(origin + basis[:, index]) + [0.09, 0.1],
                        f"b{index + 1}",
                        color,
                        11,
                    )
            d.dot(view(origin), WHITE, 0.055)
            if edit != "origin":
                d.text(view(origin) + [-0.3, -0.3], "o", WHITE, 12)
            d.dot(view(point), YELLOW, 0.065)
            if edit != "point":
                d.text(view(point) + [0.12, 0.12], "p", YELLOW, 12)
            d.handle(
                view(handle_point),
                edit,
                EDIT_LABELS[edit],
                limits=[-limit, limit, -limit, limit],
            )
            offset = np.array([center, 0.0])
            if is_basis:
                offset += origin[list(components)] * SCALE
            d.handles[-1].update(
                id=f"{edit}:{components[0]}{components[1]}",
                components=list(components),
                color=EDIT_COLORS[edit],
                mapping=dict(scale=[SCALE, SCALE], offset=offset.tolist()),
            )
    states = {
        "regular": "可逆：改变原点或基时，世界点 p 保持不动",
        "singular": "退化（数值秩不足）：三根向量不能唯一确定三维坐标",
        "near_singular": "近奇异：坐标对微小拖动极敏感，暂不显示求解结果",
    }
    state = states[diagnostics["state"]]
    d.formula = (
        r"\begin{aligned}"
        r"B&=[\mathbf b_1\;\mathbf b_2\;\mathbf b_3]\\"
        r"\mathbf p&=\mathbf o+B\mathbf c\\"
        r"\mathbf c&=B^{-1}(\mathbf p-\mathbf o)\; (\det B\ne0)"
        r"\end{aligned}"
    )
    condition = diagnostics["condition"]
    d.values = {
        "世界点 p": point.round(4).tolist(),
        "坐标架原点 o": origin.round(4).tolist(),
        "基矩阵 B（按行列出）": basis.round(4).tolist(),
        "局部坐标 c": None if coordinates is None else coordinates.round(5).tolist(),
        "点积 Bᵀ(p−o)，一般不等于 c": (basis.T @ (point - origin)).round(5).tolist(),
        "det B": round(float(np.linalg.det(basis)), 7),
        "条件数 κ₂(B)": "∞" if condition is None else f"{condition:.3g}",
        "σ最小 / σ最大": f"{diagnostics['relative_min']:.3g}",
        "重建误差 ‖o+Bc−p‖": (
            None
            if coordinates is None
            else f"{np.linalg.norm(core.local_to_world(coordinates, origin, basis) - point):.2e}"
        ),
        "状态": state,
    }
    return d


def _frame(d, matrix, project, core, color, label, length=0.55):
    axes = core.apply2(matrix, [[0, 0], [length, 0], [0, length]])
    d.arrow(project(axes[0]), project(axes[1]), color)
    d.arrow(project(axes[0]), project(axes[2]), color)
    d.text(project(axes[1]) + [0.08, 0.06], "x" + label, color, 11)
    d.text(project(axes[2]) + [0.08, 0.06], "y" + label, color, 11)


def _angle_arc(d, center, start, sweep, radius, project, color):
    angles = np.linspace(start, start + sweep, 40)
    circle = center + radius * np.column_stack([np.cos(angles), np.sin(angles)])
    d.line(project(circle), color, 1.2, 0.8)


def two_link_hierarchy(p, t, Drawing, core):
    """两连杆正向运动学：左边看世界，右边只看子架相对父架的朝向。"""
    d = Drawing((-5.0, 5.0, -3.6, 3.7))
    a, b = np.deg2rad([p["parent_angle"], p["child_angle"]])
    length1, length2 = p["length1"], p["length2"]
    parent, child, joints = core.two_link_fk(p["base"], a, b, length1, length2)
    scale, offset = 0.6, np.array([-1.6, 0.0])
    view = lambda points: np.asarray(points) * scale + offset
    with d.panel("world", (-5.0, 1.95, -3.45, 3.7)):
        d.text([-4.55, 3.36], "世界坐标 · 父子一起移动", WHITE, 13)
        for k in range(-4, 5):
            d.line(view([[-4.6, k], [4.6, k]]), MUTED, 0.6, 0.2)
            d.line(view([[k, -4.6], [k, 4.6]]), MUTED, 0.6, 0.2)
        d.line(view([[-4.6, 0], [4.6, 0]]), MUTED, 0.8, 0.8)
        d.line(view([[0, -4.6], [0, 4.6]]), MUTED, 0.8, 0.8)
        d.text(view([4.5, -0.25]), "xw", MUTED, 11)
        d.text(view([0.12, 4.45]), "yw", MUTED, 11)
        d.line(view(joints[:2]), BLUE, 5, 0.75)
        d.line(view(joints[1:]), GREEN, 5, 0.75)
        _frame(d, parent, view, core, BLUE, "₁")
        _frame(d, child, view, core, GREEN, "₂")
        _angle_arc(d, joints[0], 0, a, 0.45, view, BLUE)
        _angle_arc(d, joints[1], a, b, 0.4, view, GREEN)
        for point, label, color in zip(
            joints, ("基座", "肘", "末端"), (WHITE, GREEN, YELLOW)
        ):
            d.dot(view(point), color, 0.065)
            d.text(view(point) + [-0.1, -0.24], label, color, 11)
        d.handle(view(joints[0]), "base", "基座 b", limits=[-1, 1, -1, 1])
        d.handles[-1].update(
            color=WHITE, mapping=dict(scale=[scale, scale], offset=offset.tolist())
        )
    # 将子架原点放到小窗中心，只比较它相对父架的朝向，不再画世界平移。
    inset_origin = np.array([3.25, 0.25])
    local_view = lambda points: np.asarray(points) * 0.72 + inset_origin
    with d.panel("parent-relative", (1.5, 5.0, -2.65, 3.0)):
        d.line([[1.65, -2.5], [1.65, 2.55]], MUTED, 0.9, 0.45)
        d.text([1.85, 2.58], "子架相对父架", WHITE, 13)
        d.text([1.85, 2.27], "只由 θ₂ 决定朝向", MUTED, 11)
        d.line(local_view([[-1.8, 0], [1.8, 0]]), BLUE, 0.9, 0.45, True)
        d.line(local_view([[0, -1.8], [0, 1.8]]), BLUE, 0.9, 0.45, True)
        d.text(local_view([1.8, 0]) + [0.04, -0.14], "x₁", BLUE, 11)
        d.text(local_view([0, 1.8]) + [0.06, 0.03], "y₁", BLUE, 11)
        local_child = core.rigid2(b)
        local_tip = core.apply2(local_child, [length2, 0])
        d.line(local_view([[0, 0], local_tip]), GREEN, 4, 0.75)
        _frame(d, local_child, local_view, core, GREEN, "₂", length=0.65)
        _angle_arc(d, np.zeros(2), 0, b, 0.5, local_view, GREEN)
        d.dot(local_view([0, 0]), GREEN, 0.06)
        d.dot(local_view(local_tip), YELLOW, 0.06)
        d.text([1.95, -1.8], f"θ₂ = {p['child_angle']:.0f}°", GREEN, 12)
        d.text(
            [1.95, -2.1],
            f"世界朝向 = {p['parent_angle'] + p['child_angle']:.0f}°",
            YELLOW,
            12,
        )
    d.formula = (
        r"\begin{aligned}"
        r"M_{w\leftarrow1}&=T(\mathbf b)R(\theta_1)\\"
        r"M_{w\leftarrow2}&=M_{w\leftarrow1}T(L_1,0)R(\theta_2)\\"
        r"\widetilde{\mathbf p}_{tip}&=M_{w\leftarrow2}(L_2,0,1)^T"
        r"\end{aligned}"
    )
    d.values = {
        "操作": "拖动基座平移整条链；角度确定末端（FK）",
        "父架 → 世界 M₁": parent.round(4).tolist(),
        "子架 → 父架": core.rigid2(b, [length1, 0]).round(4).tolist(),
        "子架 → 世界 M₂": child.round(4).tolist(),
        "基座 / 世界": joints[0].round(4).tolist(),
        "肘 / 世界": joints[1].round(4).tolist(),
        "末端 / 世界": joints[2].round(4).tolist(),
        "实际杆长（应等于 L₁、L₂）": np.linalg.norm(np.diff(joints, axis=0), axis=1)
        .round(5)
        .tolist(),
        "父角 θ₁ / 子角 θ₂": [p["parent_angle"], p["child_angle"]],
        "第二杆世界角 θ₁+θ₂": p["parent_angle"] + p["child_angle"],
    }
    return d
