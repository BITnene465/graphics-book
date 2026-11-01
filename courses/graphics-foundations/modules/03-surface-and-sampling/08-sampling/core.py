"""像素盒式积分、SSAA 与一维混叠。数组行向下，场景 y 向上、原点在图像中心。"""

import numpy as np


def sample_offsets(count, strategy="grid", seed=7):
    """每像素 n×n 个位置，位于 [0,1)²；抖动每层一个，固定种子可复现。"""
    n = int(np.sqrt(count))
    if count not in (1, 4, 16, 64) or n * n != count:
        raise ValueError("本章采样数为 1、4、16 或 64")
    if strategy not in ("grid", "jitter"):
        raise ValueError("采样策略为 grid 或 jitter")
    x, y = np.meshgrid(np.arange(n), np.arange(n))
    cells = np.stack([x.ravel(), y.ravel()], axis=-1)
    shift = (
        0.5 if strategy == "grid" else np.random.default_rng(seed).random((count, 2))
    )
    return (cells + shift) / n


def scene_values(xy, scene="line", phase=0.0, angle=35.0, width=0.6, cell=1.4):
    """连续二值场景：斜边、细斜线或旋转棋盘；不先生成任何位图。"""
    if scene not in ("edge", "line", "checker") or width <= 0 or cell <= 0:
        raise ValueError("未知场景，或线宽/格宽不是正数")
    xy = np.asarray(xy, float)
    theta = np.deg2rad(angle)
    u = np.cos(theta) * xy[..., 0] + np.sin(theta) * xy[..., 1] - phase
    v = -np.sin(theta) * xy[..., 0] + np.cos(theta) * xy[..., 1] - 0.7 * phase
    if scene == "edge":
        return (u <= 0).astype(float)
    if scene == "line":
        return (np.abs(u) <= width / 2).astype(float)
    return ((np.floor(u / cell) + np.floor(v / cell)).astype(np.int64) % 2).astype(
        float
    )


def sample_coverage(size=40, count=16, strategy="grid", **scene):
    """输出分辨率固定；额外样本只用于每个输出像素内部的平均。"""
    if not isinstance(size, (int, np.integer)) or size < 1:
        raise ValueError("size 必须是正整数")
    x, y = np.meshgrid(np.arange(size), size - 1 - np.arange(size))
    lower_left = np.stack([x, y], axis=-1) - size / 2
    positions = lower_left[..., None, :] + sample_offsets(count, strategy)
    return scene_values(positions, **scene).mean(axis=-1)


def halfplane_coverage(centers, normal, threshold):
    """单位像素盒内 n·x ≤ threshold 的精确覆盖率，二维均匀分布的 CDF。"""
    centers, normal = np.asarray(centers, float), np.asarray(normal, float)
    if (
        normal.shape != (2,)
        or not np.isfinite(normal).all()
        or np.linalg.norm(normal) == 0
    ):
        raise ValueError("需要非零的有限二维法向量")
    a, b = np.sort(np.abs(normal))  # 先令 a≤b；过渡区依次为三角形、梯形、剩余三角形。
    s = threshold - np.sum(centers * normal, axis=-1) + (a + b) / 2
    if a == 0:
        return np.clip(s / b, 0, 1)
    z = np.clip(s, 0, a + b)
    # 三段分别求面积，避免近轴向时相近平方相减丢失有效位。
    tail = np.minimum(np.minimum(z, a + b - z), a)
    cap = 0.5 * (tail / a) * (tail / b)
    cdf = np.where(z < a, cap, np.where(z > b, 1 - cap, (z - a / 2) / b))
    return np.clip(cdf, 0, 1)


def exact_coverage(size=40, scene="line", phase=0.0, angle=35.0, width=0.6):
    """斜边/细线的解析盒式覆盖率；不是更高采样数伪装的真值。"""
    x, y = np.meshgrid(
        np.arange(size) + 0.5 - size / 2, size / 2 - np.arange(size) - 0.5
    )
    centers = np.stack([x, y], axis=-1)
    theta = np.deg2rad(angle)
    normal = np.array([np.cos(theta), np.sin(theta)])
    if scene == "edge":
        return halfplane_coverage(centers, normal, phase)
    if scene == "line":
        difference = halfplane_coverage(
            centers, normal, phase + width / 2
        ) - halfplane_coverage(centers, normal, phase - width / 2)
        return np.clip(difference, 0, 1)
    raise ValueError("棋盘未提供解析参考；不要把高密度采样叫作真值")


