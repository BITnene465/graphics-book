"""Ripmap 与有界椭圆加权参考：相同 UV，查看真实的线性颜色与纹素权重。

数组首行在顶部，UV 的 v 向上。轴长均为源纹素中的完整跨度。
本文件的椭圆过滤显式遍历第 0 层纹素，不冒充带重建核/mip 加速的完整 EWA。
"""

import importlib.util
from pathlib import Path

import numpy as np

_spec = importlib.util.spec_from_file_location(
    "footprint_texture_core", Path(__file__).with_name("core.py")
)
texture_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(texture_core)


def _texture(texture):
    image = np.asarray(texture, float)
    if (
        image.ndim != 3
        or image.shape[2] != 3
        or min(image.shape[:2]) < 1
        or not np.isfinite(image).all()
    ):
        raise ValueError("需要有限的 (H,W,3) 线性 RGB 纹理")
    return image


def _uv(uv):
    point = np.asarray(uv, float)
    if (
        point.shape != (2,)
        or not np.isfinite(point).all()
        or np.any((point < 0) | (point > 1))
    ):
        raise ValueError("本实验的查询 UV 必须在 [0,1]² 内")
    return point


def build_ripmap(texture):
    """grid[ly][lx]：先逐轴缩半；每一项是实际 RGB 数组，而非尺度示意图。

    NPOT 沿用本章面积平均与 floor(n/2) 约定。两个轴独立降到 1，
    包括 1×N 纹理；所有层保持全图均值，但层号仅是名义 log₂ 坐标。
    """
    horizontal = [_texture(texture).copy()]
    while horizontal[-1].shape[1] > 1:
        previous = horizontal[-1]
        horizontal.append(
            texture_core._area_reduce_axis(previous, max(1, previous.shape[1] // 2), 1)
        )
    grid = [horizontal]
    while grid[-1][0].shape[0] > 1:
        height = max(1, grid[-1][0].shape[0] // 2)
        grid.append(
            [texture_core._area_reduce_axis(image, height, 0) for image in grid[-1]]
        )
    return grid


def ripmap_probe(grid, uv, lod_xy):
    """四个层对各做一次双线性，再按 x/y 两个层级的小数部分混合。

    每次查询最多 4 层 × 4 纹素，共 16 个读数；重复层/边界 texel 可以合并。
    """
    uv, lod = _uv(uv), np.asarray(lod_xy, float)
    if lod.shape != (2,) or not np.isfinite(lod).all():
        raise ValueError("需要两个有限的独立 LOD")
    maximum = np.array([len(grid[0]) - 1, len(grid) - 1])
    lod = np.clip(lod, 0, maximum)
    lower = np.floor(lod).astype(int)
    fraction = lod - lower
    queries = []
    color = np.zeros(3)
    for dy in (0, 1):
        for dx in (0, 1):
            lx, ly = np.minimum(lower + [dx, dy], maximum)
            weight = (fraction[0] if dx else 1 - fraction[0]) * (
                fraction[1] if dy else 1 - fraction[1]
            )
            image = grid[ly][lx]
            value = texture_core.sample_texture(image, uv)
            rows, cols, texel_weights = texture_core.bilinear_taps(
                uv, image.shape[1], image.shape[0]
            )
            color += weight * value
            queries.append(
                dict(
                    level=[int(lx), int(ly)],
                    weight=float(weight),
                    shape=list(image.shape[:2]),
                    color=value,
                    rows=rows,
                    cols=cols,
                    texel_weights=texel_weights,
                )
            )
    return dict(color=color, lod=lod, queries=queries)


def sample_ripmap(grid, uv, lod_xy):
    """单个查询的线性 RGB；需要观察计算链时使用 ripmap_probe。"""
    return ripmap_probe(grid, uv, lod_xy)["color"]


def _axis_weights(count, coordinate, lod):
    """沿一轴追踪每层格子来自哪些源格子；输出对第 0 层的真实系数。"""
    levels = [np.eye(count)]
    while len(levels[-1]) > 1:
        levels.append(
            texture_core._area_reduce_axis(levels[-1], max(1, len(levels[-1]) // 2), 0)
        )
    lod = float(np.clip(lod, 0, len(levels) - 1))
    low = int(np.floor(lod))
    result = np.zeros(count)
    for level, blend in (
        (low, 1 - (lod - low)),
        (min(low + 1, len(levels) - 1), lod - low),
    ):
        x = coordinate * len(levels[level]) - 0.5
        left = int(np.floor(x))
        t = x - left
        for index, weight in ((left, 1 - t), (left + 1, t)):
            result += (
                blend
                * weight
                * levels[level][np.clip(index, 0, len(levels[level]) - 1)]
            )
    return result


def ripmap_weights(shape, uv, lod_xy):
    """合并四层双线性与预平均的系数，返回每个原纹素的贡献权重。"""
    uv = _uv(uv)
    height, width = shape[:2]
    wx = _axis_weights(width, uv[0], lod_xy[0])
    wy = _axis_weights(height, 1 - uv[1], lod_xy[1])
    return wy[:, None] * wx[None, :]


def ellipse_axes(axis_a, axis_b, angle):
    """轴1/轴2可交换大小；angle 是轴1朝向（度），不冒称必然为长轴。"""
    if (
        not np.isfinite([axis_a, axis_b, angle]).all()
        or min(axis_a, axis_b) < 0
        or max(axis_a, axis_b) > 256
    ):
        raise ValueError("两轴完整跨度需为 0 至 256，角度必须有限")
    theta = np.deg2rad(angle)
    rotation = np.array(
        [[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]]
    )
    # 二次型的形状矩阵不是这份截断核的概率协方差。
    shape = rotation @ np.diag([(axis_a / 2) ** 2, (axis_b / 2) ** 2]) @ rotation.T
    spans = 2 * np.sqrt(np.maximum(0, np.diag(shape)))
    return dict(
        rotation=rotation,
        shape_matrix=shape,
        spans=spans,
        lod_xy=np.log2(np.maximum(spans, 1)),
    )


def ellipse_filter(texture, uv, axis_a, axis_b, angle=0):
    """有限 Gaussian 椭圆的离散纹素求和，返回颜色和完整真实权重图。

    r²<1 内用 exp(-2r²)-exp(-2)，边界外为 0，最后归一化。
    邻居越界时先按 clamp 取边缘 texel，再把重复地址的权重累加。
    零轴或没有正权重的纹素中心时明确回退双线性；没有隐式添加重建核。
    """
    texture, uv = _texture(texture), _uv(uv)
    height, width = texture.shape[:2]
    axes = ellipse_axes(axis_a, axis_b, angle)
    weights = np.zeros((height, width))
    center = uv * [width, height] - 0.5  # y 向上的连续纹素中心坐标。
    count = 0
    fallback = min(axis_a, axis_b) == 0
    if not fallback:
        half = axes["spans"] / 2
        lo, hi = np.ceil(center - half).astype(int), np.floor(center + half).astype(int)
        x, y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        delta = np.stack([x - center[0], y - center[1]], axis=-1)
        # 旋转回主轴坐标，除以半轴；无需求可能病态的矩阵逆。
        local = (delta @ axes["rotation"]) / [axis_a / 2, axis_b / 2]
        r2 = np.sum(local * local, axis=-1)
        inside = r2 < 1
        mass = np.exp(-2 * r2[inside]) - np.exp(-2)
        count = int(inside.sum())
        fallback = not count or float(mass.sum()) <= 0
        if not fallback:
            cols = np.clip(x[inside], 0, width - 1)
            rows = height - 1 - np.clip(y[inside], 0, height - 1)
            np.add.at(weights, (rows, cols), mass / mass.sum())
    if fallback:
        rows, cols, mass = texture_core.bilinear_taps(uv, width, height)
        np.add.at(weights, (rows, cols), mass)
    rows, cols = np.nonzero(weights > 0)
    return dict(
        color=np.sum(texture * weights[..., None], axis=(0, 1)),
        weights=weights,
        rows=rows,
        cols=cols,
        texel_weights=weights[rows, cols],
        sampled_centers=count,
        unique_texels=len(rows),
        fallback=fallback,
        **axes
    )


def demo_texture(size=32, pattern="diagonal"):
    """线性颜色中的程序纹理；斜向条纹用于隔离旋转足迹的问题。"""
    if pattern == "checker":
        return texture_core.checker_texture(size, 8)
    if pattern != "diagonal":
        raise ValueError("纹理为 diagonal 或 checker")
    x, y = np.meshgrid(np.arange(size) + 0.5, size - np.arange(size) - 0.5)
    t = 0.5 + 0.45 * np.cos(2 * np.pi * (x - y) / 6)
    return t[..., None] * np.array([0.92, 0.65, 0.22]) + (1 - t[..., None]) * np.array(
        [0.035, 0.12, 0.3]
    )
