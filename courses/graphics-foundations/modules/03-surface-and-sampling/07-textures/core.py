"""UV 是属性；先透视校正，再在线性颜色空间采样。覆盖复用第 04 章。"""

import importlib.util
from pathlib import Path
import numpy as np

_path = (
    Path(__file__).resolve().parents[2] / "02-rasterization/04-barycentric/raster.py"
)
_spec = importlib.util.spec_from_file_location("texture_raster", _path)
_raster = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_raster)


def perspective_interpolate(weights, attributes, inv_w):
    """屏幕权重 (...,N)、顶点属性 (N,K)、1/w (N,) → 属性 (...,K)。"""
    weights, attributes, inv_w = map(
        lambda x: np.asarray(x, float), (weights, attributes, inv_w)
    )
    if (
        attributes.ndim != 2
        or inv_w.shape != (len(attributes),)
        or weights.ndim < 1
        or weights.shape[-1] != len(attributes)
    ):
        raise ValueError("权重、属性与顶点 w 数量必须一致")
    if not all(np.isfinite(x).all() for x in (weights, attributes, inv_w)) or np.any(
        inv_w <= 0
    ):
        raise ValueError("数据必须有限，1/w 必须为正")
    denominator = weights @ inv_w
    if np.any(denominator <= 0):
        raise ValueError("该点的透视分母必须为正")
    return (weights @ (attributes * inv_w[:, None])) / denominator[..., None]


def bilinear_taps(uv, width, height):
    """返回四个纹素的 (rows, cols, weights)，各形状 (...,4)。边界 clamp。"""
    uv = np.asarray(uv, float)
    if (
        uv.ndim < 1
        or uv.shape[-1] != 2
        or not np.isfinite(uv).all()
        or min(width, height) < 1
    ):
        raise ValueError("需要有限 UV (...,2) 和正纹理尺寸")
    uv = np.clip(uv, 0, 1)
    x, y = uv[..., 0] * width - 0.5, (1 - uv[..., 1]) * height - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    s, t = x - x0, y - y0
    cols = np.clip(np.stack([x0, x0 + 1, x0, x0 + 1], axis=-1), 0, width - 1)
    rows = np.clip(np.stack([y0, y0, y0 + 1, y0 + 1], axis=-1), 0, height - 1)
    weights = np.stack([(1 - s) * (1 - t), s * (1 - t), (1 - s) * t, s * t], axis=-1)
    return rows, cols, weights


def sample_texture(texture, uv, filtering="bilinear"):
    """texture 为行向下的线性 RGB (H,W,3)；UV 原点在左下。"""
    texture, uv = np.asarray(texture, float), np.asarray(uv, float)
    if (
        texture.ndim != 3
        or texture.shape[2] != 3
        or min(texture.shape[:2]) < 1
        or not np.isfinite(texture).all()
    ):
        raise ValueError("纹理必须为有限的 (H,W,3) 数组")
    height, width = texture.shape[:2]
    rows, cols, weights = bilinear_taps(uv, width, height)
    if filtering == "bilinear":
        return np.sum(texture[rows, cols] * weights[..., None], axis=-2)
    if filtering != "nearest":
        raise ValueError("过滤方式只能为 nearest 或 bilinear")
    uv = np.clip(uv, 0, 1)
    col = np.clip(np.floor(uv[..., 0] * width).astype(int), 0, width - 1)
    row = np.clip(np.floor((1 - uv[..., 1]) * height).astype(int), 0, height - 1)
    return texture[row, col]


