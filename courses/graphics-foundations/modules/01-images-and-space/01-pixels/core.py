"""第 01 章的数学：数组行向下，几何 y 向上；颜色计算在线性 RGB 中。"""

import numpy as np


def pixel_centers(width, height):
    """返回 (H,W,2) 归一化中心坐标。数组 [0,0] 是左上像素。"""
    if not isinstance(width, (int, np.integer)) or not isinstance(height, (int, np.integer)):
        raise ValueError("分辨率必须是整数")
    if width < 1 or height < 1:
        raise ValueError("分辨率必须大于零")
    u = (np.arange(width) + 0.5) / width
    v = 1 - (np.arange(height) + 0.5) / height
    return np.stack(np.meshgrid(u, v), axis=-1)


def srgb_to_linear(encoded):
    """sRGB 解码；本章约定输入是有限的 [0,1] 浮点值。"""
    s = np.asarray(encoded, dtype=float)
    if not np.isfinite(s).all() or np.any((s < 0) | (s > 1)):
        raise ValueError("sRGB 值必须位于 [0,1]")
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(linear):
    """显示编码。先裁到显示范围；不在这里做曝光或色调映射。"""
    c = np.asarray(linear, dtype=float)
    if not np.isfinite(c).all():
        raise ValueError("线性颜色必须有限")
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def mix_colors(a_srgb, b_srgb, t, linear=True):
    """输入、输出均为 sRGB；linear=False 故意演示常见错误。"""
    a, b = np.asarray(a_srgb, dtype=float), np.asarray(b_srgb, dtype=float)
    if a.shape != (3,) or b.shape != (3,) or not np.isfinite(t) or not 0 <= t <= 1:
        raise ValueError("需要两个 RGB 三元组和 [0,1] 混合比例")
    a_linear, b_linear = srgb_to_linear(a), srgb_to_linear(b)
    if linear:
        return linear_to_srgb((1 - t) * a_linear + t * b_linear)
    return (1 - t) * a + t * b


def scene_color(u, v, pattern="disk"):
    """连续场景的线性 RGB；u 向右、v 向上，均在 [0,1]。"""
    u, v = np.broadcast_arrays(u, v)
    if pattern == "gradient":
        return np.repeat(u[..., None], 3, axis=-1)
    if pattern == "corners":
        # 左上红、右上绿、左下蓝、右下白：用于核对数组方向。
        return np.stack([np.where(v >= .5, u < .5, u >= .5),
                         u >= .5, v < .5], axis=-1).astype(float)
    if pattern != "disk":
        raise ValueError("未知场景")
    disk = (u - .5) ** 2 + (v - .5) ** 2 <= .32 ** 2
    return np.where(disk[..., None], [1., .22, .055], [.025, .065, .055])


def sample_offsets(samples):
    """每轴 samples 个位置；返回像素左下角起算的 (samples²,2) 求值位置。"""
    if not isinstance(samples, (int, np.integer)) or not 1 <= samples <= 16:
        raise ValueError("每轴采样数必须是 1 至 16 的整数")
    x, y = np.meshgrid((np.arange(samples) + .5) / samples,
                       (np.arange(samples) + .5) / samples)
    return np.column_stack([x.ravel(), y.ravel()])


def render_image(width, height, samples=1, pattern="disk"):
    """每像素 samples² 次规则采样后求线性均值，返回 (H,W,3)。"""
    centers = pixel_centers(width, height)
    image = np.zeros((height, width, 3), dtype=float)
    for dx, dy in sample_offsets(samples):
        # 对称的子像素位置；samples=1 时退化到像素中心。
        u = centers[..., 0] + (dx - .5) / width
        v = centers[..., 1] + (dy - .5) / height
        image += scene_color(u, v, pattern)
    return image / samples ** 2


def probe_pixel(x, y, width, height):
    """几何像素坐标 → (数组行, 列)。右/上边界不属于图像。"""
    if not np.isfinite([x, y]).all() or not (0 <= x < width and 0 <= y < height):
        raise ValueError("探针不在图像内部")
    return height - 1 - int(np.floor(y)), int(np.floor(x))


def rgba_for_bokeh(linear_image):
    """线性 (H,W,3) → Bokeh uint32 RGBA；显示前仅翻转一次行方向。"""
    image = np.asarray(linear_image, dtype=float)
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("图像形状应为 (H,W,3)")
    rgb = np.rint(255 * linear_to_srgb(image)).astype(np.uint32)
    # Bokeh uint32 的低字节为 R，其次 G、B、A；不依赖主机字节序。
    packed = rgb[..., 0] | (rgb[..., 1] << 8) | (rgb[..., 2] << 16) | (255 << 24)
    return np.flipud(packed).copy()  # Bokeh origin='bottom_left' 的首行在底部。
