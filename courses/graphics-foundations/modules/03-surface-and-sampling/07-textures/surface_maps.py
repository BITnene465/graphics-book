"""同一高度函数：只改着色法线，或真的移动三角网格的顶点。

只复用本书 03 相机、04 裁剪/覆盖、06 光照与 07 透视插值。
右手系；模型平面为 XY；v 向上；图像首行在顶部；颜色为线性 RGB。
"""

import importlib.util
from pathlib import Path

import numpy as np


def _load(relative):
    path = Path(__file__).resolve().parents[2] / relative
    spec = importlib.util.spec_from_file_location(path.parent.name + path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


camera = _load("01-images-and-space/03-camera/core.py")
raster = _load("02-rasterization/04-barycentric/raster.py")
lighting = _load("03-surface-and-sampling/06-lighting/core.py")
texture = _load("03-surface-and-sampling/07-textures/core.py")
LENGTHS = np.array([2.4, 1.8])
BACKGROUND = np.array([0.018, 0.025, 0.032])


def height_field(uv, amplitude=0.25, frequency=1.5, offset=0.0):
    """程序纹理 h=h0+A cos(2πfu)cos(2πfv)，返回高度与 UV 偏导。"""
    uv = np.asarray(uv, float)
    if uv.shape[-1:] != (2,) or not np.isfinite(uv).all():
        raise ValueError("UV 必须是有限的 (...,2) 数组")
    if not np.isfinite([amplitude, frequency, offset]).all() or frequency < 0:
        raise ValueError("高度参数须有限，频率须非负")
    u, v = np.moveaxis(uv, -1, 0) * (2 * np.pi * frequency)
    k = amplitude * 2 * np.pi * frequency
    return (
        offset + amplitude * np.cos(u) * np.cos(v),
        -k * np.sin(u) * np.cos(v),
        -k * np.cos(u) * np.sin(v),
    )


def tangent_frame(dpdu, dpdv):
    """T 沿 p_u，B 沿 p_v 去掉 T 分量后的方向，N=T×B；拒绝退化参数化。"""
    dpdu, dpdv = np.asarray(dpdu, float), np.asarray(dpdv, float)
    if any(a.shape != (3,) or not np.isfinite(a).all() for a in (dpdu, dpdv)):
        raise ValueError("切向量必须是有限三维向量")
    # 先单位化，让退化判断只取决于夹角，并避免极大/极小长度导致溢出或下溢。
    tangent, v_direction = lighting.normalize(np.stack([dpdu, dpdv]))
    cross = np.cross(tangent, v_direction)
    if np.linalg.norm(cross) < 1e-12:
        raise ValueError("平行或零切向量不能定义框架")
    normal = cross / np.linalg.norm(cross)
    return np.column_stack([tangent, np.cross(normal, tangent), normal])


def height_normal(du, dv):
    """UV 偏导除以模型平面的实际宽高；仅适用于本例的正交平面参数化。"""
    du, dv = np.broadcast_arrays(du, dv)
    return lighting.normalize(
        np.stack([-du / LENGTHS[0], -dv / LENGTHS[1], np.ones_like(du)], axis=-1)
    )


def decode_normal(encoded, frame=None):
    """数据纹理直接从 [0,1] 解码；不做 sRGB 转换。正 Y 指向局部 B。"""
    encoded = np.asarray(encoded, float)
    if (
        encoded.shape[-1:] != (3,)
        or not np.isfinite(encoded).all()
        or np.any((encoded < 0) | (encoded > 1))
    ):
        raise ValueError("法线编码必须是 [0,1] 内的有限三分量")
    normal = 2 * encoded - 1
    if np.any(np.linalg.norm(normal, axis=-1) <= 1e-12):
        raise ValueError("[.5,.5,.5] 没有法线方向")
    normal = lighting.normalize(normal)
    if frame is not None:
        frame = np.asarray(frame, float)
        if (
            frame.shape != (3, 3)
            or not np.isfinite(frame).all()
            or not np.allclose(frame.T @ frame, np.eye(3), atol=1e-10, rtol=0)
            or np.linalg.det(frame) < 0
        ):
            raise ValueError("切线框架必须是右手正交矩阵")
        normal = normal @ frame.T
    return normal


def surface_sample(uv, amplitude=0.25, frequency=1.5, offset=0.0):
    """同一 UV 的高度、UV 偏导、单位法线及法线贴图数据。"""
    h, du, dv = height_field(uv, amplitude, frequency, offset)
    n = height_normal(du, dv)
    return dict(height=h, du=du, dv=dv, normal=n, encoded=(n + 1) / 2)


def grid_mesh(divisions, heights=None):
    """固定索引拓扑；位移只改变 z，绝不重用平面的可见性缓冲。"""
    if not isinstance(divisions, (int, np.integer)) or not 1 <= divisions <= 64:
        raise ValueError("网格分段须是 1..64 的整数")
    u, v = np.meshgrid(
        np.linspace(0, 1, divisions + 1), np.linspace(0, 1, divisions + 1)
    )
    uv = np.column_stack([u.ravel(), v.ravel()])
    z = np.zeros(len(uv)) if heights is None else np.asarray(heights, float)
    if z.shape != (len(uv),) or not np.isfinite(z).all():
        raise ValueError("每个顶点需要一个有限高度")
    vertices = np.column_stack([(uv - 0.5) * LENGTHS, z])
    first = (
        np.arange(divisions)[:, None] * (divisions + 1) + np.arange(divisions)
    ).ravel()
    faces = np.stack(
        [
            np.column_stack([first, first + 1, first + divisions + 2]),
            np.column_stack([first, first + divisions + 2, first + divisions + 1]),
        ],
        axis=1,
    ).reshape(-1, 3)
    return vertices, faces, uv


def _geometry(vertices, faces, uv, linear, position, view, projection, size):
    """先求最终可见样本；携带原三角形权重穿过裁剪与透视插值。"""
    world_vertices = vertices @ linear.T + position
    clip_vertices = camera.transform_points(world_vertices, view) @ projection.T
    owner = np.full((size, size), -1, int)
    depth = np.full((size, size), np.inf)
    weights = np.zeros((size, size, 3))
    world = np.zeros_like(weights)
    uv_buffer = np.zeros((size, size, 2))
    clipped_count = 0
    for face_id, face in enumerate(faces):
        attrs = np.column_stack([world_vertices[face], uv[face], np.eye(3)])
        triangles, attributes = raster.clip_triangle(clip_vertices[face], attrs)
        clipped_count += len(triangles)
        for triangle, attr in zip(triangles, attributes):
            xy, ndc_z, inv_w = raster.clip_to_screen(triangle, size, size)
            rows, cols, bary = raster.rasterize_triangle(xy, size, size)
            candidate = (bary @ ndc_z + 1) / 2
            passing = candidate < depth[rows, cols]
            r, c = rows[passing], cols[passing]
            value = texture.perspective_interpolate(bary[passing], attr, inv_w)
            owner[r, c] = face_id
            depth[r, c] = candidate[passing]
            world[r, c], uv_buffer[r, c], weights[r, c] = np.split(
                value, [3, 5], axis=1
            )
    return dict(
        owner=owner,
        depth=depth,
        weights=weights,
        world=world,
        uv=uv_buffer,
        vertices=world_vertices,
        local_vertices=vertices,
        faces=faces,
        vertex_uv=uv,
        clip_vertices=clip_vertices,
        clipped_triangles=clipped_count,
    )


def _shade(geometry, *, perturb, amplitude, frequency, offset, linear, light, eye):
    mask = geometry["owner"] >= 0
    normal = np.zeros_like(geometry["world"])
    if perturb:
        h, du, dv = height_field(geometry["uv"][mask], amplitude, frequency, offset)
        local_normal = height_normal(du, dv)
    else:
        local_normal = np.broadcast_to([0.0, 0.0, 1.0], (int(mask.sum()), 3))
    normal[mask] = lighting.transform_normals(local_normal, linear)
    image = np.broadcast_to(BACKGROUND, normal.shape).copy()
    delta = light - geometry["world"][mask]
    distance2 = np.maximum(np.sum(delta * delta, axis=-1), 0.01)
    image[mask] = lighting.shade(
        normal[mask],
        delta,
        eye - geometry["world"][mask],
        kd=(0.13, 0.48, 0.32),
        ks=0.2,
        exponent=48,
        ambient=0.07,
        irradiance=35 / distance2,
    )["total"]
    return {**geometry, "image": image, "normal": normal}


def render_surface_maps(
    *,
    size=160,
    amplitude=0.25,
    frequency=1.5,
    divisions=16,
    light=(-3, 3, 5),
    eye=(3, 2, 5),
    target=(0, 0, 0),
    near=0.1,
    far=30,
    fov=38,
    linear=None,
    position=(0, 0, 0),
    offset=0.0
):
    """三种结果只改变法线/几何；同一相机、材质、光源、网格分段。

    bump 与 flat 共用 owner/depth/world/uv/weights；displacement 独立光栅化。
    两种扰动都在最终 UV 计算连续高度场的解析着色法线，以隔离几何变化。
    因此粗位移网格的光滑法线不是三角面法线；轮廓仍严格由采样顶点决定。
    本例没有阴影射线，不将凹槽变暗称作自阴影。
    """
    if not isinstance(size, (int, np.integer)) or not 8 <= size <= 1024:
        raise ValueError("图像边长须是 8..1024 的整数")
    linear = np.eye(3) if linear is None else np.asarray(linear, float)
    if (
        linear.shape != (3, 3)
        or not np.isfinite(linear).all()
        or abs(np.linalg.det(linear)) < 1e-10
    ):
        raise ValueError("模型线性变换必须有限且可逆")
    light, eye, position = map(lambda a: np.asarray(a, float), (light, eye, position))
    if any(a.shape != (3,) or not np.isfinite(a).all() for a in (light, eye, position)):
        raise ValueError("光源、相机和位置须为有限三维值")
    if (
        not np.isfinite([amplitude, frequency, offset]).all()
        or abs(amplitude) > 2
        or abs(offset) > 2
        or not 0 <= frequency <= 32
    ):
        raise ValueError("幅值/偏置绝对值不超过 2，频率为 0..32")
    view, projection = camera.look_at(eye, target), camera.perspective(
        fov, 1, near, far
    )
    vertices, faces, uv = grid_mesh(divisions)
    heights = height_field(uv, amplitude, frequency, offset)[0]
    displaced = vertices.copy()
    displaced[:, 2] = heights
    base = _geometry(vertices, faces, uv, linear, position, view, projection, size)
    moved = _geometry(displaced, faces, uv, linear, position, view, projection, size)
    settings = dict(
        amplitude=amplitude,
        frequency=frequency,
        offset=offset,
        linear=linear,
        light=light,
        eye=eye,
    )
    frames = {
        "flat": _shade(base, perturb=False, **settings),
        "bump": _shade(base, perturb=True, **settings),
        "displacement": _shade(moved, perturb=True, **settings),
    }
    return dict(
        frames=frames,
        images={name: frame["image"] for name, frame in frames.items()},
        view=view,
        projection=projection,
        settings=settings,
    )


def relight_surface_maps(frame, light):
    """只拖光源时复用几何缓冲；正式颜色仍逐像素由同一个 Python 函数计算。"""
    light = np.asarray(light, float)
    if light.shape != (3,) or not np.isfinite(light).all():
        raise ValueError("光源须为有限三维坐标")
    settings = {**frame["settings"], "light": light}
    frames = {
        name: _shade(geometry, perturb=name != "flat", **settings)
        for name, geometry in frame["frames"].items()
    }
    return {
        **frame,
        "settings": settings,
        "frames": frames,
        "images": {name: value["image"] for name, value in frames.items()},
    }