def checker_texture(size=64, frequency=8):
    """生成已在线性空间中的棋盘格，frequency 是每轴格子数量。"""
    if any(not isinstance(n, (int, np.integer)) or n < 1 for n in (size, frequency)):
        raise ValueError("尺寸和格子数需要为正整数")
    x, y = np.meshgrid((np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size)
    light = (
        np.floor(x * frequency).astype(int) + np.floor(y * frequency).astype(int)
    ) % 2 == 0
    return np.where(light[..., None], [0.92, 0.88, 0.73], [0.022, 0.09, 0.065])


def _area_reduce_axis(image, count, axis):
    """等面积盒平均：奇数尺寸也按重叠长度加权，不丢掉最后一行/列。"""
    source = np.moveaxis(image, axis, 0)
    scale = len(source) / count
    left = np.arange(count) * scale
    right = left + scale
    first = np.floor(left).astype(int)
    result = np.zeros((count,) + source.shape[1:])
    # 一次减半时一个新格至多接触三个旧格；循环的是邻居而非像素。
    for offset in range(int(np.ceil(scale)) + 1):
        index = np.minimum(first + offset, len(source) - 1)
        overlap = np.maximum(
            0, np.minimum(right, first + offset + 1) - np.maximum(left, first + offset)
        )
        weight = (overlap / scale).reshape((-1,) + (1,) * (source.ndim - 1))
        result += source[index] * weight
    return np.moveaxis(result, 0, axis)


def build_mipmaps(texture):
    """线性 RGB → mip 链，尺寸逐轴 floor(n/2)，最终为 1×1。

    每层像素是上层等面积区域的平均；非 2 次幂尺寸也保持全图均值。
    这是明确的教学边界策略，不声称与任一 GPU 驱动的 mip 生成完全一致。
    """
    texture = np.asarray(texture, float)
    if (
        texture.ndim != 3
        or texture.shape[2] != 3
        or min(texture.shape[:2]) < 1
        or not np.isfinite(texture).all()
    ):
        raise ValueError("纹理必须为有限的 (H,W,3) 线性 RGB 数组")
    levels = [texture.copy()]
    while max(levels[-1].shape[:2]) > 1:
        previous = levels[-1]
        height, width = [max(1, n // 2) for n in previous.shape[:2]]
        reduced = _area_reduce_axis(previous, width, 1)
        levels.append(_area_reduce_axis(reduced, height, 0))
    return levels


def barycentric_gradients(screen_xy):
    """屏幕重心坐标的梯度，返回 (3,2)，末轴分别为 d/dx、d/dy。"""
    screen_xy = np.asarray(screen_xy, float)
    if screen_xy.shape != (3, 2) or not np.isfinite(screen_xy).all():
        raise ValueError("需要有限的三个屏幕顶点 (3,2)")
    matrix = np.column_stack([screen_xy, np.ones(3)])
    try:
        return np.linalg.inv(matrix)[:2].T
    except np.linalg.LinAlgError as error:
        raise ValueError("退化三角形没有唯一重心梯度") from error


def perspective_jacobian(weights, screen_xy, texcoords, inv_w):
    """对 UV=N/q 使用商法则；输出 (..., UV分量, 屏幕xy分量)。

    screen_xy 必须与产生 weights 的三角形一致。光栅器量化过顶点时，
    这里也传量化后的顶点；本函数不对连续求导的位置再次量化。
    """
    weights, texcoords, inv_w = [
        np.asarray(x, float) for x in (weights, texcoords, inv_w)
    ]
    uv = perspective_interpolate(weights, texcoords, inv_w)
    if texcoords.shape != (3, 2):
        raise ValueError("需要三个顶点的 UV (3,2)")
    gradients = barycentric_gradients(screen_xy)
    q = weights @ inv_w
    dq = inv_w @ gradients
    d_numerator = (texcoords * inv_w[:, None]).T @ gradients
    return (d_numerator - uv[..., :, None] * dq) / q[..., None, None]


def footprint_metrics(jacobian, texture_shape, *, lod_bias=0, max_anisotropy=8):
    """以 Jacobian 的奇异值近似足迹两轴，单位为源纹素/屏幕像素。

    J 将直径为一屏幕像素的圆映到纹理椭圆；奇异值是完整轴跨度，
    椭圆半轴为奇异值的一半。这只是像素方形的局部线性近似。
    各向异性使用长轴上的有限均匀 taps，不是 EWA 或精确像素积分。
    """
    jacobian = np.asarray(jacobian, float)
    if jacobian.shape[-2:] != (2, 2) or not np.isfinite(jacobian).all():
        raise ValueError("Jacobian 必须为有限 (...,2,2)")
    if len(texture_shape) < 2 or min(texture_shape[:2]) < 1:
        raise ValueError("需要正的纹理高、宽")
    if (
        not np.isfinite(lod_bias)
        or not isinstance(max_anisotropy, (int, np.integer))
        or not 1 <= max_anisotropy <= 32
    ):
        raise ValueError("LOD 偏置必须有限，各向异性上限需为 1 至 32 的整数")
    height, width = texture_shape[:2]
    texel_jacobian = jacobian * np.array([width, height])[:, None]
    axes, lengths, _ = np.linalg.svd(texel_jacobian)
    major, minor = lengths[..., 0], lengths[..., 1]
    effective_minor = np.maximum(minor, major / max_anisotropy)
    # 仅决定 tap 数时把宽度至少取为一纹素。选层必须先加 bias，再夹到 L0；
    # 否则放大区 A=1 会与各向同性查询使用不同 LOD。
    taps = np.clip(
        np.ceil(major / np.maximum(effective_minor, 1)).astype(int), 1, max_anisotropy
    )
    return dict(
        major=major,
        minor=minor,
        major_axis=axes[..., :, 0],
        anisotropy=major / np.maximum(minor, 1e-12),
        lod_isotropic=np.maximum(0, np.log2(np.maximum(major, 1e-12)) + lod_bias),
        lod_anisotropic=np.maximum(
            0, np.log2(np.maximum(effective_minor, 1e-12)) + lod_bias
        ),
        tap_count=taps,
    )


def sample_trilinear(mipmaps, uv, lod):
    """每层双线性，再在相邻两层之间插值；LOD 保持连续。"""
    uv = np.asarray(uv, float)
    if uv.ndim < 1 or uv.shape[-1] != 2 or not np.isfinite(uv).all() or not mipmaps:
        raise ValueError("需要有限 UV (...,2) 和非空 mip 链")
    lod = np.broadcast_to(np.asarray(lod, float), uv.shape[:-1])
    if not np.isfinite(lod).all():
        raise ValueError("LOD 必须有限")
    shape = uv.shape[:-1]
    uv = uv.reshape(-1, 2)
    lod = np.clip(lod.reshape(-1), 0, len(mipmaps) - 1)
    lower = np.floor(lod).astype(int)
    fraction = lod - lower
    color = np.empty((len(uv), 3))
    for level in np.unique(lower):
        mask = lower == level
        a = sample_texture(mipmaps[level], uv[mask])
        b = sample_texture(mipmaps[min(level + 1, len(mipmaps) - 1)], uv[mask])
        color[mask] = a + fraction[mask, None] * (b - a)
    return color.reshape(shape + (3,))


def _sample_anisotropic(mipmaps, uv, metrics):
    """短轴选择 mip，长轴等距取样；每个像素的权重严格相加为 1。"""
    uv = np.asarray(uv, float)
    shape = uv.shape[:-1]
    centers = uv.reshape(-1, 2)
    count = np.broadcast_to(metrics["tap_count"], shape).reshape(-1)
    lod = np.broadcast_to(metrics["lod_anisotropic"], shape).reshape(-1)
    major = np.broadcast_to(metrics["major"], shape).reshape(-1)
    axis = np.broadcast_to(metrics["major_axis"], shape + (2,)).reshape(-1, 2)
    height, width = mipmaps[0].shape[:2]
    span = axis * major[:, None] / [width, height]
    color = np.zeros((len(centers), 3))
    for tap in range(int(count.max()) if count.size else 0):
        mask = tap < count
        offset = ((tap + 0.5) / count[mask] - 0.5)[:, None]
        sample = centers[mask] + offset * span[mask]
        color[mask] += sample_trilinear(mipmaps, sample, lod[mask]) / count[mask, None]
    return color.reshape(shape + (3,))


def sample_anisotropic(mipmaps, uv, jacobian, *, lod_bias=0, max_anisotropy=8):
    """可独立阅读/调用的各向异性多 tap 过滤入口。"""
    metrics = footprint_metrics(
        jacobian, mipmaps[0].shape, lod_bias=lod_bias, max_anisotropy=max_anisotropy
    )
    return _sample_anisotropic(mipmaps, uv, metrics)


def _filtered(mipmaps, uv, metrics, filtering):
    if filtering in ("nearest", "bilinear"):
        return sample_texture(mipmaps[0], uv, filtering)
    if filtering == "trilinear":
        return sample_trilinear(mipmaps, uv, metrics["lod_isotropic"])
    if filtering == "anisotropic":
        return _sample_anisotropic(mipmaps, uv, metrics)
    raise ValueError("过滤方式必须为 nearest、bilinear、trilinear 或 anisotropic")


def make_quad(
    tilt=55, rotation=0, *, position=(0, 0, -2.8), scale=(1, 1, 1), transform=None
):
    """矩形绕 X 负向倾斜、绕 Z 转动，再移到相机前；返回 clip、UV、相机坐标。"""
    if not np.isfinite([tilt, rotation]).all() or not 0 <= tilt <= 75:
        raise ValueError("倾角需要在 [0,75] 度内，旋转角必须有限")
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)
    a, b = (2 * uv - 1).T
    angle, roll = np.deg2rad([tilt, rotation])
    x, y = a, 1.6 * np.cos(angle) * b
    distance = 2.8 + 1.6 * np.sin(angle) * b
    camera = np.column_stack(
        [
            np.cos(roll) * x - np.sin(roll) * y,
            np.sin(roll) * x + np.cos(roll) * y,
            -distance,
        ]
    )
    # 可编辑对象先在局部平面缩放，再保留原倾角/滚转，最后做额外刚体姿态。
    if not np.allclose(scale, [1, 1, 1]):
        x, y = a * scale[0], 1.6 * np.cos(angle) * b * scale[1]
        distance = 2.8 + 1.6 * np.sin(angle) * b * scale[1]
        camera = np.column_stack(
            [
                np.cos(roll) * x - np.sin(roll) * y,
                np.sin(roll) * x + np.cos(roll) * y,
                -distance,
            ]
        )
    camera += [0, 0, 2.8]
    if transform is not None:
        camera = camera @ np.asarray(transform, float).T
    camera += np.asarray(position, float)
    distance = -camera[:, 2]
    near, far, focal = 0.2, 10.0, 1.15
    z_clip = (far + near) / (far - near) * distance - 2 * far * near / (far - near)
    clip = np.column_stack([focal * camera[:, :2], z_clip, distance])
    return clip, uv, camera


def render(
    tilt=55,
    rotation=0,
    frequency=8,
    filtering="bilinear",
    resolution=128,
    diagonal=0,
    *,
    position=(0, 0, -2.8),
    scale=(1, 1, 1),
    transform=None,
    texture_size=64,
    lod_bias=0,
    max_anisotropy=8,
    compare_filters=False
):
    """同一份覆盖，分别计算正确/错误 UV；结果包含探针所需的全部中间量。"""
    if (
        not isinstance(resolution, int)
        or not 8 <= resolution <= 2048
        or diagonal not in (0, 1)
    ):
        raise ValueError("分辨率需要为 8 至 2048 的整数，对角线选择为 0 或 1")
    if filtering not in ("nearest", "bilinear", "trilinear", "anisotropic"):
        raise ValueError("未知纹理过滤方式")
    texture = checker_texture(texture_size, frequency)
    mipmaps = build_mipmaps(texture)
    clip, uv, camera = make_quad(
        tilt, rotation, position=position, scale=scale, transform=transform
    )
    faces = [[0, 1, 2], [0, 2, 3]] if diagonal == 0 else [[0, 1, 3], [1, 2, 3]]
    correct = np.full((resolution, resolution, 3), 0.91)
    affine = correct.copy()
    uv_correct = np.full((resolution, resolution, 2), np.nan)
    uv_affine = uv_correct.copy()
    owner = np.full((resolution, resolution), -1, dtype=int)
    barycentrics = np.full((resolution, resolution, 3), np.nan)
    jacobians = np.full((resolution, resolution, 2, 2), np.nan)
    readings = {
        key: np.full((resolution, resolution), np.nan)
        for key in (
            "lod",
            "lod_isotropic",
            "lod_anisotropic",
            "footprint_major",
            "footprint_minor",
            "anisotropy",
        )
    }
    tap_count = np.zeros((resolution, resolution), dtype=int)
    comparisons = (
        {
            mode: correct.copy()
            for mode in ("nearest", "bilinear", "trilinear", "anisotropic")
        }
        if compare_filters
        else {}
    )
    pieces = []
    for face in faces:
        triangles, attributes = _raster.clip_triangle(clip[face], uv[face])
        for triangle, texcoords in zip(triangles, attributes):
            xy, z_ndc, inv_w = _raster.clip_to_screen(triangle, resolution, resolution)
            rows, cols, weights = _raster.rasterize_triangle(xy, resolution, resolution)
            if not len(rows):
                continue
            good = perspective_interpolate(weights, texcoords, inv_w)
            bad = weights @ texcoords
            # 覆盖使用量化几何；导数必须来自同一份屏幕三角形。
            snapped = _raster.snap_vertices(xy) / _raster.SUBPIXEL
            jacobian = perspective_jacobian(weights, snapped, texcoords, inv_w)
            affine_jacobian = texcoords.T @ barycentric_gradients(snapped)
            metrics = footprint_metrics(
                jacobian,
                texture.shape,
                lod_bias=lod_bias,
                max_anisotropy=max_anisotropy,
            )
            affine_metrics = footprint_metrics(
                affine_jacobian,
                texture.shape,
                lod_bias=lod_bias,
                max_anisotropy=max_anisotropy,
            )
            correct[rows, cols] = _filtered(mipmaps, good, metrics, filtering)
            # 仿射错误图也使用同一过滤器，但其足迹必须对应它自己的错误映射。
            affine[rows, cols] = _filtered(mipmaps, bad, affine_metrics, filtering)
            for mode, image in comparisons.items():
                image[rows, cols] = _filtered(mipmaps, good, metrics, mode)
            jacobians[rows, cols] = jacobian
            for key, source in (
                ("footprint_major", "major"),
                ("footprint_minor", "minor"),
                ("anisotropy", "anisotropy"),
                ("lod_isotropic", "lod_isotropic"),
                ("lod_anisotropic", "lod_anisotropic"),
            ):
                value = metrics[source]
                readings[key][rows, cols] = (
                    np.minimum(value, len(mipmaps) - 1)
                    if key.startswith("lod")
                    else value
                )
            lod_key = (
                "lod_anisotropic" if filtering == "anisotropic" else "lod_isotropic"
            )
            readings["lod"][rows, cols] = (
                readings[lod_key][rows, cols]
                if filtering in ("trilinear", "anisotropic")
                else 0
            )
            tap_count[rows, cols] = (
                metrics["tap_count"] if filtering == "anisotropic" else 1
            )
            uv_correct[rows, cols], uv_affine[rows, cols] = good, bad
            barycentrics[rows, cols], owner[rows, cols] = weights, len(pieces)
            pieces.append(dict(xy=xy, uv=texcoords, inv_w=inv_w, z_ndc=z_ndc))
    return dict(
        correct=correct,
        affine=affine,
        uv_correct=uv_correct,
        uv_affine=uv_affine,
        weights=barycentrics,
        owner=owner,
        pieces=pieces,
        texture=texture,
        camera=camera,
        mipmaps=mipmaps,
        jacobian=jacobians,
        tap_count=tap_count,
        filtering_images=comparisons,
        **readings
    )


def pixel_footprint(piece, x, y):
    """把屏幕像素四角映射到 UV；要求四角的透视分母 q 全部为正。

    即使像素中心被三角形覆盖，四角延拓仍可能跨越 q=0 的消失线；
    此时没有有界四边形足迹，本函数明确抛出 ValueError。
    合法时返回的是平面映射足迹，不是双线性四纹素或几何覆盖积分。
    """
    points = np.array(
        [[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]]
    )
    _, weights = _raster.triangle_coverage(piece["xy"], points)
    if np.any(weights @ piece["inv_w"] <= 0):
        raise ValueError("像素四角跨越投影消失线，不能定义有界的 UV 四边形足迹")
    return perspective_interpolate(weights, piece["uv"], piece["inv_w"])
