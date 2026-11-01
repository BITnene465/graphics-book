"""程序纹理的所有像素与查询数值均由 procedural.py 实时计算。"""

import numpy as np

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)

DEFAULTS = {
    "value-noise-lattice": dict(point=[0.37, 0.42], seed=7),
    "fbm-coordinate-space": dict(
        point=[0.25, -0.35],
        scale=2.5,
        octaves=4,
        gain=0.5,
        lacunarity=2.0,
        slice=0.4,
        shift=[0.35, 0.0],
        seed=7,
    ),
}
CONTROLS = {
    "value-noise-lattice": [],
    "fbm-coordinate-space": [
        dict(
            key="octaves",
            label="层数",
            options=[dict(value=n, label=str(n)) for n in (1, 2, 3, 4)],
        ),
        dict(key="gain", label="幅度衰减", min=0, max=1, step=0.05),
        dict(key="slice", label="三维切片 z", min=-1, max=1, step=0.05),
    ],
}


def _gray(values):
    return np.repeat(np.asarray(values)[..., None], 3, axis=-1)


def _color(values):
    """固定线性 RGB 色带；色彩只显示标量，不参与噪声计算。"""
    values = np.asarray(values)[..., None]
    return (1 - values) * np.array([0.025, 0.10, 0.22]) + values * np.array(
        [0.92, 0.66, 0.19]
    )


def value_noise_lattice(p, t, Drawing, core, encode):
    point = np.clip(p["point"], -0.95, 1.95)
    sample = core.noise_probe(point, p["seed"])
    d = Drawing((-0.4, 8.0, -4.65, 3.75))
    axis = -1 + 3 * (np.arange(96) + 0.5) / 96
    x, y = np.meshgrid(axis, axis[::-1])
    pixels = core.value_noise(np.stack([x, y], axis=-1), p["seed"])
    with d.panel("lattice-query", (-0.35, 3.8, -0.3, 3.65)):
        d.image([0, 0], [3, 3], encode(_gray(pixels)))
        for line in range(4):
            d.line([[line, 0], [line, 3]], MUTED, 0.8, 0.7)
            d.line([[0, line], [3, line]], MUTED, 0.8, 0.7)
        for corner, value in zip(sample["corners"], sample["corner_values"]):
            at = corner + 1
            d.dot(at, YELLOW, 0.045)
            d.text(at + [0.08, 0.15], f"{value:.3f}", YELLOW, 11)
        d.handle(point + 1, "point", "q", limits=[-0.95, 1.95, -0.95, 1.95])
        d.handles[-1]["mapping"] = dict(scale=[1, 1], offset=[1, 1])

    s = np.linspace(0, 1, 100)
    origin, size = np.array([0, -4.25]), 3.0
    with d.panel("fade-curve", (-0.3, 3.5, -4.6, -0.5)):
        d.text([0, -0.82], "格内位置 → fade 权重", WHITE, 13)
        d.line([origin, origin + [size, 0], origin + [size, size]], MUTED, 1)
        d.line(origin + size * np.column_stack([s, core.fade(s)]), WHITE, 2)
        for i, color in enumerate((BLUE, GREEN)):
            at = origin + size * np.array([sample["fraction"][i], sample["eased"][i]])
            d.dot(at, color, 0.06)
        d.text(origin + [0.06, 0.18], "0", MUTED, 11)
        d.text(origin + [2.83, 0.18], "1", MUTED, 11)

    with d.panel("corner-weights", (4.05, 7.95, -1.5, 3.65)):
        d.text([4.25, 3.3], "四角权重", WHITE, 13)
        for index, weight in enumerate(sample["weights"]):
            y0 = 2.65 - index * 0.68
            label = "".join(
                str(int(n)) for n in sample["corners"][index] - sample["cell"]
            )
            d.text([4.25, y0 + 0.08], label, MUTED, 11)
            d.line([[4.85, y0], [6.75, y0]], MUTED, 6)
            d.line([[4.85, y0], [4.85 + 1.9 * weight, y0]], GREEN, 6)
            d.text([6.95, y0 + 0.08], f"{weight:.3f}", WHITE, 11)
        d.text([4.25, -0.25], f"Σw = {sample['weights'].sum():.3f}", GREEN, 12)
        d.image(
            [4.25, -1.25], [0.65, 0.65], encode(_gray(np.array([[sample["value"]]])))
        )
        d.text([5.15, -0.9], f"h(q) = {sample['value']:.4f}", YELLOW, 13)
    d.formula = (
        r"\begin{aligned}"
        r"f(s)&=6s^5-15s^4+10s^3\\"
        r"b_0(s)&=1-f(s),\quad b_1(s)=f(s)\\"
        r"w_{ij}&=b_i(s_x)b_j(s_y)\\"
        r"h(\mathbf q)&=\sum_{i,j\in\{0,1\}}w_{ij}a_{ij}"
        r"\end{aligned}"
    )
    d.values = {
        "固定 seed": p["seed"],
        "查询位置": np.round(point, 5).tolist(),
        "floor 格点": sample["cell"].tolist(),
        "格内位置 / fade": [
            sample["fraction"].round(5).tolist(),
            sample["eased"].round(5).tolist(),
        ],
        "四角 [位置,hash值,权重]": [
            [corner.tolist(), round(float(value), 6), round(float(weight), 6)]
            for corner, value, weight in zip(
                sample["corners"], sample["corner_values"], sample["weights"]
            )
        ],
        "权重和": round(float(sample["weights"].sum()), 12),
        "查询值": round(float(sample["value"]), 7),
        "连续性": "fade 的两端一阶、二阶导数均为零；跨格 C²，切向导数不必为零",
    }
    return d


