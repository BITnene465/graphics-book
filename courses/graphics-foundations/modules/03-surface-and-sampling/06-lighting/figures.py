"""光照频率的小型书内对照：三个图像来自同一 Python 三角网格。"""

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
def _render(core, light, latitude, exponent, encode):
    frame = core.render_mesh(
        size=224,
        scale=(1.15, 1.05, 1),
        latitude=latitude,
        light=light,
        exponent=exponent,
        ks=0.9,
        power=65,
        ambient=0.04,
    )
    return frame, {method: encode(pixels) for method, pixels in frame["images"].items()}


def shading_frequency(p, progress, Drawing, core, encode):
    d = Drawing((-0.25, 10.8, -1.35, 4.7))
    light_xy = np.clip(p["light"], -5, 5)
    light = (*light_xy, float(p["light_z"]))
    frame, urls = _render(core, light, int(p["latitude"]), float(p["exponent"]), encode)
    for index, (method, label, accent) in enumerate(
        (
            ("flat", "Flat · 逐面", BLUE),
            ("gouraud", "Gouraud · 逐顶点", GREEN),
            ("phong", "Phong · 逐像素", YELLOW),
        )
    ):
        x = index * 3.6
        d.image([x, 0], [3.3, 3.3], urls[method])
        d.text([x, 3.57], label, accent, 15)
        d.text([x, -0.38], f"光照求值 {frame['evaluations'][method]:,} 次", MUTED, 12)
    # 可拖动的是光源的 XY 投影，与正交成像坐标相同，Z 由滑杆控制。
    # 不把投影点当作表面点；连线表明三图共享同一个光源。
    extent = frame["extent"]
    scale = 3.3 / (2 * extent)
    at = [7.2 + 1.65 + scale * light_xy[0], 1.65 + scale * light_xy[1]]
    d.line([[8.85, 1.65], at], YELLOW, 1.3, 0.7, True)
    d.handle(at, "light", "光源 XY", limits=[-5, 5, -5, 5])
    d.handles[-1]["mapping"] = dict(scale=[scale, scale], offset=[8.85, 1.65])
    # 拖远的光源仍需可见，扩展数学边界而非把参数偷偷夹回图片内。
    d.bounds = (
        min(-0.25, at[0] - 0.45),
        max(10.8, at[0] + 0.75),
        min(-1.35, at[1] - 0.5),
        max(4.7, at[1] + 0.5),
    )
    d.text([0, 4.26], "同一网格 · 同一覆盖与深度 · 同一 Blinn–Phong 模型", WHITE, 13)
    d.formula = r"\begin{aligned}C_G&=\sum_i\lambda_i S(\mathbf p_i,\mathbf n_i)\\ C_P&=S\!\left(\sum_i\lambda_i\mathbf p_i,\frac{\sum_i\lambda_i\mathbf n_i}{\|\sum_i\lambda_i\mathbf n_i\|}\right)\end{aligned}"
    d.values = {
        "相同三角形": len(frame["faces"]),
        "相同顶点": len(frame["vertices"]),
        "光源 XYZ": np.round(light, 3).tolist(),
        "高光指数": p["exponent"],
    }
    return d
