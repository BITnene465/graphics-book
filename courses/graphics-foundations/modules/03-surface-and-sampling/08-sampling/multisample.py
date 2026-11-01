"""覆盖、可见性与着色频率分别计算；所有颜色在线性 RGB 中 resolve。

屏幕坐标以像素为单位、y 向上；数组第 0 行在顶部。输入是已经投影的
三角形，depths 是可在屏幕重心坐标下线性插值的深度（越小越近）。
这是可读的正交屏幕域实验，不包含透视属性、透明度或硬件流水线模拟。
"""

from functools import lru_cache
import importlib.util
from pathlib import Path

import numpy as np


@lru_cache(maxsize=1)
def _raster():
    path = (
        Path(__file__).resolve().parents[2]
        / "02-rasterization/04-barycentric/raster.py"
    )
    spec = importlib.util.spec_from_file_location("sampling_triangle_raster", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample_positions(width, height, grid):
    """规则 grid×grid 样本；返回 (H,W,S,2)，格点中心避免边界双重归属。"""
    if any(
        not isinstance(n, (int, np.integer)) or n < 1 for n in (width, height, grid)
    ):
        raise ValueError("图像尺寸和每轴样本数必须为正整数")
    if width > 512 or height > 512 or grid > 4:
        raise ValueError("本实验最多 512×512 像素、每轴 4 个样本")
    sy, sx = np.meshgrid(
        (np.arange(grid) + 0.5) / grid, (np.arange(grid) + 0.5) / grid, indexing="ij"
    )
    offsets = np.column_stack([sx.ravel(), sy.ravel()])
    cols, rows = np.meshgrid(np.arange(width), np.arange(height))
    origins = np.stack([cols, height - 1 - rows], axis=-1)
    return origins[..., None, :] + offsets


def visibility(triangles, depths, positions):
    """逐样本覆盖与深度；同深度时先提交的三角形获胜，背景 owner=-1。"""
    triangles, depths, positions = (
        np.asarray(a, float) for a in (triangles, depths, positions)
    )
    if (
        triangles.ndim != 3
        or triangles.shape[1:] != (3, 2)
        or depths.shape != triangles.shape[:2]
    ):
        raise ValueError("triangles 需要 (T,3,2)，depths 需要 (T,3)")
    if not np.isfinite(triangles).all() or not np.isfinite(depths).all():
        raise ValueError("几何与深度必须有限")
    owner = np.full(positions.shape[:-1], -1, dtype=np.int32)
    nearest = np.full(owner.shape, np.inf)
    masks = []
    for index, (vertices, z) in enumerate(zip(triangles, depths)):
        covered, weights = _raster().triangle_coverage(vertices, positions)
        depth = weights @ z
        wins = covered & (depth < nearest)
        owner[wins], nearest[wins] = index, depth[wins]
        masks.append(covered)
    coverage = np.stack(masks) if masks else np.empty((0,) + owner.shape, bool)
    return dict(owner=owner, depth=nearest, coverage=coverage)


def shade(points, base_color, frequency=0, phase=0):
    """固定在屏幕域的连续条纹；频率单位 cycles/pixel，0 表示常量颜色。

    C(x,y)=C_base [0.55+0.45 cos(2π f x+φ)]；这里只隔离着色采样，
    不把高频贴图的采样与材质自身的 mipmap 过滤混在一起。
    """
    points, base_color = np.asarray(points), np.asarray(base_color, float)
    intensity = 0.55 + 0.45 * np.cos(2 * np.pi * frequency * points[..., 0] + phase)
    return intensity[..., None] * base_color


def resolve(sample_colors):
    """每个像素把 S 个线性 RGB 样本等权平均，包含未覆盖的背景样本。"""
    values = np.asarray(sample_colors, float)
    if (
        values.ndim < 2
        or values.shape[-1] != 3
        or values.shape[-2] == 0
        or not np.isfinite(values).all()
    ):
        raise ValueError("需要非空的有限 (...,S,3) 线性 RGB 样本")
    return values.mean(axis=-2)


def _shade_visible(
    visible, positions, centers, colors, frequency, phase, background, share
):
    """先决定最终可见表面，再统计必需的着色求值；不模拟过绘制或 early-Z。"""
    owner = visible["owner"]
    samples = np.broadcast_to(background, owner.shape + (3,)).copy()
    counts = np.zeros(owner.shape[:2], dtype=np.int32)
    for index, color in enumerate(colors):
        selected = owner == index
        if share:
            # 一个像素可以看到多个图元：每个有获胜样本的图元都需要一次着色。
            rows, cols = np.nonzero(selected.any(axis=-1))
            evaluated = shade(centers[rows, cols], color, frequency, phase)
            local = samples[rows, cols]
            local = np.where(
                selected[rows, cols, :, None], evaluated[:, None, :], local
            )
            samples[rows, cols] = local
            counts[rows, cols] += 1
        else:
            samples[selected] = shade(positions[selected], color, frequency, phase)
            counts += selected.sum(axis=-1).astype(np.int32)
    return dict(
        **visible,
        sample_colors=samples,
        image=resolve(samples),
        shading_per_pixel=counts,
        shading_count=int(counts.sum())
    )


def render_scene(
    triangles,
    depths,
    colors,
    *,
    width=48,
    height=None,
    grid=2,
    frequency=0,
    phase=0,
    background=(0.013, 0.019, 0.029)
):
    """同场景的单样本、SSAA、MSAA；后二者共享同一份覆盖与深度结果。

    MSAA 在像素中心求值，即使中心在三角形外也按定义延拓此条纹函数。
    这里不采用 centroid；阴影/BRDF/透视属性可在后续替换 shade。
    返回计数只表示最终可见贡献的必要 shader 求值，并非硬件速度。
    """
    height = width if height is None else height
    colors, background = np.asarray(colors, float), np.asarray(background, float)
    if colors.shape != (len(triangles), 3) or background.shape != (3,):
        raise ValueError("每个三角形需要一个 RGB 颜色，背景需要 RGB")
    if (
        not np.isfinite(colors).all()
        or not np.isfinite(background).all()
        or not np.isfinite([frequency, phase]).all()
    ):
        raise ValueError("颜色、频率与相位必须有限")
    positions = sample_positions(width, height, grid)
    single_positions = sample_positions(width, height, 1)
    centers = single_positions[..., 0, :]
    multi = visibility(triangles, depths, positions)
    single = visibility(triangles, depths, single_positions)
    inputs = (colors, frequency, phase, background)
    return dict(
        center=_shade_visible(single, single_positions, centers, *inputs, False),
        ssaa=_shade_visible(multi, positions, centers, *inputs, False),
        msaa=_shade_visible(multi, positions, centers, *inputs, True),
        positions=positions,
        centers=centers,
        grid=grid,
        triangles=np.asarray(triangles),
        colors=colors,
        background=background,
    )


def demo_scene(offset=0.15, frequency=0, grid=2, resolution=48):
    """三角形交叠、斜边与高频着色共享同一个小场景；offset 单位是像素。"""
    triangles = (
        np.array(
            [
                [[0.08, 0.16], [0.92, 0.23], [0.24, 0.92]],
                [[0.18, 0.11], [0.90, 0.78], [0.48, 0.90]],
                [[0.08, 0.65], [0.93, 0.34], [0.86, 0.64]],
            ]
        )
        * resolution
    )
    triangles += [float(offset), 0]
    depths = np.array([[0.65, 0.65, 0.65], [0.38, 0.38, 0.38], [0.20, 0.20, 0.20]])
    colors = np.array([[0.13, 0.48, 0.95], [0.17, 0.78, 0.48], [0.95, 0.48, 0.13]])
    return render_scene(
        triangles, depths, colors, width=resolution, grid=grid, frequency=frequency
    )
