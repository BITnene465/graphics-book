"""方向、尺度、原纹素权重与颜色联动；图中的色块均来自 Python 数组。"""

from functools import lru_cache

import numpy as np

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


@lru_cache(maxsize=2)
def _textures(core, pattern, encode):
    texture = core.demo_texture(32, pattern)
    grid = core.build_ripmap(texture)
    urls = [[encode(image) for image in row] for row in grid]
    return texture, grid, urls, core.texture_core.build_mipmaps(texture)


def _scene(p, core, encode):
    texture, grid, urls, mip = _textures(core, p["pattern"], encode)
    point = np.clip(p["point"], 0, 1)
    axis = np.clip(p["axis"], -24, 24)
    a, b = float(np.linalg.norm(axis)), float(p["width"])
    angle = float(np.rad2deg(np.arctan2(axis[1], axis[0])))
    ellipse = core.ellipse_filter(texture, point, a, b, angle)
    rip = core.ripmap_probe(grid, point, ellipse["lod_xy"])
    rip_weights = core.ripmap_weights(texture.shape, point, rip["lod"])
    isotropic = core.texture_core.sample_trilinear(mip, point, np.log2(max(a, b, 1)))
    return dict(
        texture=texture,
        grid=grid,
        urls=urls,
        point=point,
        axis=axis,
        a=a,
        b=b,
        angle=angle,
        ellipse=ellipse,
        rip=rip,
        rip_weights=rip_weights,
        isotropic=isotropic,
    )


