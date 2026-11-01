"""可拖动的 mip 层级图；每个方格均来自本章 Python 生成的线性 RGB 数组。

Drawing 只描述 SVG 图元，core 执行真正的下采样与查询。二者显式传入，
没有界面依赖或隐藏的 GPU 采样器。16² 小纹理让读者看清每个实际纹素。
"""

import numpy as np
from functools import lru_cache

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


def mipmap(p, progress, Drawing, core, display_color):
    d = Drawing((-0.35, 9.3, -2.9, 2.65))
    levels = core.build_mipmaps(core.checker_texture(16, int(p["frequency"])))
    uv = np.clip(p["point"], 0, 1)
    lod = float(p["lod"])
    low, high = int(np.floor(lod)), min(int(np.floor(lod)) + 1, len(levels) - 1)
    fraction = lod - low
    a = core.sample_texture(levels[low], uv)
    b = core.sample_texture(levels[high], uv)
    mixed = core.sample_trilinear(levels, uv, lod)
    size, gap, bottom = 1.5, 1.9, 0.45

    for level, texture in enumerate(levels):
        left = level * gap
        h, w = texture.shape[:2]
        opacity = 1 if level <= progress * (len(levels) - 1) else 0.12
        accent = BLUE if level == low else GREEN if level == high else MUTED
        at = [left + size * uv[0], bottom + size * uv[1]]
        with d.panel(
            f"mip-level-{level}",
            (left - 0.2, left + 1.75, 0.2, 2.6),
            columns=1 if level == 0 else 2,
        ):
            for row in range(h):
                for col in range(w):
                    x, y = left + col / w * size, bottom + (h - 1 - row) / h * size
                    d.polygon(
                        [
                            [x, y],
                            [x + size / w, y],
                            [x + size / w, y + size / h],
                            [x, y + size / h],
                        ],
                        display_color(texture[row, col]),
                        opacity,
                    )
            d.line(
                [
                    [left, bottom],
                    [left + size, bottom],
                    [left + size, bottom + size],
                    [left, bottom + size],
                    [left, bottom],
                ],
                accent,
                2 if level in (low, high) else 0.8,
            )
            d.text([left, 2.26], f"L{level} · {w} × {h}", accent, 13)
            d.dot(at, YELLOW, 0.035)
            if level == 0:
                # UV 把数学 [0,1]² 映到 L0 方格；limits 始终使用参数坐标。
                d.handle(at, "point", "UV", limits=[0, 1, 0, 1])
                d.handles[-1]["mapping"] = dict(scale=[size, size], offset=[0, bottom])

    with d.panel("lod-control", (0.4, 8.8, -0.7, 0.25)):
        d.line([[size / 2, -0.12], [4 * gap + size / 2, -0.12]], MUTED, 1.5)
        for level in range(len(levels)):
            x = level * gap + size / 2
            d.line([[x, -0.18], [x, -0.06]], WHITE)
            d.text([x - 0.1, -0.42], str(level), MUTED, 12)
        d.handle(
            [gap * lod + size / 2, -0.12],
            "lod",
            "λ",
            axes=(0,),
            limits=[0, 4, -0.12, -0.12],
        )
        d.handles[-1]["mapping"] = dict(scale=[gap, 1], offset=[size / 2, 0])

    # 下方三色均来自实际采样；编码到 sRGB 只用于显示。
    for key, x, value, label, accent, weight in (
        ("low-color", 0.7, a, "C₀", BLUE, 1 - fraction),
        ("high-color", 3.55, b, "C₁", GREEN, fraction),
        ("mixed-color", 6.65, mixed, "C", YELLOW, None),
    ):
        with d.panel(key, (x - 0.2, x + 1.1, -2.75, -0.65), columns=3):
            d.polygon(
                [[x, -2.1], [x + 0.85, -2.1], [x + 0.85, -1.25], [x, -1.25]],
                display_color(value),
                1,
            )
            d.text([x, -0.94], label, accent, 12)
            if weight is not None:
                d.text([x, -2.48], f"×{weight:.2f}", accent, 12)
    d.formula = (
        r"\begin{aligned}"
        r"\ell&=\lfloor\lambda\rfloor,\quad t=\lambda-\ell\\"
        r"C_0&=B(M_\ell,\mathbf{uv})\\"
        r"C_1&=B(M_{\min(\ell+1,4)},\mathbf{uv})\\"
        r"C&=(1-t)C_0+tC_1"
        r"\end{aligned}"
    )
    d.values = {
        "纹素数（全链 / 原图）": f"{sum(m.shape[0]*m.shape[1] for m in levels)} / 256",
        "查询 UV": np.round(uv, 4).tolist(),
        "两层": [low, high],
        "上层混合权重": round(fraction, 4),
        "C₀ 线性 RGB": np.round(a, 5).tolist(),
        "C₁ 线性 RGB": np.round(b, 5).tolist(),
        "线性 RGB": np.round(mixed, 5).tolist(),
    }
    return d


