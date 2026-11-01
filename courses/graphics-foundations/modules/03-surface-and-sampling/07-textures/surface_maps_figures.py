"""高度、法线数据与正式成像共用 surface_maps.py；浏览器只摆放图元。"""

from functools import lru_cache

import numpy as np

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


def _srgb_to_linear(values):
    values = np.asarray(values, float)
    return np.where(
        values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4
    )


def height_normal(p, progress, Drawing, core, encode):
    """UV 探针 → 两条高度截线及法线数据；错误 sRGB 分支只用于反例。"""
    amplitude, frequency = p["amplitude"], p["frequency"]
    point = np.clip(p["point"], 0, 1)
    sample = core.surface_sample(point, amplitude, frequency)
    u, v = np.meshgrid((np.arange(96) + 0.5) / 96, 1 - (np.arange(96) + 0.5) / 96)
    mapped = core.surface_sample(np.stack([u, v], axis=-1), amplitude, frequency)
    h = mapped["height"]
    gray = np.broadcast_to((0.5 + h / 1.2)[..., None], h.shape + (3,))
    d = Drawing((-0.3, 11.6, -0.9, 6.3))
    with d.panel("height-uv", (-0.25, 3.5, 1.95, 6.3)):
        d.text([0, 5.97], "高度纹理 · UV", WHITE, 14)
        d.image([0, 2.55], [3, 3], encode(_srgb_to_linear(gray)))
        d.handle(np.array([0, 2.55]) + point * 3, "point", "UV", limits=[0, 1, 0, 1])
        d.handles[-1]["mapping"] = dict(scale=[3, 3], offset=[0, 2.55])
        d.text([0, 2.17], f"h = {sample['height']:+.3f}", MUTED, 12)
    encoded = sample["encoded"]
    with d.panel("normal-data", (-0.25, 3.5, -0.3, 1.95)):
        d.text([0, 1.72], "法线贴图数据 RGB", BLUE, 12)
        d.image([0, -0.05], [1.55, 1.55], encode(_srgb_to_linear(mapped["encoded"])))
        d.text([1.72, 1.15], f"R {encoded[0]:.3f}", WHITE, 12)
        d.text([1.72, 0.75], f"G {encoded[1]:.3f}", WHITE, 12)
        d.text([1.72, 0.35], f"B {encoded[2]:.3f}", WHITE, 12)

    # 两条截线的水平单位是模型长度，竖直单位也是模型长度，斜率因此有物理意义。
    for axis, x0, label, color in (
        (0, 4.0, "u 截线 · v 固定", BLUE),
        (1, 8.0, "v 截线 · u 固定", GREEN),
    ):
        y0, plot_scale = 3.7, 1.2
        coordinate = np.linspace(0, 1, 160)
        uv = np.tile(point, (len(coordinate), 1))
        uv[:, axis] = coordinate
        height = core.height_field(uv, amplitude, frequency)[0]
        length = core.LENGTHS[axis]
        xy = np.column_stack(
            [x0 + coordinate * length * plot_scale, y0 + height * plot_scale]
        )
        at = np.array(
            [x0 + point[axis] * length * plot_scale, y0 + sample["height"] * plot_scale]
        )
        slope = sample["du" if axis == 0 else "dv"] / length
        tangent = np.array([1.0, slope])
        tangent /= np.linalg.norm(tangent)
        with d.panel(f"height-section-{axis}", (x0 - 0.6, x0 + 3.5, 1.95, 5.5)):
            d.line([[x0, y0], [x0 + length * plot_scale, y0]], MUTED, 0.8)
            d.line(xy, color, 2.2)
            d.line([at - tangent * 0.5, at + tangent * 0.5], YELLOW, 2)
            d.dot(at, YELLOW, 0.065)
            d.text([x0, y0 + 1.35], label, color, 12)
            d.text(
                [x0, y0 - 1.45],
                f"∂h/∂{'x' if axis == 0 else 'y'} = {slope:+.3f}",
                WHITE,
                12,
            )
    wrong = p.get("normal_read", "data") == "srgb_wrong"
    decoded = core.decode_normal(_srgb_to_linear(encoded) if wrong else encoded)
    angle = np.rad2deg(np.arccos(np.clip(np.dot(decoded, sample["normal"]), -1, 1)))
    # 用固定投影呈现单位向量，数值列仍给出完整三维方向。
    origin = np.array([9.4, 0.13])
    project = np.array([[0.65, -0.55, 0], [0.12, 0.25, 0.8]])
    with d.panel("normal-direction", (7.8, 11.5, -0.9, 1.95)):
        for axis, label in zip(np.eye(3), ("T", "B", "N")):
            d.arrow(origin, origin + project @ axis, MUTED, label)
        d.arrow(origin, origin + project @ decoded, YELLOW)
        d.text([8, 1.7], "误当 sRGB" if wrong else "数据直接解码", YELLOW, 13)
        d.text([8, 1.3], f"方向偏差 {angle:.2f}°", MUTED, 12)
    decode_formula = (
        r"\mathbf c'&=\operatorname{sRGBDecode}(\mathbf c)\\"
        r"\widehat{\mathbf n}_t&=\operatorname{normalize}(2\mathbf c'-1)"
        if wrong
        else r"\widehat{\mathbf n}_t&=\operatorname{normalize}(2\mathbf c-1)"
    )
    d.formula = (
        r"\begin{aligned}"
        r"\mathbf n_t&=\operatorname{normalize}(-h_u/L_u,-h_v/L_v,1)\\"
        r"\mathbf c&=(\mathbf n_t+1)/2\\" + decode_formula + r"\end{aligned}"
    )
    d.values = {
        "UV": np.round(point, 4).tolist(),
        "高度 h": round(float(sample["height"]), 6),
        "高度灰度范围": [-0.6, 0.6],
        "UV 偏导 [h_u,h_v]": np.round([sample["du"], sample["dv"]], 6).tolist(),
        "模型长度偏导 [h_x,h_y]": np.round(
            np.array([sample["du"], sample["dv"]]) / core.LENGTHS, 6
        ).tolist(),
        "编码 RGB（数据）": np.round(encoded, 6).tolist(),
        "解析单位法线": np.round(sample["normal"], 6).tolist(),
        "本次解码方向": np.round(decoded, 6).tolist(),
        "解码偏差 / °": round(float(angle), 6),
    }
    return d


