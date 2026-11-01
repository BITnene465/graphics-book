"""本章的一维采样实验：Python 算曲线、积分和谱线，浏览器只绘制与拖动。

Drawing 与本章 core 显式传入，避免和教材其他章节的同名 core.py 混淆。
图中的采样率单位是“每个场景长度的样本数”，不是屏幕刷新率。
"""

import numpy as np


BLUE, GREEN, YELLOW, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#e8edf6",
    "#687c96",
)


def convolution(p, progress, Drawing, core):
    """固定窗中心；播放进度从左向右累积积分，拖动中心则重新求另一位置。"""
    d = Drawing((-2.02, 2.02, -1.15, 1.15))
    center, half_width = p["center"], p["half_width"]
    frequency, phase = p["frequency"], p["phase"]
    left, right = center - half_width, center + half_width
    cursor = left + 2 * half_width * progress
    x = np.linspace(-1.8, 1.8, 900)
    signal = core.prefiltered_cosine(x, frequency, 0, phase)
    output = core.prefiltered_cosine(x, frequency, half_width, phase)
    gain = float(core.box_response(frequency, half_width))
    integral = float(
        core.cosine_window_integral(center, half_width, frequency, phase, progress)
    )
    partial = integral / (2 * half_width)
    complete = float(core.prefiltered_cosine(center, frequency, half_width, phase))

    # 上层纵轴是真实 g 值的线性映射；核支撑在第二层单独画，避免伪造核高度。
    source_y = lambda value: 0.37 + 0.48 * np.asarray(value)
    output_y = lambda value: -0.91 + 0.48 * np.asarray(value)
    d.text([-1.8, 1.02], "输入 g(u)", BLUE, 13)
    d.text([0.3, 1.02], "黄色窗内，绿色面积正在累积", WHITE, 12)
    for value in (0, 0.5, 1):
        y = float(source_y(value))
        d.line([[-1.8, y], [1.8, y]], MUTED, 0.7, 0.35)
        d.text([-1.97, y - 0.02], f"{value:g}", MUTED, 10)
    d.polygon([[left, 0.37], [right, 0.37], [right, 0.85], [left, 0.85]], YELLOW, 0.07)
    integration_x = np.linspace(left, cursor, max(2, int(220 * progress)))
    integration_y = core.prefiltered_cosine(integration_x, frequency, 0, phase)
    d.polygon(
        np.vstack(
            [
                [left, 0.37],
                np.column_stack([integration_x, source_y(integration_y)]),
                [cursor, 0.37],
            ]
        ),
        GREEN,
        0.3,
    )
    d.line(np.column_stack([x, source_y(signal)]), BLUE, 2.2)
    d.line([[cursor, 0.37], [cursor, 0.86]], GREEN, 1.5)
    for endpoint in (left, right):
        d.line([[endpoint, 0.22], [endpoint, 0.87]], YELLOW, 1, 0.7, True)

    # 盒核画成区间条；高度 1/(2h) 单独标注，条的装饰厚度没有数学含义。
    d.line([[-1.8, 0.12], [1.8, 0.12]], MUTED, 1)
    d.line([[left, 0.12], [right, 0.12]], YELLOW, 5)
    d.text([-1.8, -0.09], "盒核支撑 [x − h, x + h]", YELLOW, 12)
    d.text([0.35, -0.09], f"核高度 1/(2h) = {1/(2*half_width):.3f}", WHITE, 12)
    d.handle([center, 0.12], "center", "窗中心 x", axes=[0], limits=[-1, 1, 0, 0])
    d.handle([right, 0.12], "half_width", "半宽 h", axes=[0], limits=[0.03, 0.75, 0, 0])
    d.handles[-1]["mapping"] = {"scale": [1, 1], "offset": [center, 0]}

    d.text([-1.8, -0.34], "输出：每个位置的完整平均", GREEN, 13)
    for value in (0, 0.5, 1):
        y = float(output_y(value))
        d.line([[-1.8, y], [1.8, y]], MUTED, 0.7, 0.35)
        d.text([-1.97, y - 0.02], f"{value:g}", MUTED, 10)
    d.line(np.column_stack([x, output_y(output)]), GREEN, 2.5)
    d.line([[center, 0.12], [center, float(output_y(complete))]], YELLOW, 1, 0.7, True)
    d.dot([center, float(output_y(complete))], GREEN, 0.035)
    d.dot([center, float(output_y(partial))], YELLOW, 0.035)
    for position in (-1, 0, 1):
        d.text([position - 0.035, -1.06], f"{position:g}", MUTED, 11)
    d.text([1.63, -1.06], "位置", MUTED, 11)
    d.formula = r"(g*k_h)(x)=\frac{1}{2h}\int_{x-h}^{x+h}g(u)\,du"
    d.values = {
        "积分进度": f"{100*progress:.0f}%",
        "窗内积分（当前）": round(integral, 5),
        "黄点：积分 / 完整窗宽": round(partial, 5),
        "绿点：完整输出": round(complete, 5),
        "盒核频率响应": round(gain, 5),
    }
    return d