def _sphere_images(p, core, options):
    """同一球体平移；固定屏幕坐标采样实际三维体纹理，无 UV 接缝。"""
    resolution = 192
    axis = 3.2 * ((np.arange(resolution) + 0.5) / resolution - 0.5)
    x, y = np.meshgrid(axis, axis[::-1])
    shift = np.clip(p["shift"], -0.65, 0.65)
    dx, dy = x - shift[0], y - shift[1]
    radius = 0.75
    mask = dx * dx + dy * dy <= radius**2
    z = np.sqrt(np.maximum(radius**2 - dx * dx - dy * dy, 0))
    local = np.stack([dx, dy, z], axis=-1)
    world = local + np.array([*shift, 0])
    light = np.array([-2.0, 3.0, 5.0])
    light /= np.linalg.norm(light)
    shade = 0.3 + 0.7 * np.maximum(local[mask] @ light / radius, 0)
    images = {}
    for name, coordinates in (("object", local), ("world", world)):
        query = (coordinates[mask] + [0, 0, p["slice"]]) * p["scale"]
        color = _color(core.fbm(query, **options)) * shade[:, None]
        image = np.broadcast_to([0.018, 0.025, 0.032], (*mask.shape, 3)).copy()
        image[mask] = color
        images[name] = image
    return images


