"""解析椭球 + 局部光照。列向量语义，全部量在世界空间，线性 RGB 计算。"""
import numpy as np


def normalize(vectors):
    """沿最后一维归一化；零向量返回零，用于无定义的半程方向。"""
    vectors = np.asarray(vectors, float)
    if vectors.ndim == 0 or vectors.shape[-1] != 3 or not np.isfinite(vectors).all():
        raise ValueError("需要有限的三维向量")
    # 先缩放到安全范围，避免极大/极小的有限输入在求平方和时溢出或下溢。
    largest = np.max(np.abs(vectors), axis=-1, keepdims=True)
    scaled = np.divide(vectors, largest, out=np.zeros_like(vectors), where=largest > 0)
    lengths = np.linalg.norm(scaled, axis=-1, keepdims=True)
    return np.divide(scaled, lengths, out=np.zeros_like(scaled), where=lengths > 0)


def transform_normals(normals, linear, *, correct=True):
    """正确：归一化 A⁻ᵀn；错误对照：归一化 An。批量向量按行保存。"""
    linear = np.asarray(linear, float)
    if linear.shape != (3, 3) or not np.isfinite(linear).all():
        raise ValueError("需要有限的 3×3 线性变换")
    if np.linalg.cond(linear) >= 1 / (32 * np.finfo(float).eps):
        raise ValueError("奇异或接近奇异的变换不能定义可靠的法线变换")
    matrix = np.linalg.inv(linear).T if correct else linear
    return normalize(np.asarray(normals, float) @ matrix.T)


def ellipsoid_surface(size=160, scale=(1, 1, 1), extent=1.9, center=(0,0,0)):
    """沿 −Z 正交观察；解析前半椭球。数组第 0 行在顶部，几何 y 仍向上。"""
    scale = np.asarray(scale, float)
    if scale.shape != (3,) or not np.isfinite(scale).all() or np.any(scale <= 0):
        raise ValueError("三个半轴必须有限且为正")
    if not isinstance(size, (int, np.integer)) or size < 2 or not np.isfinite(extent) or extent <= 0:
        raise ValueError("需要至少 2×2 个样本和正视野范围")
    centers = ((np.arange(size) + .5) / size * 2 - 1) * extent
    x, y = np.meshgrid(centers, centers[::-1])
    center = np.asarray(center,float)
    if center.shape != (3,) or not np.isfinite(center).all():
        raise ValueError("椭球中心必须是有限三维位置")
    x, y = x-center[0], y-center[1]
    radius2 = (x / scale[0])**2 + (y / scale[1])**2
    mask = radius2 <= 1
    local = np.stack([x / scale[0], y / scale[1], np.sqrt(np.maximum(0, 1-radius2))], axis=-1)
    local[~mask] = 0
    points = local * scale + center
    return points, local, mask


def light_at(points, light, *, point_light=False, power=1.):
    """ℓ 从表面指向光源。方向光用固定方向；点光返回 I/r² 的入射比例。"""
    points, light = np.asarray(points, float), np.asarray(light, float)
    if points.ndim == 0 or points.shape[-1] != 3 or light.shape != (3,):
        raise ValueError("点和光源必须是三维坐标")
    if not np.isfinite(points).all() or not np.isfinite(light).all() or not np.isfinite(power) or power < 0:
        raise ValueError("坐标必须有限，光强必须有限且非负")
    delta = light - points if point_light else np.broadcast_to(light, points.shape)
    distance2 = np.sum(delta**2, axis=-1)
    if np.any(distance2 == 0):
        raise ValueError("不能使用零光方向，或把点光源放在被着色点上")
    irradiance = power / distance2 if point_light else np.full(points.shape[:-1], power)
    return normalize(delta), irradiance


def shade(normals, light, view, *, kd=(.12, .46, .27), ks=.3, exponent=32., ambient=.025, irradiance=1.):
    """教学 Blinn–Phong：环境常量 + Lambert 漫反射 + 半程向量高光。

    这是便于分解的经验模型；没有遮挡、间接光、能量守恒或微表面 BRDF。
    入射照度比例乘漫反射和高光，背景与显示编码由界面处理。
    """
    n, light, view = normalize(normals), normalize(light), normalize(view)
    kd, irradiance = np.asarray(kd, float), np.asarray(irradiance, float)
    if kd.shape != (3,) or np.any(kd < 0) or not np.isfinite(kd).all():
        raise ValueError("漫反射颜色需要三个非负有限分量")
    parameters = np.array([ks, exponent, ambient], float)
    if not np.isfinite(parameters).all() or np.any(parameters < 0) or exponent < 1:
        raise ValueError("系数非负，指数至少为 1")
    if np.any(irradiance < 0) or not np.isfinite(irradiance).all():
        raise ValueError("入射比例必须非负且有限")
    cosine = np.clip(np.sum(n * light, axis=-1), 0, 1)
    halfway = normalize(light + view)
    highlight = np.clip(np.sum(n * halfway, axis=-1), 0, 1)**exponent
    # 背对光源或观察者的表面不产生此单面模型的直接反射。
    visible = np.sum(n * view, axis=-1) > 0
    diffuse = (irradiance * cosine * visible)[..., None] * kd
    specular = (irradiance * ks * highlight * (cosine > 0) * visible)[..., None] * np.ones(3)
    constant = np.broadcast_to(ambient * kd, diffuse.shape).copy()
    return dict(diffuse=diffuse, specular=specular, ambient=constant, total=constant+diffuse+specular)


def display_rgba(linear_rgb, mask):
    """首行顶部的线性 RGB → Bokeh RGBA；编码一次，只在此处上下翻转一次。"""
    linear = np.clip(np.asarray(linear_rgb, float), 0, 1)
    srgb = np.where(linear <= .0031308, 12.92*linear, 1.055*linear**(1/2.4)-.055)
    rgba = np.empty(linear.shape[:-1]+(4,), dtype=np.uint8)
    rgba[..., :3], rgba[..., 3] = np.rint(srgb*255).astype(np.uint8), 255
    rgba[~np.asarray(mask, bool)] = [247, 249, 243, 255]
    return rgba[::-1].copy().view(np.uint32).reshape(mask.shape)
