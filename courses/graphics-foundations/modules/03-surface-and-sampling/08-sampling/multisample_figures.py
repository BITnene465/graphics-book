"""把同一组 Python 样本放在整幅图与单像素两种尺度观察。"""

from functools import lru_cache
import numpy as np


WHITE, MUTED, BLUE, GREEN, YELLOW = (
    "#e8edf6",
    "#687c96",
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
)
OWNER_COLORS = ("#101722", "#71b7ff", "#76dfb1", "#f6b265")


@lru_cache(maxsize=2)
def _frame(core, encode, offset, frequency, grid):
    frame = core.demo_scene(offset, frequency, grid, resolution=48)
    urls = {
        method: encode(frame[method]["image"]) for method in ("center", "ssaa", "msaa")
    }
    return frame, urls


def _data(p, progress, core, encode):
    # 播放一轮平移一像素；进度 1 恢复参数本身，不把动画当成时间抗锯齿。
    offset = float(p["offset"]) + progress - 1
    return _frame(core, encode, offset, float(p["frequency"]), int(p["grid"])), offset


def compare(p, progress, Drawing, core, encode):
    d = Drawing((-5.8, 5.8, -2.7, 2.7))
    (frame, urls), offset = _data(p, progress, core, encode)
    side = 3.45
    labels = (
        ("center", "单样本", BLUE),
        ("ssaa", f"SSAA · {p['grid']**2} 样本", GREEN),
        ("msaa", f"MSAA · {p['grid']**2} 样本", YELLOW),
    )
    for index, (method, title, accent) in enumerate(labels):
        x, y = -5.5 + 3.8 * index, -1.55
        d.image([x, y], [side, side], urls[method], pixelated=True)
        d.text([x, 2.20], title, accent, 17)
        evaluations = frame[method]["shading_count"]
        d.text([x, -1.91], f"着色求值  {evaluations:,}", WHITE, 13)
        if method != "center":
            d.text([x, -2.27], "共享同一份覆盖与深度样本", MUTED, 11)
        else:
            d.text([x, -2.27], "每像素一个覆盖、深度与着色样本", MUTED, 11)
        # 每幅图都能直接横向拖动几何；所见位移与参数以像素为单位对应。
        origin = np.array([x + side * 0.48, y + side * 0.90])
        at = origin + [side * offset / 48, 0]
        d.handle(at, "offset", "平移", axes=[0], limits=[-8, 8, 0, 0])
        d.handles[-1]["id"] = method
        d.handles[-1]["mapping"] = dict(
            scale=[side / 48, 1], offset=[origin[0] + side * (progress - 1) / 48, 0]
        )
    d.formula = r"C_P^{\mathrm{SSAA}}=\frac1N\sum_{s=1}^N C_{i_s}(x_s),\qquad C_P^{\mathrm{MSAA}}=\frac1N\sum_{s=1}^N C_{i_s}(x_P)"
    d.values = {
        "输出像素": "48 × 48（三图相同）",
        "SSAA / MSAA 每像素覆盖样本": int(p["grid"]) ** 2,
        "实际平移（像素）": round(offset, 4),
        "着色频率（cycles/pixel）": p["frequency"],
        "覆盖 / 深度一致": bool(
            np.array_equal(frame["ssaa"]["owner"], frame["msaa"]["owner"])
        ),
        "计数口径": "最终可见贡献的 shader 求值；不含背景",
    }
    return d