@lru_cache(maxsize=1)
def _minification_frame(core, tilt, frequency, anisotropy, encode):
    frame = core.render(
        tilt=tilt,
        frequency=frequency,
        filtering="anisotropic",
        resolution=192,
        texture_size=512,
        max_anisotropy=anisotropy,
        compare_filters=True,
    )
    urls = {
        method: encode(pixels) for method, pixels in frame["filtering_images"].items()
    }
    return frame, urls


def minification(p, progress, Drawing, core, encode):
    d = Drawing((-0.25, 11.5, -0.45, 8.5))
    frame, urls = _minification_frame(
        core, float(p["tilt"]), int(p["frequency"]), int(p["max_anisotropy"]), encode
    )
    uv = np.clip(p["point"], 0, 1)
    size = 3.5
    for method, label, x, y in (
        ("nearest", "最近邻", 0, 4.2),
        ("bilinear", "双线性", 4.2, 4.2),
        ("trilinear", "三线性", 0, 0),
        ("anisotropic", "各向异性", 4.2, 0),
    ):
        at = [x + size * uv[0], y + size * uv[1]]
        with d.panel(method, (x - 0.2, x + 3.75, y - 0.2, y + 4.1)):
            d.image([x, y], [size, size], urls[method])
            d.text(
                [x, y + 3.73], label, GREEN if method == "anisotropic" else WHITE, 13
            )
            d.line([[at[0] - 0.11, at[1]], [at[0] + 0.11, at[1]]], YELLOW, 1.8)
            d.line([[at[0], at[1] - 0.11], [at[0], at[1] + 0.11]], YELLOW, 1.8)
            d.handle(at, "point", limits=[0, 1, 0, 1])
            d.handles[-1]["id"] = method
            d.handles[-1]["mapping"] = dict(scale=[size, size], offset=[x, y])
    row = int(np.clip(np.floor((1 - uv[1]) * 192), 0, 191))
    col = int(np.clip(np.floor(uv[0] * 192), 0, 191))
    valid = frame["owner"][row, col] >= 0
    values = {"图像像素（列，行）": [col, row], "命中纹理平面": bool(valid)}
    with d.panel("pixel-footprint", (7.7, 11.5, 3.5, 7.95)):
        d.text([8.15, 7.52], "局部线性足迹", YELLOW, 13)
        if valid:
            major = float(frame["footprint_major"][row, col])
            minor = float(frame["footprint_minor"][row, col])
            jacobian = frame["jacobian"][row, col]
            # J 把一像素方形映到源纹素坐标；用同一比例显示，保留各向异性形状。
            texel_j = jacobian * 512
            corners = (
                np.array([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
                @ texel_j.T
            )
            scale = 1.1 / max(np.max(np.abs(corners)), 1)
            origin = np.array([9.5, 5.4])
            d.polygon(corners * scale + origin, BLUE, 0.22)
            d.line(np.vstack([corners, corners[:1]]) * scale + origin, BLUE, 2)
            radius = major * 0.5 * scale
            angles = np.linspace(0, 2 * np.pi, 80)
            d.line(
                origin + radius * np.column_stack([np.cos(angles), np.sin(angles)]),
                MUTED,
                1,
                0.6,
                True,
            )
            iso = float(np.clip(frame["lod_isotropic"][row, col], 0, 9))
            aniso = float(frame["lod"][row, col])
            taps = int(frame["tap_count"][row, col])
            values.update(
                {
                    "长轴 / 短轴 / texel": [round(major, 3), round(minor, 3)],
                    "长短轴比": round(major / max(minor, 1e-12), 3),
                    "各向异性查询次数": taps,
                    "三线性 LOD": round(iso, 3),
                    "各向异性 LOD": round(aniso, 3),
                }
            )
        else:
            d.text([8.15, 5.9], "背景：没有纹理查询", MUTED, 12)
    d.formula = (
        r"\begin{aligned}"
        r"J_t&=\mathrm{diag}(W_t,H_t)\frac{\partial(u,v)}{\partial(x,y)}\\"
        r"\lambda_{\rm iso}&=\log_2\max(1,\sigma_{\max})\\"
        r"\rho_{\rm aniso}&=\max(\sigma_{\min},\sigma_{\max}/A)\\"
        r"\lambda_{\rm aniso}&=\log_2\max(1,\rho_{\rm aniso})"
        r"\end{aligned}"
    )
    d.values = values
    return d
