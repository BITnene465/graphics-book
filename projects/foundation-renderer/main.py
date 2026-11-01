"""综合实践：从世界三角形到线性颜色，保存每个阶段供独立检查。"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import struct
import zlib

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODULES = ROOT / "courses/graphics-foundations/modules"


def load(name, relative):
    """章节目录含编号和连字符，按文件路径加载普通 Python 模块。"""
    spec = importlib.util.spec_from_file_location(name, MODULES / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pixels = load("cap_pixels", "01-images-and-space/01-pixels/core.py")
camera = load("cap_camera", "01-images-and-space/03-camera/core.py")
lighting = load("cap_lighting", "03-surface-and-sampling/06-lighting/core.py")
textures = load("cap_textures", "03-surface-and-sampling/07-textures/core.py")
shadows = load("cap_shadows", "04-shadows-and-geometry/09-shadows/core.py")
geometry = load("cap_geometry", "04-shadows-and-geometry/10-geometry/core.py")


def render_frame(size=96, shadow_size=128, *, camera_eye=(6, 5, 7),
                 light_eye=(-3, 6, -2), offset=(-1.4, 1, 0), reverse=False):
    """一次确定性的两遍渲染；所有数组首行在上，颜色保留线性浮点数。"""
    # 1. 所有物体转换为同一世界空间中的三角形。
    triangles, materials = shadows.scene_geometry()
    vertices, faces = geometry.make_mesh(axes=(.75, 1., .65))
    triangles = np.concatenate([triangles, (vertices + offset)[faces]])
    materials = np.vstack([materials, np.tile([.12, .46, .27], (len(faces), 1))])
    triangle_ids = np.arange(len(triangles))
    if reverse:
        triangles, materials, triangle_ids = triangles[::-1], materials[::-1], triangle_ids[::-1]

    # 2. 光源与相机共用相同的裁剪、覆盖、插值和深度算法。
    camera_vp = camera.perspective(48, 1, .3, 25) @ camera.look_at(camera_eye, (0, .55, 0))
    _, light_vp = shadows.scene_matrices(light_eye)
    light_pass = shadows.rasterize_world(triangles, light_vp, shadow_size)
    surface = shadows.rasterize_world(triangles, camera_vp, size)
    valid = surface["owner"] >= 0
    points, normals = surface["world"][valid], surface["normal"][valid]
    owners = surface["owner"][valid]

    # 3. 在同一世界空间内构造光方向、视线和表面颜色。
    light_dir, intensity = lighting.light_at(points, light_eye, point_light=False)
    view_dir = lighting.normalize(np.asarray(camera_eye) - points)
    parts = lighting.shade(normals, light_dir, view_dir, kd=(1, 1, 1), ks=.15,
                           exponent=32, ambient=.04, irradiance=intensity)
    query = shadows.shadow_query(points, light_vp, light_pass["depth"], bias=.004, radius=1)
    visibility = query["visibility"][:, None]
    albedo = materials[owners].copy()
    ground = triangle_ids[owners] < 2
    uv = (points[ground][:, [0, 2]] + 3) / 6
    albedo[ground] = textures.sample_texture(textures.checker_texture(64, 6), uv)

    # 4. 只对直接光乘阴影可见率；保留分量，最后才进行显示编码。
    image = np.full((size, size, 3), [.90, .93, .88])
    components = {}
    for name, value in (("ambient", albedo * parts["ambient"]),
                        ("diffuse", albedo * visibility * parts["diffuse"]),
                        ("specular", visibility * parts["specular"])):
        components[name] = np.zeros_like(image)
        components[name][valid] = value
    image[valid] = sum(component[valid] for component in components.values())
    shadow_visibility = np.full((size, size), np.nan)
    shadow_visibility[valid] = visibility[:, 0]
    # owner 使用场景的固定三角形编号，不随提交次序变化。
    surface["owner"][valid] = triangle_ids[owners]
    return dict(linear_rgb=image, **surface, **components, visibility=shadow_visibility,
                camera_vp=camera_vp, light_vp=light_vp, shadow_depth=light_pass["depth"])


def inspect_pixel(frame, row, col):
    """给出一个像素的数值链；背景不伪造世界位置和法线。"""
    height, width = frame["owner"].shape
    if not (0 <= row < height and 0 <= col < width):
        raise ValueError("像素行列超出图像范围")
    result = {"row": int(row), "col": int(col), "triangle": int(frame["owner"][row, col]),
              "linear_rgb": frame["linear_rgb"][row, col].tolist()}
    if result["triangle"] < 0:
        result["surface"] = None
        return result
    for key in ("depth", "world", "normal", "visibility", "ambient", "diffuse", "specular"):
        result[key] = frame[key][row, col].tolist()
    clip = frame["camera_vp"] @ np.r_[frame["world"][row, col], 1]
    ndc = clip[:3] / clip[3]
    result["reprojected_depth"] = float((ndc[2] + 1) / 2)
    result["screen_xy"] = [(float(ndc[0]) + 1) * width / 2,
                           (float(ndc[1]) + 1) * height / 2]
    result["pixel_center_xy"] = [col + .5, height - row - .5]
    return result


def write_png(path, linear_rgb):
    """标准库编码 PNG；图像数据只执行一次线性 RGB → sRGB。"""
    rgb = np.rint(pixels.linear_to_srgb(np.clip(linear_rgb, 0, 1)) * 255).astype(np.uint8)
    height, width = rgb.shape[:2]
    raw = np.concatenate([np.zeros((height, 1), np.uint8), rgb.reshape(height, -1)], axis=1).tobytes()

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, default=96)
    parser.add_argument("--shadow-size", type=int, default=128)
    parser.add_argument("--pixel", type=int, nargs=2, metavar=("ROW", "COL"))
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/capstone")
    args = parser.parse_args()
    if not (1 <= args.size <= 2048 and 1 <= args.shadow_size <= 2048):
        parser.error("图像与阴影图分辨率须为 1–2048")
    frame = render_frame(args.size, args.shadow_size)
    valid_pixels = np.argwhere(frame["owner"] >= 0)
    pixel = args.pixel or (valid_pixels[len(valid_pixels) // 2].tolist() if len(valid_pixels) else [0, 0])
    try:
        probe = inspect_pixel(frame, *pixel)
    except ValueError as error:
        parser.error(str(error))
    args.output.mkdir(parents=True, exist_ok=True)
    write_png(args.output / "frame.png", frame["linear_rgb"])
    np.savez_compressed(args.output / "frame.npz", **frame)
    report = json.dumps(probe, ensure_ascii=False, indent=2, allow_nan=False)
    (args.output / "pixel.json").write_text(report + "\n", encoding="utf-8")
    print(report)
    print(f"\n{len(valid_pixels)} 个表面像素；结果写入 {args.output}")


if __name__ == "__main__":
    main()