def pixel(p, progress, Drawing, core, encode):
    d = Drawing((-6, 6, -3.15, 3.05))
    (frame, urls), offset = _data(p, progress, core, encode)
    point = np.clip(p["point"], 0, 1)
    col = int(np.clip(np.floor(point[0] * 48), 0, 47))
    row = int(np.clip(np.floor((1 - point[1]) * 48), 0, 47))
    origin, side = np.array([-5.70, -0.65]), 2.60
    d.image(origin, [side, side], urls["ssaa"], pixelated=True)
    d.text([-5.7, 2.35], "取一个真实输出像素", WHITE, 15)
    low = origin + side / 48 * np.array([col, 47 - row])
    high = low + side / 48
    d.line([low, [high[0], low[1]], high, [low[0], high[1]], low], YELLOW, 2.0)
    at = origin + side * point
    d.handle(at, "point", "像素", limits=[0, 1, 0, 1])
    d.handles[-1]["mapping"] = dict(scale=[side, side], offset=origin.tolist())
    d.text([-5.7, -1.02], f"像素列 {col} · 数组行 {row}", YELLOW, 12)
    d.text([-5.7, -1.43], "拖动黄点，放大同一组样本", MUTED, 11)
    d.text(
        [-5.7, -1.85],
        f"单样本着色：{frame['center']['shading_per_pixel'][row,col]} 次",
        BLUE,
        12,
    )
    d.text(
        [-5.7, -2.22],
        f"SSAA 着色：{frame['ssaa']['shading_per_pixel'][row,col]} 次",
        GREEN,
        12,
    )
    d.text(
        [-5.7, -2.59],
        f"MSAA 着色：{frame['msaa']['shading_per_pixel'][row,col]} 次",
        YELLOW,
        12,
    )

    grid, size, y = int(p["grid"]), 2.34, -0.55
    owner = frame["ssaa"]["owner"][row, col]
    local = frame["positions"][row, col] - [col, 47 - row]
    depth = frame["ssaa"]["depth"][row, col]
    positions = (-2.67, 0.12, 2.91)
    for index, (title, x) in enumerate(
        zip(("归属与深度", "SSAA 样本颜色", "MSAA 样本颜色"), positions)
    ):
        d.text([x, 2.35], title, WHITE, 14)
        for s, (u, v) in enumerate(local):
            # 方块仅展示该样本存储的颜色，不表示三角形覆盖这一整块区域。
            lower = np.array([x, y]) + size * np.array([u - 0.5 / grid, v - 0.5 / grid])
            upper = lower + size / grid
            if index == 0:
                d.polygon(
                    [lower, [upper[0], lower[1]], upper, [lower[0], upper[1]]],
                    OWNER_COLORS[owner[s] + 1],
                    0.26,
                )
            else:
                method = "ssaa" if index == 1 else "msaa"
                if s == 0:
                    # 样本 y 向上，图像行向下；最近邻显示保持每个存储槽常色。
                    colors = frame[method]["sample_colors"][row, col].reshape(
                        grid, grid, 3
                    )[::-1]
                    d.image([x, y], [size, size], encode(colors), pixelated=True)
            at = np.array([x, y]) + size * np.array([u, v])
            d.dot(at, WHITE if index else OWNER_COLORS[owner[s] + 1], 0.026)
            if index == 0:
                label = "背景" if owner[s] < 0 else f"T{owner[s]} · {depth[s]:.2f}"
                if grid == 4 and owner[s] >= 0:
                    d.text(at + [-0.10, -0.12], f"T{owner[s]}", WHITE, 9)
                    d.text(at + [-0.17, -0.28], f"{depth[s]:.2f}", MUTED, 9)
                else:
                    d.text(
                        at + [-0.21, -0.19],
                        label,
                        WHITE if owner[s] >= 0 else MUTED,
                        10 if grid == 2 else 9,
                    )
        for step in range(grid + 1):
            q = size * step / grid
            d.line([[x + q, y], [x + q, y + size]], MUTED, 0.7)
            d.line([[x, y + q], [x + size, y + q]], MUTED, 0.7)
        if index:
            method = "ssaa" if index == 1 else "msaa"
            d.text([x, -1.0], "resolve 后的像素", MUTED, 11)
            resolved = frame[method]["image"][row, col]
            d.image([x, -1.93], [0.65, 0.65], encode(resolved.reshape(1, 1, 3)), pixelated=True)
            d.text([x + 0.83, -1.50], "线性 RGB", MUTED, 10)
            d.text(
                [x + 0.83, -1.84], " / ".join(f"{v:.3f}" for v in resolved), WHITE, 10
            )
        else:
            d.text([x, -1.0], "样本点决定归属；z 越小越近", MUTED, 11)
            d.text([x, -1.48], "方块表示样本存储槽", MUTED, 11)
            d.text([x, -1.85], "不表示真实几何覆盖面积", MUTED, 11)
    coverage = frame["ssaa"]["coverage"][:, row, col].sum(axis=-1)
    visible = [int((owner == index).sum()) for index in range(3)]
    d.text(
        [-2.67, -2.56],
        "MSAA 对每个可见图元共享像素中心颜色；它仍保留逐样本深度。",
        YELLOW,
        12,
    )
    d.formula = r"i_s=\mathop{\mathrm{arg\,min}}_{i:\,x_s\in T_i}z_i(x_s),\qquad C_P=\frac1N\sum_s C_s"
    d.values = {
        "像素（列，数组行）": [col, row],
        "T0 / T1 / T2 覆盖样本": coverage.tolist(),
        "T0 / T1 / T2 最终可见样本": visible,
        "背景样本": int((owner < 0).sum()),
        "实际平移（像素）": round(offset, 4),
        "MSAA 求值位置": [col + 0.5, 47 - row + 0.5],
    }
    return d
