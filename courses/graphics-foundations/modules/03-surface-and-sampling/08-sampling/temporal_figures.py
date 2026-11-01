"""时间轴、真实轮面和解析快门参考。Python 求值，浏览器只显示与传回拖动。

两个演示使用画内时间探针，因此注册时设 animated=False；t 保留统一接口。
DEFAULTS 是全局注册时可直接使用的完整参数，只有 fps / samples 等少量控件。
"""

import numpy as np


WHITE, MUTED, BLUE, GREEN, YELLOW, RED = (
    "#e8edf6",
    "#687c96",
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#f38c98",
)
ALIAS_DEFAULTS = dict(time=0.375, speed=1.0, fps=12)
SHUTTER_DEFAULTS = dict(time=0.375, speed=1.0, fps=12, duty=1.0, samples=2)


def _scalar_handle(d, value, key, label, x0, x1, y, low, high, *, identifier=None):
    """数据域 [low,high] 对应画内水平轨道；映射和限制都以参数单位定义。"""
    scale = (x1 - x0) / (high - low)
    offset = x0 - scale * low
    d.line([[x0, y], [x1, y]], MUTED, 1.3)
    d.handle(
        [offset + scale * value, y], key, label, axes=[0], limits=[low, high, 0, 0]
    )
    d.handles[-1]["mapping"] = dict(scale=[scale, 1], offset=[offset, 0])
    if identifier:
        d.handles[-1]["id"] = identifier


def _image(d, image, encode, x, title, color, caption):
    d.text([x, 3.03], title, color, 15)
    d.image([x, 0.42], [2.4, 2.4], encode(image), pixelated=False)
    d.text([x, 0.12], caption, WHITE, 11)


def aliasing(p, t, Drawing, core, encode):
    """同一时间轴中的连续真实运动、等价慢运动与离散帧；固定 B=8。"""
    d = Drawing((-6.1, 6.1, -4.80, 3.45))
    time, speed, fps = float(p["time"]), float(p["speed"]), float(p["fps"])
    alias = core.apparent_speed(speed, fps, blades=8)
    index = int(np.floor(time * fps + 1e-12))
    sampled_time = index / fps
    actual = core.wheel_frame(time, speed)
    candidate = core.wheel_frame(time, alias)
    sampled = core.wheel_frame(sampled_time, speed)
    sampled_candidate = core.wheel_frame(sampled_time, alias)
    with d.panel("true-wheel", (-5.95, -2.1, -0.15, 3.4)):
        _image(
            d,
            actual,
            encode,
            -5.75,
            "真实连续运动",
            BLUE,
            f"ν = {speed:+.2f} rev/s · τ = {time:.3f} s",
        )
    with d.panel("alias-wheel", (-1.85, 2.0, -0.15, 3.4)):
        _image(
            d,
            candidate,
            encode,
            -1.65,
            "等价慢运动",
            RED,
            f"νₐ = {alias:+.2f} rev/s · 同一 τ",
        )
    with d.panel("sampled-wheel", (2.25, 6.1, -0.15, 3.4)):
        _image(
            d,
            sampled,
            encode,
            2.45,
            "采样帧 · 两种运动相同",
            YELLOW,
            f"n = {index} · tₙ = {sampled_time:.3f} s",
        )

    x0, x1, y0, height = -5.65, 5.55, -2.70, 1.80
    dense_times = np.linspace(0, 1, 801)
    samples = core.frame_times(fps)
    sampled_values = core.cosine_signal(samples, -8 * speed)
    with d.panel("time-signal", (-6.0, 6.0, -3.12, -0.15)):
        d.text([-5.65, -0.50], "亮度：蓝真实 · 红等价 · 黄样本", MUTED, 11)
        for velocity, color in ((speed, BLUE), (alias, RED)):
            values = core.cosine_signal(dense_times, -8 * velocity)
            d.line(
                np.column_stack([x0 + (x1 - x0) * dense_times, y0 + height * values]),
                color,
                1.8,
            )
        for sample, value in zip(samples, sampled_values):
            x = x0 + (x1 - x0) * sample
            d.line([[x, y0], [x, y0 - 0.09]], MUTED, 0.8)
            d.dot([x, y0 + height * value], YELLOW, 0.037)
        d.line([[x0, y0], [x1, y0]], MUTED, 0.8)
        probe = x0 + (x1 - x0) * time
        d.line([[probe, y0], [probe, y0 + height]], WHITE, 1, 0.8, True)
        for value, label in ((0, "0 s"), (0.5, "0.5 s"), (1, "1 s")):
            d.text([x0 + (x1 - x0) * value - 0.10, -3.00], label, MUTED, 11)
    with d.panel("time-control", (-6.0, 6.0, -4.10, -2.85)):
        d.text([-5.65, -3.32], f"时间 τ = {time:.3f} s", WHITE, 12)
        _scalar_handle(d, time, "time", "时间 τ", x0, x1, -3.77, 0, 1)
    with d.panel("speed-control", (-6.0, 6.0, -4.75, -3.60)):
        d.text([-5.65, -4.02], "速度 ν / rev/s", BLUE, 12)
        _scalar_handle(d, speed, "speed", "真实速度", -2.25, 2.9, -4.40, -2, 2)
        d.handles[-1]["color"] = BLUE
        d.text([3.1, -4.45], f"{speed:+.2f}", BLUE, 12)
    d.formula = (
        r"\begin{aligned}"
        r"\nu_a&=\frac{\operatorname{wrap}_{[-f_s/2,f_s/2)}(B\nu)}{B}\\"
        r"\nu_k&=\nu+kf_s/B,\quad k\in\mathbb Z\\"
        r"I(n/f_s;\nu_k)&=I(n/f_s;\nu)"
        r"\end{aligned}"
    )
    d.values = {
        "叶片对称数 B": 8,
        "真实速度 ν（rev/s）": round(speed, 4),
        "固定像素时间频率 Bν（Hz）": round(8 * speed, 4),
        "采样率 fs（fps = 样本/s）": fps,
        "等价速度 νa（rev/s）": round(alias, 4),
        "每帧真实 / 等价转角（°）": [
            round(360 * speed / fps, 3),
            round(360 * alias / fps, 3),
        ],
        "当前连续时刻 τ（s）": round(time, 5),
        "上一已采样 tₙ（s）": round(sampled_time, 5),
        "采样时整图最大差": float(np.max(np.abs(sampled - sampled_candidate))),
        "连续时整图最大差": float(np.max(np.abs(actual - candidate))),
        "方向约定": "+ 逆时针，− 顺时针；无独特标记的八重对称轮",
    }
    return d


