"""逐像素比较深度。覆盖与齐次裁剪直接复用第 04 章的普通函数。"""

import importlib.util
from pathlib import Path

import numpy as np

_path = Path(__file__).resolve().parent.parent / "04-barycentric" / "raster.py"
_spec = importlib.util.spec_from_file_location("depth_raster", _path)
_raster = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_raster)


def _volume(near, far):
    if not np.isfinite([near, far]).all() or not 0 < near < far:
        raise ValueError("要求有限的 0 < near < far")


def depth_from_distance(distance, near, far):
    """正的相机轴向距离 d → 深度 D；near→0，far→1。保留越界值供裁剪。"""
    _volume(near, far)
    distance = np.asarray(distance, float)
    if not np.isfinite(distance).all() or np.any(distance <= 0):
        raise ValueError("相机前方距离必须为正的有限数值")
    return far / (far - near) - far * near / ((far - near) * distance)


def distance_from_depth(depth, near, far):
    """深度 D∈[0,1] → 正的相机轴向距离；不是到相机的欧氏距离。"""
    _volume(near, far)
    depth = np.asarray(depth, float)
    if not np.isfinite(depth).all() or np.any((depth < 0) | (depth > 1)):
        raise ValueError("深度必须在 [0, 1] 内")
    return far * near / (far - (far - near) * depth)


def clip_vertices(ndc_xy, distances, near, far):
    """构造教学场景：固定投影 x/y，同时让三个顶点分别处于给定深度。

    这相当于沿三条相机射线放置顶点。改变 distances 会改变三维三角形，
    而不改变裁剪前的二维轮廓；正好隔离遮挡因素，不能误当成刚体平移。
    """
    xy, d = np.asarray(ndc_xy, float), np.asarray(distances, float)
    if xy.shape != (3, 2) or d.shape != (3,) or not np.isfinite(xy).all():
        raise ValueError("需要 (3,2) NDC xy 与三个正距离")
    z_ndc = 2 * depth_from_distance(d, near, far) - 1
    return np.column_stack((xy * d[:, None], z_ndc * d, d))


def interpolate_depth(weights, vertex_z_ndc):
    """屏幕重心权重插值已除过 w 的 z_ndc；不要再做普通属性的透视校正。"""
    return (np.asarray(weights, float) @ np.asarray(vertex_z_ndc, float) + 1) / 2


def quantize_depth(depth, bits):
    """教学用均匀定点深度；bits=None 保留 float64，绝非完整 GPU 仿真。"""
    depth = np.asarray(depth, float)
    if bits is None:
        return depth.copy()
    if not isinstance(bits, (int, np.integer)) or not 1 <= bits <= 32:
        raise ValueError("定点深度位数需要为 1 至 32 的整数")
    levels = 2**bits - 1
    return np.rint(depth * levels) / levels


def candidate_depths(triangles_clip, width, height):
    """每个原三角形在每个像素的候选深度 (T,H,W)；不覆盖记为 +∞。"""
    triangles = np.asarray(triangles_clip, float)
    if triangles.ndim != 3 or triangles.shape[1:] != (3, 4) or not np.isfinite(triangles).all():
        raise ValueError("三角形需要有限的 (T,3,4) clip 坐标")
    if any(not isinstance(n, (int, np.integer)) or not 1 <= n <= 4096 for n in (width, height)):
        raise ValueError("图像宽高必须为 1 至 4096 的整数")
    candidates = np.full((len(triangles), height, width), np.inf)
    for index, triangle in enumerate(triangles):
        clipped, _ = _raster.clip_triangle(triangle)
        for piece in clipped:
            xy, z_ndc, _ = _raster.clip_to_screen(piece, width, height)
            rows, cols, weights = _raster.rasterize_triangle(xy, width, height)
            depths = np.clip(interpolate_depth(weights, z_ndc), 0, 1)
            candidates[index, rows, cols] = np.minimum(candidates[index, rows, cols], depths)
    return candidates


def render(triangles_clip, colors, width, height, order=None, method="zbuffer", bits=None):
    """→ dict(color, depth, owner, candidates, stored_candidates, order)。

    color 在线性 RGB 中；owner=-1 表示背景。严格 <：相同存储深度先画者赢。
    method='painter' 故意按整面平均 NDC 深度排序，再不做逐像素测试地覆盖。
    该简化画家法用于反例；完整画家算法还可能需要切分相交图元。
    """
    triangles, colors = np.asarray(triangles_clip, float), np.asarray(colors, float)
    candidates = candidate_depths(triangles, width, height)
    count = len(triangles)
    if colors.shape != (count, 3) or not np.isfinite(colors).all() or np.any((colors < 0) | (colors > 1)):
        raise ValueError("颜色需要每三角形一个 [0,1] 线性 RGB")
    order = list(range(count)) if order is None else list(order)
    if sorted(order) != list(range(count)):
        raise ValueError("绘制顺序必须恰含每个三角形索引一次")
    if method not in ("zbuffer", "painter"):
        raise ValueError("method 必须为 zbuffer 或 painter")
    if method == "painter":
        if np.any(triangles[:, :, 3] <= 0):
            raise ValueError("简化平均深度画家法要求原顶点 w>0")
        averages = np.mean(triangles[:, :, 2] / triangles[:, :, 3], axis=1)
        order = sorted(order, key=lambda index: -averages[index])
    stored = quantize_depth(candidates, bits)
    depth = np.full((height, width), np.inf)
    owner = np.full((height, width), -1, dtype=int)
    color = np.full((height, width, 3), .94)
    for index in order:
        covered = np.isfinite(stored[index])
        passed = covered & (stored[index] < depth) if method == "zbuffer" else covered
        depth[passed], owner[passed], color[passed] = stored[index][passed], index, colors[index]
    return dict(color=color, depth=depth, owner=owner, candidates=candidates,
                stored_candidates=stored, order=order)
