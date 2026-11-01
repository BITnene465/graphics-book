"""把曲面采样为三角网格，再复用前面章节的裁剪、覆盖和透视插值。

覆盖与深度来自有限三角网格；法线/曲率在可见 UV 处解析求值。
两者的差别保存在像素探针里，不把增加网格密度叫作曲面细分。
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


surface = _load("04-shadows-and-geometry/15-surfaces/core.py")
camera = _load("01-images-and-space/03-camera/core.py")
raster = _load("02-rasterization/04-barycentric/raster.py")
texture = _load("03-surface-and-sampling/07-textures/core.py")
lighting = _load("03-surface-and-sampling/06-lighting/core.py")
BACKGROUND = np.array([0.018, 0.025, 0.032])
UNDEFINED = np.array([0.52, 0.09, 0.15])


def control_defaults():
    """两张有折痕的双三次控制网；参数的每个值都是一个可编辑三维点。"""
    result = {}
    for side, shift in (("a", -3), ("b", 0)):
        for i in range(4):
            for j in range(4):
                height = 1.8 if i in (1, 2) and j in (1, 2) else 0
                if side == "b":
                    height *= -0.55
                result[f"point_{side}_{i}_{j}"] = [shift + i, height, 1.5 - j]
    return result


def controls_from_params(p):
    grids = [
        np.array(
            [[p[f"point_{side}_{i}_{j}"] for j in range(4)] for i in range(4)], float
        )
        for side in ("a", "b")
    ]
    if p["mode"] == "single":
        return grids[:1]
    return list(
        surface.stitch_patches(
            *grids,
            mode=p["continuity"],
            left_span=p["left_span"],
            right_span=p["right_span"],
            tangent_scale=p["tangent_scale"],
        )
    )


def curvature_color(values, limit=1):
    """固定的有向 H 色标：负蓝、零浅灰、正橙；范围外饱和，不逐帧重标。"""
    values = np.asarray(values, float)
    t = np.clip(np.nan_to_num(values) / limit, -1, 1)[..., None]
    neutral = np.array([0.52, 0.57, 0.59])
    blue = np.array([0.035, 0.20, 0.54])
    orange = np.array([0.8, 0.20, 0.04])
    return neutral * (1 - np.abs(t)) + np.where(t < 0, blue, orange) * np.abs(t)


def parameter_lines(uv, patch):
    """等参线的屏幕宽度约一个像素；同一曲面内的邻域估计 UV 足迹。

    这是可关闭的参数域标记，并非额外几何、网格边或精确曲线光栅器。
    """
    footprint = np.zeros_like(uv)
    for axis in (0, 1):
        neighbor_uv = np.roll(uv, -1, axis=axis)
        same = np.roll(patch, -1, axis=axis) == patch
        if axis == 0:
            same[-1] = False
        else:
            same[:, -1] = False
        footprint += np.where(same[..., None], np.abs(neighbor_uv - uv), 0)
    distance = np.abs((uv * 8 + 0.5) % 1 - 0.5) / 8
    opacity = 1 - np.clip(distance / np.maximum(footprint, 1e-7), 0, 1)
    return opacity.max(axis=-1) * 0.62


def render_frame(p, pose):
    """后端完整一帧。通过 camera、raster、texture 可追到前面章节的公式。"""
    size, divisions = p["size"], p["divisions"]
    grids = controls_from_params(p)
    meshes = [surface.patch_mesh(grid, divisions) for grid in grids]
    matrix = camera.perspective(pose["fov"], 1, 0.05, 160) @ camera.look_at(
        pose["eye"], pose["target"], pose["up"]
    )
    owner = np.full((size, size), -1, int)
    patch = np.full_like(owner, -1)
    depth = np.full((size, size), np.inf)
    uv = np.zeros((size, size, 2))
    world = np.zeros((size, size, 3))
    face_offset = 0
    for part, mesh in enumerate(meshes):
        vertices, faces = mesh["vertices"], mesh["faces"]
        clip = camera.transform_points(vertices, matrix)
        for face_id, face in enumerate(faces):
            attrs = np.column_stack([vertices[face], mesh["uv"][face]])
            clipped, attributes = raster.clip_triangle(clip[face], attrs)
            for triangle, attr in zip(clipped, attributes):
                xy, z, inv_w = raster.clip_to_screen(triangle, size, size)
                rows, cols, weights = raster.rasterize_triangle(xy, size, size)
                # NDC 深度沿屏幕线性插值；世界位置和 UV 需恢复透视权重。
                candidate = (weights @ z + 1) / 2
                passing = candidate < depth[rows, cols]
                if not np.any(passing):
                    continue
                r, c = rows[passing], cols[passing]
                values = texture.perspective_interpolate(weights[passing], attr, inv_w)
                world[r, c], uv[r, c] = values[:, :3], values[:, 3:]
                depth[r, c] = candidate[passing]
                owner[r, c], patch[r, c] = face_offset + face_id, part
        face_offset += len(faces)

    image = np.full((size, size, 3), BACKGROUND)
    normal_image, curvature_image = image.copy(), image.copy()
    normal, exact_world = np.zeros_like(world), np.zeros_like(world)
    regular = np.zeros((size, size), bool)
    mean = np.full((size, size), np.nan)
    gaussian = np.full_like(mean, np.nan)
    area = np.zeros_like(mean)
    for part, grid in enumerate(grids):
        mask = patch == part
        if not np.any(mask):
            continue
        coords = np.clip(uv[mask], 0, 1)
        frame = surface.surface_frame(grid, coords[:, 0], coords[:, 1])
        ok = frame["regular"]
        n = np.nan_to_num(frame["normal"])
        position = world[mask]
        view = np.asarray(pose["eye"]) - position
        # 两面可见的薄片：只为局部光照翻转背面，几何法线/曲率保持原定向。
        facing = np.where(np.sum(n * view, axis=1) < 0, -1, 1)
        light = np.array([p["light_x"], p["light_y"], p["light_z"]]) - position
        distance2 = np.maximum(np.sum(light * light, axis=1), 0.01)
        shaded = lighting.shade(
            n * facing[:, None],
            light,
            view,
            kd=(0.095, 0.34, 0.43),
            ks=0.5,
            exponent=p["shininess"],
            ambient=0.055,
            irradiance=40 / distance2,
        )
        rgb = shaded["diffuse"] + shaded["specular"] + shaded["ambient"]
        rgb[~ok] = UNDEFINED
        image[mask] = rgb
        normal_image[mask] = np.where(ok[:, None], (n + 1) / 2, UNDEFINED)
        curvature_image[mask] = np.where(
            ok[:, None],
            curvature_color(frame["mean_curvature"], p["curvature_limit"]),
            UNDEFINED,
        )
        normal[mask], exact_world[mask], regular[mask] = n, frame["position"], ok
        mean[mask], gaussian[mask], area[mask] = (
            frame["mean_curvature"],
            frame["gaussian_curvature"],
            frame["area"],
        )
    if p["parameter_lines"]:
        alpha = parameter_lines(uv, patch)[..., None]
        valid = (patch >= 0) & regular
        image[valid] = (image * (1 - alpha) + [0.3, 0.53, 0.6] * alpha)[valid]
    return dict(
        image=image,
        normal_image=normal_image,
        curvature_image=curvature_image,
        owner=owner,
        patch=patch,
        depth=depth,
        uv=uv,
        world=world,
        normal=normal,
        surface_world=exact_world,
        regular=regular,
        mean_curvature=mean,
        gaussian_curvature=gaussian,
        area=area,
        grids=grids,
        meshes=meshes,
    )


def inspect_pixel(frame, row, col):
    """探针引用实际缓冲；精确曲面点与网格成像点分别返回。"""
    part = int(frame["patch"][row, col])
    if part < 0:
        return dict(hit=False)
    uv = np.clip(frame["uv"][row, col], 0, 1)
    sample = surface.surface_frame(frame["grids"][part], *uv)
    regular = bool(sample["regular"])
    number = lambda value: float(value) if np.isfinite(value) else None
    return dict(
        hit=True,
        patch="AB"[part],
        face=int(frame["owner"][row, col]),
        surface_uv=uv.tolist(),
        world=frame["world"][row, col].tolist(),
        surface_world=sample["position"].tolist(),
        tessellation_error=float(
            np.linalg.norm(sample["position"] - frame["world"][row, col])
        ),
        normal=sample["normal"].tolist() if regular else None,
        partial_u=sample["du"].tolist(),
        partial_v=sample["dv"].tolist(),
        area_density=number(sample["area"]),
        regular=regular,
        mean_curvature=number(sample["mean_curvature"]),
        gaussian_curvature=number(sample["gaussian_curvature"]),
        linear=frame["image"][row, col].tolist(),
        depth=float(frame["depth"][row, col]),
    )
