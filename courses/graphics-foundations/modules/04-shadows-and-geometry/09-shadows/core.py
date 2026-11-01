"""两次普通 Python 栅格化：先从光看最近深度，再从相机看并查询光的可见性。"""

import importlib.util
from pathlib import Path

import numpy as np


def _load(name, relative_path):
    path = Path(__file__).resolve().parents[2] / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_raster = _load("shadow_raster", "02-rasterization/04-barycentric/raster.py")
_camera = _load("shadow_camera", "01-images-and-space/03-camera/core.py")


def scene_geometry():
    """地面 2 个三角形 + 立方柱 12 个三角形；返回世界顶点和线性 RGB 材质。"""
    ground = np.array([[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], float)
    h, top = .55, 1.6
    box = np.array([[-h, 0, -h], [h, 0, -h], [h, top, -h], [-h, top, -h],
                    [-h, 0, h], [h, 0, h], [h, top, h], [-h, top, h]], float)
    faces = [(0, 3, 2), (0, 2, 1), (4, 5, 6), (4, 6, 7),
             (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5),
             (3, 7, 6), (3, 6, 2), (0, 1, 5), (0, 5, 4)]
    triangles = np.concatenate((ground[[[0, 2, 1], [0, 3, 2]]], box[faces]))
    colors = np.array([[.53, .58, .45]]*2 + [[.63, .25, .10]]*12)
    return triangles, colors


def scene_matrices(light_eye=(-3, 6, -2), light_extent=8, light_target=(0,0,0)):
    """主相机透视；平行光采用正交光源相机，其位置指向世界原点定义方向。

    光相机固定参考 up=(0,0,-1)，允许 light_eye=(0,height,0) 的垂直照射。
    光的位置控制朝向与取样体积，不是带平方反比衰减的点光源。
    """
    eye = np.asarray(light_eye, float)
    if eye.shape != (3,) or not np.isfinite(eye).all() or eye[1] <= 0:
        raise ValueError("光源观察位置必须有限，且位于地面上方")
    if not np.isfinite(light_extent) or light_extent <= 0:
        raise ValueError("光空间窗口高度必须为正数")
    view = _camera.look_at([6, 5, 7], [0, .55, 0])
    camera_vp = _camera.perspective(48, 1, .3, 25) @ view
    light_view = _camera.look_at(eye, light_target, [0, 0, -1])
    light_vp = _camera.orthographic(light_extent, 1, .1, 20) @ light_view
    return camera_vp, light_vp


def rasterize_world(triangles, view_projection, size):
    """最近表面 → depth/world/normal/owner；相机与光源共用这一个栅格器。

    深度线性插值 z_ndc；世界位置是普通属性，必须做透视正确插值。
    世界位置在齐次裁剪产生交点时也按同一个 t 更新。
    """
    triangles = np.asarray(triangles, float)
    matrix = np.asarray(view_projection, float)
    if triangles.ndim != 3 or triangles.shape[1:] != (3, 3) or not np.isfinite(triangles).all():
        raise ValueError("需要有限的 (T,3,3) 世界三角形")
    if matrix.shape != (4, 4) or not np.isfinite(matrix).all():
        raise ValueError("需要有限的 (4,4) 观察投影矩阵")
    if not isinstance(size, (int, np.integer)) or not 1 <= size <= 2048:
        raise ValueError("教学栅格分辨率需为 1 至 2048 的整数")
    depth = np.full((size, size), np.inf)
    world = np.full((size, size, 3), np.nan)
    normal = np.zeros((size, size, 3))
    owner = np.full((size, size), -1, dtype=int)
    for index, triangle in enumerate(triangles):
        n = np.cross(triangle[1]-triangle[0], triangle[2]-triangle[0])
        length = np.linalg.norm(n)
        if length == 0:
            continue
        n = n / length
        clip = _camera.transform_points(triangle, matrix)
        pieces, positions = _raster.clip_triangle(clip, triangle)
        for piece, attributes in zip(pieces, positions):
            xy, z_ndc, inv_w = _raster.clip_to_screen(piece, size, size)
            rows, cols, weights = _raster.rasterize_triangle(xy, size, size)
            candidate = np.clip((weights @ z_ndc + 1)/2, 0, 1)
            passed = candidate < depth[rows, cols]
            r, c, lam = rows[passed], cols[passed], weights[passed]
            depth[r, c], owner[r, c], normal[r, c] = candidate[passed], index, n
            world[r, c] = (lam @ (attributes * inv_w[:, None])) / (lam @ inv_w)[:, None]
    return dict(depth=depth, world=world, normal=normal, owner=owner)


def pcf_visibility(current_depth, stored_depths, bias=0):
    """先逐项比较，再平均二值结果；stored_depths 的最后一维为邻域样本。

    current-bias <= stored 表示可见；正 bias 增加可见性。
    stored=+∞ 表示该光线未记录遮挡物，因此比较通过。
    """
    current, stored = np.asarray(current_depth, float), np.asarray(stored_depths, float)
    if not np.isfinite(current).all() or np.isnan(stored).any() or np.isneginf(stored).any():
        raise ValueError("比较深度必须有限；存储深度仅允许额外的 +∞ 背景")
    if not np.isfinite(bias) or bias < 0 or stored.ndim == 0 or stored.shape[-1] == 0:
        raise ValueError("bias 必须非负，PCF 至少含一个样本")
    return np.mean(current[..., None]-bias <= stored, axis=-1)


def shadow_query(points, light_vp, shadow_depth, bias=.004, radius=0):
    """世界点 → 光空间及可见率。光裁剪体外和越界 PCF tap 明确按可见处理。

    uv 原点在纹理左上；uv=1 的边界映射到最后一个 texel。
    radius 0/1/2 对应 1/9/25 次 nearest-texel 比较，没有先滤深度。
    """
    points, shadow_depth = np.asarray(points, float), np.asarray(shadow_depth, float)
    if shadow_depth.ndim != 2 or min(shadow_depth.shape) < 1 or np.isnan(shadow_depth).any() or np.isneginf(shadow_depth).any():
        raise ValueError("阴影图需要非空二维深度数组，背景允许 +∞")
    if not isinstance(radius, (int, np.integer)) or not 0 <= radius <= 2:
        raise ValueError("PCF radius 需为 0、1 或 2")
    if not np.isfinite(bias) or bias < 0:
        raise ValueError("bias 必须为非负有限数值")
    clip = _camera.transform_points(points, light_vp)
    ndc = np.full((len(points), 3), np.nan)
    positive = clip[:, 3] > 0
    ndc[positive] = clip[positive, :3] / clip[positive, 3, None]
    inside = positive & np.all(np.abs(ndc) <= 1, axis=1)
    uv = np.column_stack(((ndc[:, 0]+1)/2, (1-ndc[:, 1])/2))
    current = (ndc[:, 2]+1)/2
    visibility = np.ones(len(points))
    rows, cols = np.full(len(points), -1), np.full(len(points), -1)
    samples = np.full((len(points), (2*radius+1)**2), np.inf)
    height, width = shadow_depth.shape
    ids = np.flatnonzero(inside)
    rows[ids] = np.clip(np.floor(uv[ids, 1]*height).astype(int), 0, height-1)
    cols[ids] = np.clip(np.floor(uv[ids, 0]*width).astype(int), 0, width-1)
    tap = 0
    for dy in range(-radius, radius+1):
        for dx in range(-radius, radius+1):
            r, c = rows[ids]+dy, cols[ids]+dx
            valid = (r >= 0) & (r < height) & (c >= 0) & (c < width)
            samples[ids[valid], tap] = shadow_depth[r[valid], c[valid]]
            tap += 1
    visibility[ids] = pcf_visibility(current[ids], samples[ids], bias)
    return dict(clip=clip, uv=uv, current=current, inside=inside, rows=rows, cols=cols,
                samples=samples, visibility=visibility, stored=samples[:, samples.shape[1]//2])


def render_scene(size=96, shadow_size=96, light_eye=(-3, 6, -2), bias=.004, radius=0, light_extent=8, *, triangles=None, materials=None, light_target=(0,0,0)):
    """真正两次渲染；返回主相机颜色、光源深度、可见率和逐像素检查数据。"""
    if triangles is None:
        triangles, materials = scene_geometry()
    camera_vp, light_vp = scene_matrices(light_eye, light_extent, light_target)
    light = rasterize_world(triangles, light_vp, shadow_size)       # 第一遍：光看到谁。
    camera = rasterize_world(triangles, camera_vp, size)            # 第二遍：相机看到谁。
    valid = camera['owner'] >= 0
    query = shadow_query(camera['world'][valid], light_vp, light['depth'], bias, radius)
    visibility = np.full((size, size), np.nan)
    visibility[valid] = query['visibility']
    light_inside = np.zeros((size, size), dtype=bool)
    light_inside[valid] = query['inside']
    direction = np.asarray(light_eye, float)-np.asarray(light_target,float)
    direction /= np.linalg.norm(direction)
    diffuse = np.maximum(camera['normal'][valid] @ direction, 0)
    base = materials[camera['owner'][valid]].copy()
    ground = camera['owner'][valid] < 2
    points = camera['world'][valid]
    checkers = (np.floor(points[:, 0]) + np.floor(points[:, 2])).astype(int) % 2 == 0
    base[ground & checkers] *= .78
    color = np.full((size, size, 3), [.90, .93, .88])
    color[valid] = base * (.16 + .84 * diffuse * query['visibility'])[:, None]
    hard = shadow_query(points, light_vp, light['depth'], bias, 0)['visibility']
    hard_visibility = np.full((size, size), np.nan)
    hard_visibility[valid] = hard
    hard_color = color.copy()
    hard_color[valid] = base * (.16 + .84 * diffuse * hard)[:, None]
    return dict(color=color, hard_color=hard_color, camera=camera, shadow_depth=light['depth'],
                visibility=visibility, hard_visibility=hard_visibility, light_inside=light_inside,
                light_vp=light_vp, light=light)