def shutter(p, t, Drawing, core, encode):
    """同一快门窗口中的瞬时图、中点求积和逐像素解析积分。"""
    d = Drawing((-6.1, 6.1, -4.80, 3.45))
    center, speed, fps = float(p["time"]), float(p["speed"]), float(p["fps"])
    duty, count = float(p["duty"]), int(p["samples"])
    low, high, duration = core.shutter_interval(center, fps, duty)
    times = core.midpoint_times(center, duration, count)
    instantaneous = core.wheel_frame(center, speed)
    numerical = core.wheel_exposure(center, duration, count, speed)
    reference = core.wheel_reference(center, duration, speed)
    with d.panel("instantaneous-wheel", (-5.95, -2.1, -0.15, 3.4)):
        _image(
            d,
            instantaneous,
            encode,
            -5.75,
            "中心时刻 · 瞬时帧",
            BLUE,
            f"t꜀ = {center:.3f} s",
        )
    with d.panel("integrated-wheel", (-1.85, 2.0, -0.15, 3.4)):
        _image(
            d,
            numerical,
            encode,
            -1.65,
            f"时间中点求积 · N={count}",
            GREEN,
            "不同真实时刻的线性 RGB 平均",
        )
    with d.panel("reference-wheel", (2.25, 6.1, -0.15, 3.4)):
        _image(
            d,
            reference,
            encode,
            2.45,
            "解析时间积分 · 参考",
            YELLOW,
            f"Δ = {duration * 1000:.2f} ms",
        )

    # 横轴 q=(τ-tc)*fps；一格=1/fps 秒。快门宽度 duty，中心保持不动。
    half_width, y0, height = 5.0, -2.85, 1.90
    q = np.linspace(-1.25, 1.25, 601)
    curve_times = center + q / fps
    curve = core.cosine_signal(curve_times, -8 * speed)
    x = q * half_width / 1.25
    left, right = -duty * half_width / 2.5, duty * half_width / 2.5
    sample_values = core.cosine_signal(times, -8 * speed)
    estimated = float(sample_values.mean())
    exact = float(core.cosine_exposure(center, duration, -8 * speed))
    with d.panel("shutter-signal", (-6.0, 6.0, -3.80, 0.05)):
        d.text([-5.65, -0.38], "亮度：蓝瞬时 · 绿数值均值 · 黄解析均值", MUTED, 11)
        d.polygon(
            [[left, y0], [right, y0], [right, y0 + height], [left, y0 + height]],
            GREEN,
            0.13,
        )
        d.line(np.column_stack([x, y0 + height * curve]), BLUE, 1.8)
        d.line([[-half_width, y0], [half_width, y0]], MUTED, 0.8)
        for value, color in ((estimated, GREEN), (exact, YELLOW)):
            d.line(
                [[-half_width, y0 + height * value], [half_width, y0 + height * value]],
                color,
                1.1,
                0.85,
                True,
            )
        for sample, value in zip(times, sample_values):
            sx = (sample - center) * fps * half_width / 1.25
            d.line([[sx, y0], [sx, y0 + height * value]], GREEN, 0.7, 0.5)
            d.dot([sx, y0 + height * value], GREEN, 0.039)
        for q_tick in (-1, 0, 1):
            sx = q_tick * half_width / 1.25
            d.line([[sx, y0], [sx, y0 - 0.07]], MUTED, 0.9)
            d.text([sx - 0.12, -3.14], f"{q_tick:+d}" if q_tick else "0", MUTED, 11)
        d.text([-5.65, -3.55], "横轴 (τ − t꜀) fₛ · 1 单位 = 1 帧间隔", MUTED, 11)
        # 两柄在同一时间窗的不同高度：零占空时也能分别选中，且不压住图例。
        for endpoint, sign, label, handle_y in (
            (left, -1, "开门", y0 + height - 0.5),
            (right, 1, "关门", y0),
        ):
            d.line([[endpoint, y0], [endpoint, y0 + height]], GREEN, 1.1)
            d.handle([endpoint, handle_y], "duty", label, axes=[0], limits=[0, 1, 0, 0])
            d.handles[-1]["id"] = label
            d.handles[-1]["color"] = GREEN
            d.handles[-1]["mapping"] = dict(
                scale=[sign * half_width / 2.5, 1], offset=[0, 0]
            )
    with d.panel("exposure-time", (-5.6, 5.8, -4.75, -3.60)):
        d.text([-5.1, -3.98], f"帧中心 t꜀ = {center:.3f} s", WHITE, 12)
        _scalar_handle(d, center, "time", "帧中心时间", -5.1, 5.1, -4.40, 0, 1)
    d.formula = (
        r"\begin{aligned}"
        r"\bar I(t_c)&=\frac1\Delta\int_{t_c-\Delta/2}^{t_c+\Delta/2}I(\tau)\,d\tau\\"
        r"H&=\operatorname{sinc}(f\Delta)\\"
        r"\bar s&=a+bH\cos(2\pi f t_c+\phi)"
        r"\end{aligned}"
    )
    d.values = {
        "真实速度（rev/s）": speed,
        "固定像素时间频率 |Bν|（Hz）": abs(8 * speed),
        "帧率（fps）": fps,
        "快门占空比 d": duty,
        "曝光时长 Δ（s）": round(duration, 7),
        "开门 / 关门时刻（s）": [round(low, 7), round(high, 7)],
        "中点时间样本（s）": np.round(times, 6).tolist(),
        "亮度探针：瞬时 / 数值 / 解析": [
            round(float(core.cosine_signal(center, -8 * speed)), 6),
            round(estimated, 6),
            round(exact, 6),
        ],
        "整幅线性 RGB 最大绝对误差": float(np.max(np.abs(numerical - reference))),
        "sinc 衰减系数": round(float(np.sinc(8 * speed * duration)), 6),
        "误差口径": "数值图与解析图逐像素比较；不包括空间像素积分误差",
    }
    return d
