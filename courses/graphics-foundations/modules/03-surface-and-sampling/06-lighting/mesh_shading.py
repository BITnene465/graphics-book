"""同一网格、覆盖和 Blinn–Phong 模型，只改变计算光照的位置。

Flat 在面心算一次，Gouraud 在顶点算后插值颜色，Phong 插值法线后逐像素算。
正交相机沿 −Z 观察；所有向量在世界空间，输出首行在顶部的线性 RGB。
复用教材中的三个独立算法：04 的裁剪/覆盖、06 的光照、10 的参数网格。
"""

import importlib.util
from pathlib import Path

import numpy as np


def _chapter_file(relative):
    """目录名有连字符；显式加载文件，避免各章同名 core.py 相互覆盖。"""
    path = Path(__file__).resolve().parents[2] / relative
    spec = importlib.util.spec_from_file_location(path.parent.name + path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lighting = _chapter_file("03-surface-and-sampling/06-lighting/core.py")
geometry = _chapter_file("04-shadows-and-geometry/10-geometry/core.py")
raster = _chapter_file("02-rasterization/04-barycentric/raster.py")
BACKGROUND = np.array([0.018, 0.025, 0.032])


def interpolate_normal(weights, normals):
    """先线性插值，再归一化；单位向量的加权和通常不再是单位向量。"""
    interpolated = np.einsum("...i,...ij->...j", weights, normals)
    return lighting.normalize(interpolated)


def rasterize_mesh(
    vertices,
    faces,
    vertex_normals,
    *,
    size=160,
    extent=1.9,
    light=(-3, 4, 5),
    point_light=True,
    power=40.0,
    kd=(0.12, 0.46, 0.27),
    ks=0.35,
    exponent=48.0,
    ambient=0.06,
):
    """正交渲染同一份三角网格，返回三个颜色缓冲和可追溯的样本。

    faces 按外法线绕序；vertex_normals 为世界空间光滑法线。
    三种方法共用一个 owner/weights 深度结果，绝不分别改变网格密度。
    evaluations 是实际交给 shade 的向量样本数，含提交的背面/离屏顶点与面；
    Phong 只处理最终可见像素，不把 NumPy 的批量函数调用数当光照计算量。
    """
    vertices = np.asarray(vertices, float)
    faces = np.asarray(faces)
    vertex_normals = np.asarray(vertex_normals, float)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or not np.isfinite(vertices).all():
        raise ValueError("顶点必须是有限的 (N,3) 数组")
    if (
        faces.ndim != 2
        or faces.shape[1] != 3
        or not np.issubdtype(faces.dtype, np.integer)
    ):
        raise ValueError("三角形必须是 (M,3) 的整数索引")
    if (
        not len(vertices)
        or not len(faces)
        or np.any(faces < 0)
        or np.any(faces >= len(vertices))
    ):
        raise ValueError("需要非空网格和有效顶点索引")
    if vertex_normals.shape != vertices.shape or not np.isfinite(vertex_normals).all():
        raise ValueError("每个顶点必须有一根有限三维法线")
    if np.any(np.linalg.norm(vertex_normals, axis=1) == 0):
        raise ValueError("零法线不能用于光滑着色")
    if not isinstance(size, (int, np.integer)) or not 2 <= size <= 4096:
        raise ValueError("图像边长必须是 2 至 4096 的整数")
    if not np.isfinite(extent) or extent <= 0:
        raise ValueError("正交视野半高必须为正的有限数")
    vertex_normals = lighting.normalize(vertex_normals)
    face_centers, face_normals, _ = geometry.face_geometry(vertices, faces)

    def illuminate(points, normals):
        direction, incoming = lighting.light_at(
            points, light, point_light=point_light, power=power
        )
        return lighting.shade(
            normals,
            direction,
            [0, 0, 1],
            kd=kd,
            ks=ks,
            exponent=exponent,
            ambient=ambient,
            irradiance=incoming,
        )["total"]

    face_colors = illuminate(face_centers, face_normals)
    vertex_colors = illuminate(vertices, vertex_normals)
    owner = np.full((size, size), -1, dtype=int)
    weights = np.zeros((size, size, 3))
    depth = np.full((size, size), -np.inf)

    # z 范围包住整个输入网格；此实验仅用 x/y 裁剪，避免把 z 裁剪混入频率对照。
    z_extent = max(1.0, float(np.abs(vertices[:, 2]).max()) + 1.0)
    clip_vertices = np.column_stack(
        [vertices[:, :2] / extent, -vertices[:, 2] / z_extent, np.ones(len(vertices))]
    )
    for face_id, indices in enumerate(faces):
        # 携带原始重心坐标；即使三角形被裁成多块，探针仍对应原来的三个顶点。
        clipped, basis = raster.clip_triangle(clip_vertices[indices], np.eye(3))
        for triangle, original_weights in zip(clipped, basis):
            screen, _, _ = raster.clip_to_screen(triangle, size, size)
            rows, cols, local_weights = raster.rasterize_triangle(screen, size, size)
            barycentric = local_weights @ original_weights  # 正交投影的 w 恒为 1。
            z = barycentric @ vertices[indices, 2]
            nearer = z > depth[rows, cols]
            rows, cols = rows[nearer], cols[nearer]
            depth[rows, cols] = z[nearer]
            owner[rows, cols] = face_id
            weights[rows, cols] = barycentric[nearer]

    mask = owner >= 0
    selected = faces[owner[mask]]
    w = weights[mask]
    world = np.zeros((size, size, 3))
    normal = np.zeros_like(world)
    world[mask] = np.einsum("ni,nij->nj", w, vertices[selected])
    normal[mask] = interpolate_normal(w, vertex_normals[selected])
    # 对有效外向椭球三角形，插值不会抵消。通用输入也不静默接受无定义方向。
    if np.any(np.linalg.norm(normal[mask], axis=1) == 0):
        raise ValueError("顶点法线在可见样本处相互抵消；无法定义 Phong 法线")
    images = {
        name: np.broadcast_to(BACKGROUND, world.shape).copy()
        for name in ("flat", "gouraud", "phong")
    }
    images["flat"][mask] = face_colors[owner[mask]]
    images["gouraud"][mask] = np.einsum("ni,nij->nj", w, vertex_colors[selected])
    if mask.any():
        images["phong"][mask] = illuminate(world[mask], normal[mask])
    return dict(
        images=images,
        owner=owner,
        weights=weights,
        world=world,
        normal=normal,
        vertices=vertices,
        faces=faces,
        vertex_normals=vertex_normals,
        face_normals=face_normals,
        face_colors=face_colors,
        vertex_colors=vertex_colors,
        extent=float(extent),
        evaluations=dict(flat=len(faces), gouraud=len(vertices), phong=int(mask.sum())),
    )


def render_mesh(
    *,
    size=160,
    scale=(1.3, 0.85, 1),
    center=(0, 0, 0),
    latitude=8,
    longitude=None,
    extent=None,
    light=(-3, 4, 5),
    point_light=True,
    power=40.0,
    kd=(0.12, 0.46, 0.27),
    ks=0.35,
    exponent=48.0,
    ambient=0.06,
):
    """与解析椭球共用半轴、中心、光源和材质；改变分段不会改变着色模型。"""
    scale = geometry.valid_axes(scale)
    center = np.asarray(center, float)
    if center.shape != (3,) or not np.isfinite(center).all():
        raise ValueError("椭球中心必须是有限三维位置")
    longitude = 2 * latitude if longitude is None else longitude
    local, faces = geometry.make_mesh((1, 1, 1), latitude, longitude)
    vertices = local * scale + center
    # 单位球上 n=u；非均匀缩放后必须用 A⁻ᵀ，再归一化。
    normals = lighting.transform_normals(local, np.diag(scale))
    extent = max(1.9, float(scale[:2].max()) * 1.2) if extent is None else extent
    return rasterize_mesh(
        vertices,
        faces,
        normals,
        size=size,
        extent=extent,
        light=light,
        point_light=point_light,
        power=power,
        kd=kd,
        ks=ks,
        exponent=exponent,
        ambient=ambient,
    )


def sample_probe(frame, row, col):
    """读取实际像素的插值链；背景只报告未命中，不伪造表面信息。"""
    height, width = frame["owner"].shape
    if any(not isinstance(value, (int, np.integer)) for value in (row, col)):
        raise ValueError("探针使用整数像素行列")
    if not (0 <= row < height and 0 <= col < width):
        raise ValueError("探针不在图像内")
    face = int(frame["owner"][row, col])
    if face < 0:
        return dict(hit=False, row=int(row), col=int(col))
    indices = frame["faces"][face]
    weights = frame["weights"][row, col]
    normals = frame["vertex_normals"][indices]
    mixed = weights @ normals
    return dict(
        hit=True,
        row=int(row),
        col=int(col),
        face=face,
        vertex_indices=indices.tolist(),
        weights=weights.tolist(),
        world=frame["world"][row, col].tolist(),
        vertex_normals=normals.tolist(),
        face_normal=frame["face_normals"][face].tolist(),
        interpolated_normal=mixed.tolist(),
        interpolated_length=float(np.linalg.norm(mixed)),
        normal=frame["normal"][row, col].tolist(),
        vertex_colors=frame["vertex_colors"][indices].tolist(),
        colors={
            name: image[row, col].tolist() for name, image in frame["images"].items()
        },
        evaluations=frame["evaluations"],
    )