def linear_to_srgb(linear):
    value = np.clip(np.asarray(linear, float), 0, 1)
    return np.where(
        value <= 0.0031308, 12.92 * value, 1.055 * value ** (1 / 2.4) - 0.055
    )


def srgb_to_linear(encoded):
    value = np.clip(np.asarray(encoded, float), 0, 1)
    return np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)


def average_color(
    coverage,
    foreground=(0.03, 0.32, 0.14),
    background=(0.9, 0.9, 0.9),
    *,
    wrong_space=False
):
    """由覆盖率混合两个线性 RGB；错误对照先编码后平均，再解码供统一显示。"""
    weight = np.asarray(coverage, float)[..., None]
    foreground, background = np.asarray(foreground, float), np.asarray(
        background, float
    )
    if wrong_space:
        mixed = weight * linear_to_srgb(foreground) + (1 - weight) * linear_to_srgb(
            background
        )
        return srgb_to_linear(mixed)
    return weight * foreground + (1 - weight) * background


def alias_frequency(frequency, sample_rate):
    """返回 [-fs/2, fs/2) 内的带符号等价频率；样本位置 k/fs，正弦保留相位。"""
    if not np.isfinite(frequency) or not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("频率必须有限，采样率必须为正")
    return (frequency + sample_rate / 2) % sample_rate - sample_rate / 2


def box_response(frequency, half_width):
    """面积为 1 的盒核的频率响应；np.sinc(z) = sin(πz)/(πz)。"""
    frequency = np.asarray(frequency, float)
    if (
        not np.isfinite(frequency).all()
        or not np.isfinite(half_width)
        or half_width < 0
    ):
        raise ValueError("频率必须有限，半宽必须为非负数")
    return np.sinc(2 * half_width * frequency)


def prefiltered_cosine(x, frequency, half_width, phase=0.0, mean=0.5, amplitude=0.45):
    """解析求 g 与归一化盒核的卷积；半宽 0 表示点取值的极限。"""
    gain = box_response(frequency, half_width)
    return mean + amplitude * gain * np.cos(
        2 * np.pi * frequency * np.asarray(x) + phase
    )


def cosine_window_integral(
    center, half_width, frequency, phase=0.0, progress=1.0, mean=0.5, amplitude=0.45
):
    """从窗左端积分到其 progress 位置；返回积分本身，尚未除以完整窗宽。"""
    if not np.isfinite(progress) or not 0 <= progress <= 1:
        raise ValueError("积分进度必须在 [0,1] 内")
    if not np.isfinite(half_width) or half_width <= 0:
        raise ValueError("积分窗半宽必须为正数")
    width = 2 * half_width * progress
    midpoint = center - half_width + width / 2
    # 一小段余弦的平均仍用 sinc 计算，避免频率接近 0 时两个正弦相减。
    return width * prefiltered_cosine(
        midpoint, frequency, width / 2, phase, mean, amplitude
    )


def cosine_spectral_lines(frequency, phase=0.0, sample_rate=None, extent=16.0):
    """余弦的解析 δ 谱线；采样后返回 X_s / f_s，即按 fs 平移的谱线之和。

    返回位置与复系数，不是 FFT 栅格或有限窗口估计。相同位置先相加复系数，
    所以 DC、Nyquist 边界以及有相位的重叠都正确；调用方最后才能取绝对值。
    """
    if (
        not np.isfinite([frequency, phase, extent]).all()
        or frequency < 0
        or extent <= 0
    ):
        raise ValueError("频率须非负，显示频率范围须为正，所有输入须有限")
    if sample_rate is not None and (not np.isfinite(sample_rate) or sample_rate <= 0):
        raise ValueError("采样率必须为正数")
    entries = []
    for location, coefficient in [
        (frequency, 0.5 * np.exp(1j * phase)),
        (-frequency, 0.5 * np.exp(-1j * phase)),
    ]:
        shifts = (
            [0]
            if sample_rate is None
            else range(
                int(np.ceil((-extent - location) / sample_rate)),
                int(np.floor((extent - location) / sample_rate)) + 1,
            )
        )
        for k in shifts:
            position = location if sample_rate is None else location + k * sample_rate
            entries.append((position, coefficient))
    positions, coefficients = [], []
    for position, coefficient in sorted(entries, key=lambda entry: entry[0]):
        if positions and np.isclose(position, positions[-1], rtol=0, atol=1e-10):
            coefficients[-1] += coefficient
        else:
            positions.append(position)
            coefficients.append(coefficient)
    return np.asarray(positions), np.asarray(coefficients, complex)