def fbm_coordinate_space(p, t, Drawing, core, encode):
    point = np.clip(p["point"], -1, 1)
    scale = float(np.clip(p["scale"], 0.5, 8))
    p = {**p, "scale": scale}
    options = {key: p[key] for key in ("octaves", "gain", "lacunarity", "seed")}
    axis = 2 * (np.arange(96) + 0.5) / 96 - 1
    x, y = np.meshgrid(axis, axis[::-1])
    queries = np.stack([x, y, np.full_like(x, p["slice"])], axis=-1) * scale
    parts = core.fbm_parts(queries, **options)
    sample = core.fbm_parts(np.array([*point, p["slice"]]) * scale, **options)
    d = Drawing((-0.3, 11.35, -1.05, 7.5))
    for index, layer in enumerate(parts["layers"]):
        x0, y0, size = index * 2.65, 4.5, 2.2
        with d.panel(f"octave-{index}", (x0 - 0.2, x0 + 2.45, 4.0, 7.45), columns=2):
            d.text([x0, 7.13], f"第 {index} 层", WHITE, 13)
            d.image([x0, y0], [size, size], encode(_color(layer)))
            d.text(
                [x0, 4.2],
                f"f {parts['frequencies'][index]:g} · w {parts['weights'][index]:.3f}",
                MUTED,
                11,
            )
            at = np.array([x0, y0]) + (point + 1) * size / 2
            d.handle(at, "point", limits=[-1, 1, -1, 1])
            d.handles[-1]["id"] = f"octave-{index}"
            d.handles[-1]["mapping"] = dict(
                scale=[size / 2] * 2, offset=[x0 + size / 2, y0 + size / 2]
            )

    with d.panel("normalized-sum", (-0.2, 3.5, -1, 3.85)):
        d.text([0, 3.42], "归一化合成 · 三维切片", YELLOW, 13)
        d.image([0, 0], [3, 3], encode(_color(parts["value"])))
        d.handle((point + 1) * 1.5, "point", "q", limits=[-1, 1, -1, 1])
        d.handles[-1]["id"] = "sum-query"
        d.handles[-1]["mapping"] = dict(scale=[1.5, 1.5], offset=[1.5, 1.5])
        d.line([[0, -0.55], [3, -0.55]], MUTED, 1.5)
        scale_mapping = 3 / 7.5
        d.handle(
            [scale_mapping * (scale - 0.5), -0.55],
            "scale",
            "尺度",
            axes=(0,),
            limits=[0.5, 8, -0.55, -0.55],
        )
        d.handles[-1]["mapping"] = dict(
            scale=[scale_mapping, 1], offset=[-0.5 * scale_mapping, 0]
        )

    spheres = _sphere_images(p, core, options)
    for name, x0, label in (
        ("object", 3.9, "物体坐标 · 随物体移动"),
        ("world", 7.8, "世界坐标 · 穿过固定场"),
    ):
        with d.panel(f"{name}-coordinates", (x0 - 0.2, x0 + 3.4, -0.3, 3.85)):
            d.text([x0, 3.42], label, BLUE if name == "object" else GREEN, 12)
            d.image([x0, 0], [3, 3], encode(spheres[name]))
            if name == "object":
                shift = np.clip(p["shift"], -0.65, 0.65)
                mapping = 3 / 3.2
                d.handle(
                    np.array([x0 + 1.5, 1.5]) + shift * mapping,
                    "shift",
                    "平移",
                    limits=[-0.65, 0.65, -0.65, 0.65],
                )
                d.handles[-1]["mapping"] = dict(
                    scale=[mapping, mapping], offset=[x0 + 1.5, 1.5]
                )
    d.formula = (
        r"\begin{aligned}"
        r"a_k&=g^k,\quad f_k=\ell^k\\"
        r"F_N(\mathbf q)&=\frac{\sum_{k=0}^{N-1}a_k h(f_k\mathbf q)}{\sum_{k=0}^{N-1}a_k}\\"
        r"\mathbf p_o&=\mathbf p_w-\mathbf t\\"
        r"\mathbf q_o&=s(\mathbf p_o+\mathbf c)\\"
        r"\mathbf q_w&=s(\mathbf p_w+\mathbf c)\\"
        r"\mathbf c&=(0,0,z_0)"
        r"\end{aligned}"
    )
    d.values = {
        "固定 seed": p["seed"],
        "三维查询位置（尺度前）": [*point.round(5).tolist(), p["slice"]],
        "查询尺度": scale,
        "各层频率 / 幅度": [
            parts["frequencies"].tolist(),
            parts["amplitudes"].tolist(),
        ],
        "归一化权重": parts["weights"].round(6).tolist(),
        "所选点各层值": sample["layers"].round(6).tolist(),
        "所选点合成值": round(float(sample["value"]), 7),
        "物体世界平移": [*np.clip(p["shift"], -0.65, 0.65).round(5).tolist(), 0],
        "球面查询的共同 z 偏移": p["slice"],
        "显示边界": "96² 实时切片；192² 球面图。教学视图最多4层，核心支持8层；高频没有足迹过滤，可能混叠。",
    }
    return d
