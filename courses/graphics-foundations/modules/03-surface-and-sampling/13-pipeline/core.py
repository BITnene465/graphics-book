"""一条可逐阶段检查的 Python 光栅管线，复用本书已解释的普通函数。

列向量；右手世界；相机看 −Z；NDC 深度 [-1,1]；数组首行在顶部。
颜色在线性 RGB 中计算。此文件不含 HTTP、界面或 GPU 代码。
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
BACKGROUND = np.array([0.018, 0.025, 0.032])


def grid_scene(divisions=8):
    """前方网格与后方矩形共享同一顶点阶段，制造可检查的重叠。"""
    if not isinstance(divisions, (int, np.integer)) or not 1 <= divisions <= 32:
        raise ValueError("分段须为 1..32 的整数")
    u, v = np.meshgrid(
        np.linspace(0, 1, divisions + 1), np.linspace(0, 1, divisions + 1)
    )
    uv = np.column_stack([u.ravel(), v.ravel()])
    vertices = np.column_stack(
        [2.4 * uv[:, 0] - 1.2, 1.8 * uv[:, 1] - 0.9, np.zeros(len(uv))]
    )
    faces = []
    for row in range(divisions):
        for col in range(divisions):
            a = row * (divisions + 1) + col
            b = a + 1
            c = a + divisions + 1
            d = c + 1
            faces.extend([[a, b, d], [a, d, c]])
    count = len(vertices)
    rear = np.array(
        [
            [-1.1, -1.05, -0.65],
            [1.5, -1.05, -0.65],
            [1.5, 1.1, -0.65],
            [-1.1, 1.1, -0.65],
        ]
    )
    return dict(
        vertices=np.vstack([vertices, rear]),
        faces=np.array(
            faces + [[count, count + 1, count + 2], [count, count + 2, count + 3]]
        ),
        uv=np.vstack([uv, [[0, 0], [1, 0], [1, 1], [0, 1]]]),
        deform=np.r_[np.ones(count), np.zeros(4)],
        tint=np.vstack(
            [
                np.tile([0.18, 0.62, 0.42], (count, 1)),
                np.tile([0.75, 0.25, 0.08], (4, 1)),
            ]
        ),
    )


def model_matrix(position=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    """M=T Rx Ry Rz S，角度为度；右侧变换先执行。"""
    position, rotation, scale = map(
        lambda a: np.asarray(a, float), (position, rotation, scale)
    )
    if any(
        a.shape != (3,) or not np.isfinite(a).all() for a in (position, rotation, scale)
    ) or np.any(scale <= 0):
        raise ValueError("TRS 为有限三维量，缩放须正")
    x, y, z = np.deg2rad(rotation)
    cx, cy, cz = np.cos([x, y, z])
    sx, sy, sz = np.sin([x, y, z])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    result = np.eye(4)
    result[:3, :3] = rx @ ry @ rz @ np.diag(scale)
    result[:3, 3] = position
    return result


def vertex_stage(scene, model, view, projection, wave=0):
    """短小的顶点程序：先修改模型位置/法线，再逐个坐标空间变换。"""
    if not np.isfinite(wave) or abs(wave) > 2:
        raise ValueError("波幅须在 [-2,2]")
    local = np.asarray(scene["vertices"], float).copy()
    x, y = local[:, :2].T
    amplitude = wave * np.asarray(scene["deform"])
    local[:, 2] += amplitude * np.sin(np.pi * x) * np.cos(np.pi * y)
    dzdx = amplitude * np.pi * np.cos(np.pi * x) * np.cos(np.pi * y)
    dzdy = -amplitude * np.pi * np.sin(np.pi * x) * np.sin(np.pi * y)
    normals = lighting.transform_normals(
        np.column_stack([-dzdx, -dzdy, np.ones(len(local))]), np.asarray(model)[:3, :3]
    )
    world_h = camera.transform_points(local, model)
    view_h = world_h @ np.asarray(view).T
    clip = view_h @ np.asarray(projection).T
    return dict(
        local=local,
        world=world_h[:, :3],
        view=view_h[:, :3],
        clip=clip,
        normal=normals,
        uv=np.asarray(scene["uv"]),
        tint=np.asarray(scene["tint"]),
    )


def fragment_stage(world, normal, uv, tint, eye, light, mode="lit"):
    """插值后的属性 → 线性 RGB。可单独修改的第二个短 Python 程序。"""
    normal = lighting.normalize(normal)
    if mode == "uv":
        return np.column_stack([uv, np.zeros(len(uv))])
    if mode == "normal":
        return (normal + 1) / 2
    if mode not in ("lit", "checker"):
        raise ValueError("片元程序须为 lit、checker、uv 或 normal")
    base = np.asarray(tint).copy()
    if mode == "checker":
        parity = np.sum(np.floor(np.asarray(uv) * 8).astype(int), axis=1) % 2
        base *= np.where(parity == 0, 1.0, 0.16)[:, None]
    # 零距离点光没有定义；显式有限半径夹取是此教学模型的约定。
    delta = np.asarray(light) - world
    distance2 = np.maximum(np.sum(delta * delta, axis=1), 0.01)
    parts = lighting.shade(
        normal,
        delta,
        np.asarray(eye) - world,
        kd=(1, 1, 1),
        ks=0.15,
        exponent=48,
        ambient=0.06,
        irradiance=30 / distance2,
    )
    return base * (parts["diffuse"] + parts["ambient"]) + parts["specular"]


def interpolate_depth(weights, z_ndc):
    """屏幕重心权重插值 NDC z，再从 [-1,1] 映射到 [0,1]。

    显式保持三项的求和顺序，让批量成像和单像素回溯使用完全相同的运算。
    两处分别使用矩阵乘法和向量点积时，BLAS 可能采用不同的求和顺序；
    近等深度会因此在严格的小于比较中产生不同赢家。这里不添加 epsilon。
    """
    weights, z_ndc = np.asarray(weights), np.asarray(z_ndc)
    value = weights[..., 0] * z_ndc[0]
    value = value + weights[..., 1] * z_ndc[1]
    value = value + weights[..., 2] * z_ndc[2]
    return (value + 1) / 2


def render_frame(
    *,
    size=160,
    divisions=8,
    wave=0.2,
    position=(0, 0, 0),
    rotation=(0, 0, 0),
    scale=(1, 1, 1),
    eye=(3, 2, 5),
    target=(0, 0, 0),
    up=(0, 1, 0),
    fov=48,
    near=0.1,
    far=40,
    light=(-3, 4, 5),
    mode="checker",
    depth_test=True,
    cull=False,
    reverse=False,
    early_depth=True
):
    """顶点 → 齐次裁剪 → 覆盖/插值 → 片元 → 深度写入。

    early_depth=True 时先做深度测试再求颜色；此片元函数不修改深度或丢弃片元。
    False 用于公平检查早期测试减少求值但不改变结果，绝不把早期测试当作所有
    GPU 程序都能采用的固定顺序。保留每块裁剪几何及原顶点权重供像素回溯。
    """
    if not isinstance(size, (int, np.integer)) or not 8 <= size <= 2048:
        raise ValueError("图像边长须为 8..2048 的整数")
    scene = grid_scene(divisions)
    model = model_matrix(position, rotation, scale)
    view = camera.look_at(eye, target, up)
    projection = camera.perspective(fov, 1, near, far)
    vertices = vertex_stage(scene, model, view, projection, wave)
    image = np.full((size, size, 3), BACKGROUND)
    depth = np.full((size, size), np.inf)
    owner = np.full((size, size), -1, int)
    overdraw = np.zeros((size, size), int)
    uv_buffer = np.zeros((size, size, 2))
    normals = np.zeros((size, size, 3))
    world = np.zeros_like(normals)
    weights_buffer = np.zeros_like(normals)
    pieces = []
    stats = dict(
        vertices=len(scene["vertices"]),
        triangles=len(scene["faces"]),
        clipped_triangles=0,
        culled_triangles=0,
        covered_samples=0,
        shaded_samples=0,
        depth_writes=0,
    )
    sequence = (
        np.arange(len(scene["faces"]))[::-1]
        if reverse
        else np.arange(len(scene["faces"]))
    )
    for face_id in sequence:
        face = scene["faces"][face_id]
        attrs = np.column_stack(
            [vertices[k][face] for k in ("world", "normal", "uv", "tint")] + [np.eye(3)]
        )
        clipped, attributes = raster.clip_triangle(vertices["clip"][face], attrs)
        stats["clipped_triangles"] += len(clipped)
        for clip, attr in zip(clipped, attributes):
            xy, z, inv_w = raster.clip_to_screen(clip, size, size)
            if cull and raster.edge_function(xy[0], xy[1], xy[2]) <= 0:
                stats["culled_triangles"] += 1
                continue
            rows, cols, weights = raster.rasterize_triangle(xy, size, size)
            pieces.append(
                dict(
                    face=int(face_id),
                    clip=clip,
                    xy=xy,
                    z=z,
                    inv_w=inv_w,
                    attributes=attr,
                )
            )
            stats["covered_samples"] += len(rows)
            overdraw[rows, cols] += 1
            candidate = interpolate_depth(weights, z)
            passing = (
                candidate < depth[rows, cols]
                if depth_test
                else np.ones(len(rows), bool)
            )
            active = passing if early_depth else np.ones(len(rows), bool)
            if not np.any(active):
                continue
            interpolated = texture.perspective_interpolate(weights[active], attr, inv_w)
            points, n, uv, tint, original = np.split(
                interpolated, [3, 6, 8, 11], axis=1
            )
            color = fragment_stage(points, n, uv, tint, eye, light, mode)
            stats["shaded_samples"] += len(color)
            keep = np.ones(len(color), bool) if early_depth else passing
            r, c = rows[passing], cols[passing]
            image[r, c] = color[keep]
            depth[r, c] = candidate[passing]
            owner[r, c] = face_id
            world[r, c] = points[keep]
            normals[r, c] = lighting.normalize(n[keep])
            uv_buffer[r, c] = uv[keep]
            weights_buffer[r, c] = original[keep]
            stats["depth_writes"] += len(r)
    stats["visible_pixels"] = int(np.count_nonzero(owner >= 0))
    return dict(
        image=image,
        depth=depth,
        owner=owner,
        overdraw=overdraw,
        uv=uv_buffer,
        normal=normals,
        world=world,
        weights=weights_buffer,
        scene=scene,
        vertices=vertices,
        pieces=pieces,
        stats=stats,
        matrices=dict(model=model, view=view, projection=projection),
        settings=dict(eye=eye, light=light, mode=mode, depth_test=depth_test),
    )


def inspect_pixel(frame, row, col):
    """真实样本链；候选记录按提交顺序，深度测试与正式缓冲使用相同规则。"""
    size = frame["owner"].shape[0]
    if (
        any(not isinstance(x, (int, np.integer)) for x in (row, col))
        or not 0 <= row < size
        or not 0 <= col < size
    ):
        raise ValueError("像素行列须在图像内")
    candidates = []
    stored = np.inf
    for piece in frame["pieces"]:
        covered, w = raster.triangle_coverage(
            piece["xy"], [[col + 0.5, size - row - 0.5]]
        )
        if not covered[0]:
            continue
        depth = float(interpolate_depth(w[0], piece["z"]))
        passed = not frame["settings"]["depth_test"] or depth < stored
        if passed:
            stored = depth
        candidates.append(dict(face=piece["face"], depth=depth, passed=bool(passed)))
    face = int(frame["owner"][row, col])
    result = dict(hit=face >= 0, row=row, col=col, candidates=candidates)
    if face < 0:
        return result
    indices = frame["scene"]["faces"][face]
    result.update(
        face=face,
        vertex_indices=indices.tolist(),
        weights=frame["weights"][row, col].tolist(),
        world=frame["world"][row, col].tolist(),
        normal=frame["normal"][row, col].tolist(),
        uv=frame["uv"][row, col].tolist(),
        depth=float(frame["depth"][row, col]),
        linear=frame["image"][row, col].tolist(),
        vertices={
            key: frame["vertices"][key][indices].tolist()
            for key in ("local", "world", "view", "clip")
        },
    )
    return result


def source_over(source, destination, alpha):
    """不透明目标上的 straight-alpha source-over，输入输出均为线性 RGB。"""
    source, destination, alpha = map(
        lambda x: np.asarray(x, float), (source, destination, alpha)
    )
    if any(not np.isfinite(x).all() for x in (source, destination, alpha)) or np.any(
        (alpha < 0) | (alpha > 1)
    ):
        raise ValueError("颜色须有限，alpha 位于 [0,1]")
    return source * alpha[..., None] + destination * (1 - alpha[..., None])