def _outline(d, scene, origin, size, *, handles=False):
    """完整轴向量的半长是图上半轴；参数与画面转换只放在此处。"""
    point, ellipse = scene["point"], scene["ellipse"]
    scale = size / 32
    center = np.asarray(origin) + size * point
    angles = np.linspace(0, 2 * np.pi, 96)
    local = np.column_stack(
        [np.cos(angles) * scene["a"] / 2, np.sin(angles) * scene["b"] / 2]
    )
    curve = center + scale * (local @ ellipse["rotation"].T)
    d.line(curve, YELLOW, 1.8)
    half = scale * ellipse["spans"] / 2
    box = center + np.array([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) * half
    d.line(box, BLUE, 1.2, 0.75, True)
    tip = center + scale * scene["axis"] / 2
    d.line([center, tip], GREEN, 2)
    if handles:
        d.handle(center, "point", "UV", limits=[0, 1, 0, 1])
        d.handles[-1]["mapping"] = dict(scale=[size, size], offset=list(origin))
        d.handle(tip, "axis", "轴1", limits=[-24, 24, -24, 24])
        d.handles[-1]["mapping"] = dict(
            scale=[scale / 2, scale / 2], offset=center.tolist()
        )
        # 接近纹理边界时保留真实足迹；panel 使用固定边界，拖动不触发自动 fit。


def _swatch(d, x, y, value, label, encode):
    d.image([x, y], [0.45, 0.45], encode(np.asarray(value).reshape(1, 1, 3)))
    d.text([x + 0.6, y + 0.31], label, WHITE, 12)
    d.text(
        [x + 0.6, y + 0.01],
        "[" + ",".join(f"{n:.2f}".removeprefix("0") for n in value) + "]",
        MUTED,
        10,
    )


def _values(scene):
    return {
        "查询 UV（未随方向改变）": np.round(scene["point"], 4).tolist(),
        "轴1 / 轴2完整跨度": np.round([scene["a"], scene["b"]], 3).tolist(),
        "轴1朝向 / °": round(scene["angle"], 2),
        "包围矩形宽 / 高": np.round(scene["ellipse"]["spans"], 3).tolist(),
    }


def ripmap_axis(p, progress, Drawing, core, encode):
    scene = _scene(p, core, encode)
    d = Drawing((-0.3, 11.9, -0.6, 6.6))
    # 轴分量限于 ±24、第二轴跨度至多 16，边缘 UV 的完整足迹也在固定范围内。
    with d.panel("source-footprint", (-2.05, 6.55, -0.7, 7.9)):
        d.image([0, 1.35], [4.5, 4.5], scene["urls"][0][0])
        _outline(d, scene, [0, 1.35], 4.5, handles=True)
    for i, query in enumerate(scene["rip"]["queries"]):
        lx, ly = query["level"]
        x, y = 5.25 + (i % 2) * 3.15, 3.8 - (i // 2) * 2.65
        h, w = query["shape"]
        uv = scene["point"]
        with d.panel(f"ripmap-level-{i}", (x - 0.2, x + 3.0, y - 0.45, y + 2.2)):
            d.image([x, y], [1.65, 1.65], scene["urls"][ly][lx])
            d.text([x, y + 1.84], f"Lx {lx} · Ly {ly}", BLUE if i < 2 else GREEN, 12)
            d.text([x + 1.8, y + 1.0], f"{query['weight']:.3f}", YELLOW, 15)
            d.text([x + 1.8, y + 0.65], "层间权重", MUTED, 10)
            d.text([x, y - 0.24], f"{w} × {h} 纹素", MUTED, 10)
            d.dot([x + 1.65 * uv[0], y + 1.65 * uv[1]], YELLOW, 0.035)
    with d.panel("mipmap-color", (-0.2, 3.6, -0.2, 0.85)):
        _swatch(d, 0, 0.08, scene["isotropic"], "Mipmap 结果", encode)
    with d.panel("ripmap-color", (5.05, 8.85, -0.2, 0.85)):
        _swatch(d, 5.25, 0.08, scene["rip"]["color"], "Ripmap 结果", encode)
    d.formula = (
        r"\begin{aligned}"
        r"L_x&=\log_2\max(1,\rho_x)\\"
        r"L_y&=\log_2\max(1,\rho_y)\\"
        r"C_{ij}&=B(R_{\ell_y+j,\ell_x+i},\mathbf{uv})\\"
        r"C&=\sum_{i,j\in\{0,1\}}w^x_iw^y_j C_{ij}"
        r"\end{aligned}"
    )
    d.values = {
        **_values(scene),
        "足迹图例": "黄色：椭圆支撑；蓝色：轴对齐选层矩形；绿色：轴1",
        "实际 LOD [x,y]": np.round(scene["rip"]["lod"], 4).tolist(),
        "四层权重": [round(q["weight"], 5) for q in scene["rip"]["queries"]],
        "四层权重总和": round(sum(q["weight"] for q in scene["rip"]["queries"]), 8),
        "全链纹素 / 原纹素": f"{sum(im.shape[0]*im.shape[1] for row in scene['grid'] for im in row)} / 1024",
        "Ripmap 线性 RGB": np.round(scene["rip"]["color"], 5).tolist(),
        "Mipmap 线性 RGB": np.round(scene["isotropic"], 5).tolist(),
    }
    return d


def elliptical_footprint(p, progress, Drawing, core, encode):
    scene = _scene(p, core, encode)
    d = Drawing((-0.3, 12.0, -0.75, 6.1))
    with d.panel("source-footprint", (-1.65, 5.15, -0.9, 6.7)):
        d.image([0, 1.55], [3.5, 3.5], scene["urls"][0][0])
        _outline(d, scene, [0, 1.55], 3.5, handles=True)
        _swatch(
            d,
            0,
            -0.5,
            core.texture_core.sample_texture(scene["texture"], scene["point"]),
            "中心双线性",
            encode,
        )
    rip_weights, ellipse_weights = scene["rip_weights"], scene["ellipse"]["weights"]
    maximum = max(float(rip_weights.max()), float(ellipse_weights.max()))
    for x, weights, label in (
        (4.05, rip_weights, "Ripmap 权重"),
        (8.10, ellipse_weights, "椭圆权重"),
    ):
        # 两张热图共用刻度，不分别放大各自的最大值。
        t = weights[..., None] / maximum
        heat = (1 - t) * np.array([0.015, 0.023, 0.04]) + t * np.array([1, 0.62, 0.10])
        row, col = np.unravel_index(np.argmax(weights), weights.shape)
        at = np.array([x, 1.55]) + 3.5 * np.array(
            [(col + 0.5) / 32, 1 - (row + 0.5) / 32]
        )
        kind = "ripmap" if x < 8 else "ellipse"
        with d.panel(f"{kind}-weights", (x - 0.2, x + 3.75, -0.2, 5.65)):
            d.image([x, 1.55], [3.5, 3.5], encode(heat))
            d.text([x, 5.23], label, BLUE if x < 8 else YELLOW, 12)
            d.line([at + [-0.06, 0], at + [0.06, 0]], WHITE, 1.6)
            d.line([at + [0, -0.06], at + [0, 0.06]], WHITE, 1.6)
            d.text([x, 1.1], f"{np.count_nonzero(weights)} 个源纹素", MUTED, 11)
            color = scene["rip" if kind == "ripmap" else "ellipse"]["color"]
            _swatch(d, x, 0.07, color, "Ripmap 结果" if x < 8 else "椭圆结果", encode)
    fallback = scene["ellipse"]["fallback"]
    d.formula = (
        r"C=B(M_0,\mathbf{uv})"
        if fallback
        else (
            r"\begin{aligned}"
            r"r_i^2&=\Delta\mathbf t_i^TQ^{-1}\Delta\mathbf t_i\\"
            r"\widetilde w_i&=\max(0,e^{-2r_i^2}-e^{-2})\\"
            r"C&=\frac{\sum_i\widetilde w_i C_i}{\sum_i\widetilde w_i}"
            r"\end{aligned}"
        )
    )
    d.values = {
        **_values(scene),
        "足迹图例": "黄色：椭圆支撑；蓝色：轴对齐选层矩形；绿色：轴1",
        "共同热图最大刻度": round(maximum, 7),
        "Ripmap / 椭圆权重和": [
            round(float(rip_weights.sum()), 10),
            round(float(ellipse_weights.sum()), 10),
        ],
        "椭圆支撑内中心 / clamp后原纹素": [
            scene["ellipse"]["sampled_centers"],
            scene["ellipse"]["unique_texels"],
        ],
        "椭圆计算方式": "双线性回退" if fallback else "第0层有限Gaussian离散求和",
        "最大项 [列,行,权重]": [
            [
                int(np.argmax(weights) % 32),
                int(np.argmax(weights) // 32),
                round(float(weights.max()), 7),
            ]
            for weights in (rip_weights, ellipse_weights)
        ],
        "Ripmap 线性 RGB": np.round(scene["rip"]["color"], 5).tolist(),
        "椭圆线性 RGB": np.round(scene["ellipse"]["color"], 5).tolist(),
    }
    return d
