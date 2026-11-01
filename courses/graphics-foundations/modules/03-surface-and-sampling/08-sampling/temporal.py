"""时间采样与居中盒式快门；速度用 rev/s，时间用秒，亮度在线性域。

轮面有 B 个完全相同的余弦亮瓣，故固定像素的时间频率为 B*speed Hz。
每个时间样本都重新求值运动后的轮面；不使用空间卷积或历史帧。
"""

from functools import lru_cache

import numpy as np


def _finite(*values):
    if not all(np.isfinite(value).all() for value in map(np.asarray, values)):
        raise ValueError("时间、频率和相位必须为有限数")


def _positive_integer(value, name, maximum):
    if not isinstance(value, (int, np.integer)) or not 1 <= value <= maximum:
        raise ValueError(f"{name}必须是 1 到 {maximum} 的整数")


def frame_times(fps, duration=1.0):
    """均匀采样时刻 n/fps，包含 0；结束时刻仅在它落于采样格点时出现。"""
    _finite(fps, duration)
    if fps <= 0 or duration < 0 or fps * duration > 4096:
        raise ValueError("fps 必须为正，时长非负，最多显示 4097 个时刻")
    return np.arange(int(np.floor(fps * duration + 1e-12)) + 1) / fps


def apparent_speed(speed, fps, blades=8):
    """把 B*speed 折到 [-fps/2, fps/2)，再除以 B；并非估计真实速度。

    每一个 speed + k*fps/B 都与输入在 n/fps 同像。Nyquist 端点的
    两个方向不能区分；这里固定选择负端点，避免返回值含糊。
    """
    _finite(speed, fps)
    _positive_integer(blades, "亮瓣数", 64)
    if fps <= 0:
        raise ValueError("fps 必须为正")
    frequency = blades * speed
    return ((frequency + fps / 2) % fps - fps / 2) / blades


def cosine_signal(time, frequency, phase=0.0, mean=0.55, amplitude=0.45):
    """独立的时间信号 a+b*cos(2π*f*t+phase)；frequency 单位 Hz。"""
    _finite(time, frequency, phase, mean, amplitude)
    return mean + amplitude * np.cos(2 * np.pi * frequency * np.asarray(time) + phase)


def cosine_exposure(time, duration, frequency, phase=0.0, mean=0.55, amplitude=0.45):
    """盒式平均的解析值；np.sinc(x)=sin(πx)/(πx)，duration=0 取极限。"""
    _finite(time, duration, frequency, phase, mean, amplitude)
    if duration < 0:
        raise ValueError("曝光时长必须非负")
    attenuation = np.sinc(frequency * duration)
    return mean + amplitude * attenuation * np.cos(
        2 * np.pi * frequency * np.asarray(time) + phase
    )


def shutter_interval(center, fps, duty):
    """开合占空比 duty∈[0,1]；返回 (开门时刻, 关门时刻, Δ=duty/fps)。"""
    _finite(center, fps, duty)
    if fps <= 0 or not 0 <= duty <= 1:
        raise ValueError("fps 必须为正，快门占空比必须在 [0,1]")
    duration = duty / fps
    return center - duration / 2, center + duration / 2, duration


def midpoint_times(center, duration, samples):
    """N 个等宽时间小段的中点；N=1 和 Δ=0 都退化为中心时刻。"""
    _finite(center, duration)
    _positive_integer(samples, "时间样本数", 512)
    if duration < 0:
        raise ValueError("曝光时长必须非负")
    return center + duration * ((np.arange(samples) + 0.5) / samples - 0.5)


@lru_cache(maxsize=4)
def wheel_coordinates(resolution=128):
    """像素中心坐标；数组第 0 行在顶部，正转在数学坐标里逆时针。"""
    _positive_integer(resolution, "分辨率", 256)
    x = 2 * (np.arange(resolution) + 0.5) / resolution - 1
    xx, yy = np.meshgrid(x, -x)
    radius, angle = np.hypot(xx, yy), np.arctan2(yy, xx)
    # 固定的平滑径向包络不引入额外时间频率，亮瓣只沿角度旋转。
    envelope = np.clip((radius - 0.14) / 0.11, 0, 1)
    envelope *= np.clip((0.94 - radius) / 0.12, 0, 1)
    return angle, envelope


def _wheel_colors(intensity, envelope):
    """固定背景、径向包络和基色；只有 intensity 随时间变化。"""
    background = np.array([0.013, 0.019, 0.029])
    tint = np.array([0.20, 0.57, 0.96])
    return background + envelope[..., None] * intensity[..., None] * tint


def wheel_frame(time, speed=1.0, blades=8, resolution=128):
    """I(x,y,time)：在一个真实时刻重新计算所有像素的轮面亮度。"""
    _finite(time, speed)
    _positive_integer(blades, "亮瓣数", 64)
    angle, envelope = wheel_coordinates(resolution)
    intensity = cosine_signal(time, -blades * speed, blades * angle)
    return _wheel_colors(intensity, envelope)


def wheel_reference(center, duration, speed=1.0, blades=8, resolution=128):
    """逐像素解析时间积分；仅适用于这个角度为单一余弦的轮面。"""
    _finite(center, speed, duration)
    _positive_integer(blades, "亮瓣数", 64)
    angle, envelope = wheel_coordinates(resolution)
    intensity = cosine_exposure(center, duration, -blades * speed, blades * angle)
    return _wheel_colors(intensity, envelope)


def wheel_exposure(center, duration, samples, speed=1.0, blades=8, resolution=128):
    """对 N 个真实时刻的完整线性 RGB 图像作中点求积，再返回平均图像。"""
    _positive_integer(resolution, "分辨率", 256)
    times = midpoint_times(center, duration, samples)
    total = np.zeros((resolution, resolution, 3), float)
    for time in times:
        total += wheel_frame(time, speed, blades, resolution)
    return total / samples