@lru_cache(maxsize=1)
def _base_frame(core, amplitude, frequency, divisions):
    return core.render_surface_maps(
        size=192, amplitude=amplitude, frequency=frequency, divisions=divisions
    )


def bump_displacement(p, progress, Drawing, core, encode):
    """三张图来自真正的 Python 光栅结果；光源在统一世界 XY 平面拖动。"""
    light_xy = np.clip(p["light_xy"], -6, 6)
    base = _base_frame(core, p["amplitude"], p["frequency"], int(p["divisions"]))
    frame = core.relight_surface_maps(base, [*light_xy, 5])
    d = Drawing((-0.3, 12.0, -0.45, 6.55))
    for i, (name, title, subtitle) in enumerate(
        (
            ("flat", "原平面", "几何平面 · 恒定法线"),
            ("bump", "Bump", "几何平面 · 高度法线"),
            ("displacement", "Displacement", "位移网格 · 高度法线"),
        )
    ):
        x = i * 4.0
        with d.panel(name, (x - 0.2, x + 3.85, 1.4, 6.5)):
            d.text(
                [x, 6.14], title, BLUE if i == 0 else GREEN if i == 1 else YELLOW, 15
            )
            d.image([x, 2.05], [3.6, 3.6], encode(frame["images"][name]))
            d.text([x, 1.7], subtitle, MUTED, 11)
    flat, bump, moved = [
        frame["frames"][name] for name in ("flat", "bump", "displacement")
    ]
    mask, moved_mask = flat["owner"] >= 0, moved["owner"] >= 0
    changed = int(np.count_nonzero(mask != moved_mask))
    # 小型光源控制区是统一的 XY 映射，不冒充渲染场景截图。
    center, scale = np.array([10.25, 0.75]), 0.15
    with d.panel("light-xy", (7.9, 11.8, -0.45, 1.95)):
        d.line([center + [-0.9, 0], center + [0.9, 0]], MUTED, 1)
        d.line([center + [0, -0.9], center + [0, 0.9]], MUTED, 1)
        d.dot(center, BLUE, 0.05)
        d.line([center, center + scale * light_xy], YELLOW, 1.8)
        d.handle(center + scale * light_xy, "light_xy", "光源", limits=[-6, 6, -6, 6])
        d.handles[-1]["mapping"] = dict(scale=[scale, scale], offset=center.tolist())
        d.text([8.1, 1.18], "光源 XY", WHITE, 12)
        d.text([8.1, 0.78], "z = 5", MUTED, 11)
    d.formula = (
        r"\begin{aligned}"
        r"\mathbf p_{bump}&=\mathbf p\\"
        r"\mathbf p_{disp}&=\mathbf p+h\mathbf N\\"
        r"\mathbf n_w&=\operatorname{normalize}(L^{-T}\mathbf n_t)"
        r"\end{aligned}"
    )
    d.values = {
        "幅值 / UV频率 / 分段": [p["amplitude"], p["frequency"], p["divisions"]],
        "光源世界坐标": [*np.round(light_xy, 4), 5],
        "平面 / 位移覆盖像素": [int(mask.sum()), int(moved_mask.sum())],
        "覆盖集合不同的像素": changed,
        "位移网格顶点 / 三角形": [len(moved["vertices"]), len(moved["faces"])],
        "平面 / Bump 相同深度": bool(np.array_equal(flat["depth"], bump["depth"])),
        "平面 / 位移裁剪后三角形": [
            flat["clipped_triangles"],
            moved["clipped_triangles"],
        ],
        "几何精度": "连续高度的顶点采样；着色法线在像素UV处解析计算",
    }
    return d