def spectrum(p, progress, Drawing, core):
    """显示解析 δ 谱的复制；下层用同一参数验证混叠曲线确实穿过样本。"""
    d = Drawing((-3, 3, -1.65, 1.65))
    frequency, sample_rate, phase = p["frequency"], p["sample_rate"], p["phase"]
    half_width = 0.5 / sample_rate if p["prefilter"] else 0.0
    gain = float(core.box_response(frequency, half_width))
    alias = float(core.alias_frequency(frequency, sample_rate))
    original_x, original_weights = core.cosine_spectral_lines(frequency, phase)
    repeated_x, repeated_weights = core.cosine_spectral_lines(
        frequency, phase, sample_rate
    )
    # 频率单位压缩到图面；handle 映射同时保证拖动修改的仍是 f、fs 原始单位。
    frequency_x = lambda value: np.asarray(value) / 6
    y0 = 0.35
    band = sample_rate / 12
    d.polygon([[-band, 0.27], [band, 0.27], [band, 1.13], [-band, 1.13]], GREEN, 0.075)
    reference = "未过滤参考" if p["prefilter"] else "原谱"
    d.text([-2.7, 1.46], f"谱线幅度：蓝 {reference} · 灰 复制 · 绿 基带", WHITE, 13)
    d.text([-2.7, 1.22], "采样谱除以 fs 后比较；谱线表示 δ 的系数", MUTED, 11)
    d.line([[-2.7, y0], [2.7, y0]], MUTED, 1)
    for magnitude in (0.5, 1):
        y = y0 + 0.72 * magnitude
        d.line([[-2.7, y], [2.7, y]], MUTED, 0.6, 0.16)
        d.text([-2.91, y - 0.02], f"{magnitude:g}", MUTED, 10)
    for f in (-12, -6, 0, 6, 12):
        x = float(frequency_x(f))
        d.line([[x, y0 - 0.035], [x, y0 + 0.035]], MUTED, 1)
        d.text([x - 0.05, 0.16], str(f), MUTED, 11)
    d.text([2.42, 0.16], "频率 ν", MUTED, 11)
    for x in (-band, band):
        d.line([[x, 0.27], [x, 1.13]], GREEN, 1, 0.65, True)
    d.handle([band, 0.29], "sample_rate", "fs / 2", axes=[0], limits=[2, 12, 0, 0])
    d.handles[-1]["mapping"] = {"scale": [1 / 12, 1], "offset": [0, 0]}
    for f, weight in zip(original_x, original_weights):
        x, height = float(frequency_x(f)), 0.72 * abs(weight)
        d.line([[x, y0], [x, y0 + height]], BLUE, 4, 0.8)
        d.dot([x, y0 + height], BLUE, 0.025)
    # 播放按离基带的距离逐根揭示谱线；进度只控制展示，不改采样率或谱系数。
    order = np.argsort(np.abs(repeated_x), kind="stable")
    count = int(np.ceil(progress * len(order)))
    for index in order[:count]:
        f, weight = repeated_x[index], gain * repeated_weights[index]
        x, height = float(frequency_x(f)), 0.72 * abs(weight)
        in_band = -sample_rate / 2 - 1e-10 <= f <= sample_rate / 2 + 1e-10
        line_color = GREEN if in_band else MUTED
        d.line([[x, y0], [x, y0 + height]], line_color, 2)
        d.dot([x, y0 + height], line_color, 0.018)
    d.handle(
        [float(frequency_x(frequency)), 1.03],
        "frequency",
        "原频率 f",
        axes=[0],
        limits=[0, 12, 0, 0],
    )
    d.handles[-1]["mapping"] = {"scale": [1 / 6, 1], "offset": [0, 0]}
    d.arrow(
        [float(frequency_x(frequency)), 0.95], [float(frequency_x(alias)), 0.95], YELLOW
    )

    # 下层观察长度固定为 1；非整数 fs 的末个样本位于区间内部，不伪造边界样本。
    x = np.linspace(0, 1, 1200)
    signal = np.cos(2 * np.pi * frequency * x + phase)
    candidate = gain * np.cos(2 * np.pi * alias * x + phase)
    positions = np.arange(int(np.floor(sample_rate)) + 1) / sample_rate
    values = gain * np.cos(2 * np.pi * frequency * positions + phase)
    other = gain * np.cos(2 * np.pi * alias * positions + phase)
    plot_x = lambda value: -2.6 + 5.2 * np.asarray(value)
    plot_y = lambda value: -0.93 + 0.38 * np.asarray(value)
    d.text([-2.7, -0.25], "相同样本：连续输入与基带候选", WHITE, 13)
    d.line([[-2.6, -0.93], [2.6, -0.93]], MUTED, 1)
    if p["prefilter"]:
        d.line(np.column_stack([plot_x(x), plot_y(signal)]), BLUE, 1, 0.3, True)
    d.line(np.column_stack([plot_x(x), plot_y(gain * signal)]), BLUE, 1.5, 0.8)
    d.line(np.column_stack([plot_x(x), plot_y(candidate)]), GREEN, 2)
    for xk, value in zip(positions, values):
        d.line(
            [[float(plot_x(xk)), -0.93], [float(plot_x(xk)), float(plot_y(value))]],
            YELLOW,
            1,
            0.35,
        )
        d.dot([float(plot_x(xk)), float(plot_y(value))], YELLOW, 0.032)
    d.text([-2.65, -1.5], "0", MUTED, 11)
    d.text([2.53, -1.5], "1", MUTED, 11)
    d.text([1.47, -1.5], "位置 x", MUTED, 11)
    d.formula = r"\frac{X_s(\nu)}{f_s}=\sum_{k\in\mathbb Z}X(\nu-kf_s)"
    d.values = {
        "原频率 f": round(frequency, 3),
        "Nyquist 频率 fs/2": round(sample_rate / 2, 3),
        "有符号候选频率": round(alias, 3),
        "采样前的盒核响应": round(gain, 5),
        "两条曲线的最大样本差": f"{np.max(np.abs(values-other)):.1e}",
        "展开的谱线": f"{count} / {len(order)}",
    }
    return d
