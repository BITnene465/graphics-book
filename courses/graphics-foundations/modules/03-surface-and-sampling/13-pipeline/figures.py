"""管线的可检查数值与透明混合；所有正式像素在 Python 中产生。"""

from functools import lru_cache
import numpy as np

BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


@lru_cache(maxsize=1)
def _frame(core, angle, wave, encode):
    frame = core.render_frame(
        size=192, divisions=6, rotation=(0, angle, 0), wave=wave, early_depth=False
    )
    return frame, encode(frame["image"])


def stages(p, t, Drawing, core, encode):
    d = Drawing((-0.2, 9.3, -0.7, 4.9))
    frame, url = _frame(core, p["angle"], p["wave"], encode)
    point = np.clip(p["point"], 0, 1)
    row = int(np.clip(np.floor((1 - point[1]) * 192), 0, 191))
    col = int(np.clip(np.floor(point[0] * 192), 0, 191))
    probe = core.inspect_pixel(frame, row, col)
    stats = frame["stats"]
    d.image([0, 0], [4, 4], url)
    d.text([0, 4.3], "最终图像 · 拖动像素追溯", WHITE, 14)
    d.text([4.65, 4.6], "全帧计数", MUTED, 11)
    d.handle(point * 4, "point", "像素", limits=[0, 1, 0, 1])
    d.handles[-1]["mapping"] = dict(scale=[4, 4], offset=[0, 0])
    stages = [
        ("输入顶点", stats["vertices"]),
        ("顶点程序 → clip", stats["vertices"]),
        ("裁剪后三角形", stats["clipped_triangles"]),
        ("覆盖/插值样本", stats["covered_samples"]),
        ("片元颜色求值", stats["shaded_samples"]),
        ("深度写入次数", stats["depth_writes"]),
        ("最终可见像素", stats["visible_pixels"]),
    ]
    current = min(int(t * len(stages)), len(stages) - 1)
    for i, (label, value) in enumerate(stages):
        y = 4.17 - i * 0.53
        accent = YELLOW if i == current else GREEN if i < current else MUTED
        d.dot([4.7, y + 0.03], accent, 0.055)
        if i < len(stages) - 1:
            d.line([[4.7, y - 0.05], [4.7, y - 0.43]], MUTED, 1)
        d.text([4.95, y], label, accent, 12)
        d.text([8.15, y], f"{value:,}", accent, 12)
    d.formula = r"\mathbf p_{clip}=PVM\begin{bmatrix}\mathbf p'_{model}\\1\end{bmatrix},\qquad a=\frac{\sum_i\lambda_i a_i/w_i}{\sum_i\lambda_i/w_i}"
    d.values = {
        "当前阶段": stages[current][0],
        "像素（列，行）": [col, row],
        "命中": probe["hit"],
    }
    if probe["hit"]:
        d.values.update(
            {
                "原三角形": probe["face"],
                "原顶点权重": np.round(probe["weights"], 4).tolist(),
                "插值 UV": np.round(probe["uv"], 4).tolist(),
                "候选深度": np.round(
                    [c["depth"] for c in probe["candidates"]], 5
                ).tolist(),
            }
        )
    return d


def alpha_layers(p, t, Drawing, core, encode):
    d = Drawing((-0.2, 8.8, -0.75, 4.8))
    alpha = p["alpha"]
    position = np.clip(p["position"], -1, 1)
    size = 160
    x, y = np.meshgrid(
        (np.arange(size) + 0.5) / size, (size - np.arange(size) - 0.5) / size
    )
    a = (np.abs(x - (0.42 + position[0] * 0.3)) < 0.29) & (
        np.abs(y - (0.5 + position[1] * 0.3)) < 0.3
    )
    b = (np.abs(x - 0.62) < 0.27) & (np.abs(y - 0.48) < 0.24)
    red = np.array([0.8, 0.15, 0.08])
    blue = np.array([0.06, 0.3, 0.75])
    background = np.array([0.025, 0.033, 0.045])
    samples = []
    for index, order in enumerate(((b, blue, a, red), (a, red, b, blue))):
        bottom, cb, top, ct = order
        image = np.full((size, size, 3), background)
        image[bottom] = core.source_over(cb, image[bottom], alpha)
        image[top] = core.source_over(ct, image[top], alpha)
        offset = index * 4.5
        d.image([offset, 0], [4, 4], encode(image))
        d.text([offset, 4.3], "红覆盖蓝" if index == 0 else "蓝覆盖红", WHITE, 14)
        d.handle(
            [offset + 4 * (0.42 + position[0] * 0.3), 4 * (0.5 + position[1] * 0.3)],
            "position",
            "移动红层",
            limits=[-1, 1, -1, 1],
        )
        d.handles[-1].update(
            id=f"layer-{index}",
            mapping=dict(scale=[1.2, 1.2], offset=[offset + 1.68, 2]),
        )
        samples.append(np.round(image[size // 2, size // 2], 4).tolist())
    d.formula = (
        r"\begin{aligned}"
        r"C_{out}&=\alpha_s C_s+(1-\alpha_s)C_{dst}\\"
        r"&\text{（不透明目标，线性 RGB）}"
        r"\end{aligned}"
    )
    d.values = {
        "每层 alpha": round(alpha, 3),
        "图像中心 · 红覆盖蓝": samples[0],
        "图像中心 · 蓝覆盖红": samples[1],
    }
    return d
