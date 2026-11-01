"""方向纹理与镜面环境映射；只用 NumPy 求值，不依赖浏览器。

世界坐标 y 向上。经纬图 u=atan2(z,x)/(2π) mod 1，v=acos(y)/π；
v=0 在图像顶部的北极。这是图像行方向，与前面材质 UV 的 v 向上不同。
立方体面的 UV 也采用图像向下，面顺序固定为 +X,-X,+Y,-Y,+Z,-Z。
所有颜色是线性 RGB。立方体双线性查询逐面 clamp，未实现跨面 seamless 过滤。
"""

import importlib.util
from functools import lru_cache
from pathlib import Path

import numpy as np


def _load_camera():
    path = Path(__file__).resolve().parents[2] / "01-images-and-space/03-camera/core.py"
    spec = importlib.util.spec_from_file_location("environment_camera", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_camera = _load_camera()
FACE_NAMES = ("+X", "-X", "+Y", "-Y", "+Z", "-Z")
FACE_FORWARD = np.array(
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    dtype=float,
)
FACE_RIGHT = np.array(
    [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]],
    dtype=float,
)
FACE_DOWN = np.array(
    [[0, -1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, -1, 0]],
    dtype=float,
)


def _array(value, components, name):
    value = np.asarray(value, dtype=float)
    if value.ndim < 1 or value.shape[-1] != components or not np.isfinite(value).all():
        raise ValueError(f"{name}需要有限的 (...,{components}) 数组")
    return value


def _size(value, name, maximum=1024):
    if (
        isinstance(value, (bool, np.bool_))
        or not isinstance(value, (int, np.integer))
        or not 1 <= value <= maximum
    ):
        raise ValueError(f"{name}需要 1..{maximum} 的整数")
    return int(value)


def normalize(direction):
    """单位化最后一维，拒绝零方向；先缩放以避免平方溢出或下溢。"""
    direction = _array(direction, 3, "方向")
    scale = np.max(np.abs(direction), axis=-1, keepdims=True)
    if np.any(scale == 0):
        raise ValueError("零向量没有环境查询方向")
    scaled = direction / scale
    return scaled / np.linalg.norm(scaled, axis=-1, keepdims=True)


def direction_to_latlong(direction):
    """单位方向 → 图像 UV。极点经度不唯一，本函数在精确极点约定 u=0。"""
    d = normalize(direction)
    x, y, z = np.moveaxis(d, -1, 0)
    u = np.mod(np.arctan2(z, x) / (2 * np.pi), 1.0)
    u = np.where((x == 0) & (z == 0), 0.0, u)
    v = np.arccos(np.clip(y, -1, 1)) / np.pi
    return np.stack([u, v], axis=-1)


def latlong_to_direction(uv):
    """图像 UV → 单位方向；u 可周期延拓，v 必须在 [0,1]。"""
    uv = _array(uv, 2, "经纬 UV")
    if np.any((uv[..., 1] < 0) | (uv[..., 1] > 1)):
        raise ValueError("经纬图的 v 必须在 [0,1]")
    phi = np.mod(uv[..., 0], 1.0) * (2 * np.pi)
    theta = uv[..., 1] * np.pi
    return np.stack(
        [np.sin(theta) * np.cos(phi), np.cos(theta), np.sin(theta) * np.sin(phi)],
        axis=-1,
    )


def direction_to_cube(direction):
    """返回面编号 (...,) 与该面图像 UV (...,2)；主轴并列按 X、Y、Z 选面。"""
    d = normalize(direction)
    axis = np.argmax(np.abs(d), axis=-1)
    dominant = np.take_along_axis(d, axis[..., None], axis=-1)[..., 0]
    face = 2 * axis + (dominant < 0).astype(int)
    magnitude = np.abs(dominant)
    s = np.sum(d * FACE_RIGHT[face], axis=-1) / magnitude
    t = np.sum(d * FACE_DOWN[face], axis=-1) / magnitude
    return face, np.clip(np.stack([s, t], axis=-1) * 0.5 + 0.5, 0, 1)


def cube_to_direction(face, uv):
    """面编号和面内 UV → 单位方向，支持 face 与 UV 的前导维广播。"""
    uv = _array(uv, 2, "立方体面 UV")
    face = np.asarray(face)
    if not np.issubdtype(face.dtype, np.integer) or np.any((face < 0) | (face > 5)):
        raise ValueError("立方体面编号必须为 0..5 的整数")
    if np.any((uv < 0) | (uv > 1)):
        raise ValueError("立方体面 UV 必须在 [0,1]")
    shape = np.broadcast_shapes(face.shape, uv.shape[:-1])
    face = np.broadcast_to(face, shape)
    st = np.broadcast_to(uv, shape + (2,)) * 2 - 1
    direction = (
        FACE_FORWARD[face]
        + st[..., :1] * FACE_RIGHT[face]
        + st[..., 1:] * FACE_DOWN[face]
    )
    return normalize(direction)


def reflect(incident, normal):
    """R=I−2(I·N̂)N̂；I 指向表面，法线内部归一化，I 的长度保持。"""
    incident = _array(incident, 3, "入射方向")
    normal = normalize(normal)
    return incident - 2 * np.sum(incident * normal, axis=-1, keepdims=True) * normal


def _soft_window(direction, center, width, height):
    """连续的柔边色窗，不含经纬接缝；正面门控避免出现背面的镜像色窗。"""
    center = normalize(center)
    right = normalize(np.cross([0, 1, 0], center))
    up = np.cross(center, right)
    horizontal = np.sum(direction * right, axis=-1) / width
    vertical = np.sum(direction * up, axis=-1) / height
    front = np.sum(direction * center, axis=-1)
    shape = np.exp(-(horizontal**8 + vertical**8))
    return shape * (0.5 + 0.5 * np.tanh(16 * (front - 0.35)))


def environment_local_direction(direction, yaw=0):
    """世界方向 → 环境局部方向 R_y(−yaw)d；yaw 用右手弧度。"""
    direction = normalize(direction)
    if not np.isscalar(yaw) or not np.isfinite(yaw):
        raise ValueError("环境 yaw 必须是有限弧度")
    c, s = np.cos(yaw), np.sin(yaw)
    x, y, z = np.moveaxis(direction, -1, 0)
    return np.stack([c * x - s * z, y, s * x + c * z], axis=-1)


def analytic_environment(direction, yaw=0, pattern="studio"):
    """原创连续环境，返回 [0,1] 线性 RGB；yaw 是绕 +Y 的右手弧度。

    环境主动旋转：E_yaw(d)=E_0(R_y(-yaw)d)。例如 +π/2 将原来 +X
    方向的图案移到 −Z。direction 模式把环境局部方向编码为 (d+1)/2；
    studio 模式用渐变背景与连续柔边色窗提供可辨认的反射参照。
    """
    local = environment_local_direction(direction, yaw)
    if pattern == "direction":
        return np.clip((local + 1) * 0.5, 0, 1)
    if pattern != "studio":
        raise ValueError("环境 pattern 只能是 studio 或 direction")
    sky = 0.5 + 0.5 * np.tanh(3.5 * local[..., 1])
    lower, upper = np.array([0.035, 0.045, 0.065]), np.array([0.22, 0.29, 0.38])
    color = lower + sky[..., None] * (upper - lower)
    color += np.exp(-((local[..., 1] / 0.16) ** 2))[..., None] * [0.055, 0.04, 0.025]
    for center, width, height, tint in (
        ([0.8, 0.18, 0.6], 0.15, 0.42, [0.84, 0.94, 1.0]),
        ([-0.8, 0.12, 0.5], 0.31, 0.18, [1.0, 0.63, 0.28]),
        ([-0.35, -0.30, -0.86], 0.28, 0.22, [0.08, 0.72, 0.64]),
        ([0.9, -0.12, -0.35], 0.20, 0.31, [0.85, 0.16, 0.27]),
    ):
        weight = _soft_window(local, center, width, height)[..., None]
        color = (1 - weight) * color + weight * tint
    return np.clip(color, 0, 1)


def build_latlong(width=256, height=128, yaw=0, pattern="studio"):
    """在经纬图每个纹素中心求环境值；数组第 0 行在北极附近。"""
    width, height = _size(width, "经纬图宽", 2048), _size(height, "经纬图高")
    u, v = np.meshgrid(
        (np.arange(width) + 0.5) / width, (np.arange(height) + 0.5) / height
    )
    return analytic_environment(
        latlong_to_direction(np.stack([u, v], axis=-1)), yaw, pattern
    )


def build_cubemap(size=128, yaw=0, pattern="studio"):
    """返回 (6,size,size,3)，各面独立保存图像向下的像素中心样本。"""
    size = _size(size, "立方体面边长")
    u, v = np.meshgrid((np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size)
    uv = np.stack([u, v], axis=-1)
    return np.stack(
        [
            analytic_environment(cube_to_direction(face, uv), yaw, pattern)
            for face in range(6)
        ]
    )


def _bilinear(image, uv, wrap_u):
    image = np.asarray(image, dtype=float)
    if (
        image.ndim != 3
        or image.shape[-1] != 3
        or min(image.shape[:2]) < 1
        or not np.isfinite(image).all()
    ):
        raise ValueError("环境图必须是非空、有限的 (H,W,3) 线性 RGB")
    uv = _array(uv, 2, "查询 UV")
    height, width = image.shape[:2]
    u = np.mod(uv[..., 0], 1.0) if wrap_u else np.clip(uv[..., 0], 0, 1)
    x, y = u * width - 0.5, np.clip(uv[..., 1], 0, 1) * height - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    if wrap_u:
        left, right = x0 % width, (x0 + 1) % width
    else:
        left, right = np.clip(x0, 0, width - 1), np.clip(x0 + 1, 0, width - 1)
    top, bottom = np.clip(y0, 0, height - 1), np.clip(y0 + 1, 0, height - 1)
    upper = (1 - fx) * image[top, left] + fx * image[top, right]
    lower = (1 - fx) * image[bottom, left] + fx * image[bottom, right]
    return (1 - fy) * upper + fy * lower


def sample_latlong(image, uv):
    """半纹素约定的双线性查询：u 周期环绕，v clamp，不执行 sRGB 解码。"""
    return _bilinear(image, uv, wrap_u=True)


def sample_cubemap(faces, direction):
    """选择主方向面后在该面内双线性 clamp；没有跨面 seamless 过滤。

    邻面的边缘纹素中心不是同一方向，低分辨率下边界可能显露细缝；
    连续解析环境无缝，不代表这个离散过滤器也无缝。
    """
    faces = np.asarray(faces, dtype=float)
    if (
        faces.ndim != 4
        or faces.shape[0] != 6
        or faces.shape[-1] != 3
        or faces.shape[1] != faces.shape[2]
        or faces.shape[1] < 1
        or not np.isfinite(faces).all()
    ):
        raise ValueError("立方体图需要有限的 (6,N,N,3) 数组")
    face, uv = direction_to_cube(direction)
    result = np.empty(uv.shape[:-1] + (3,))
    for index in range(6):
        selected = face == index
        if np.any(selected):
            result[selected] = _bilinear(faces[index], uv[selected], wrap_u=False)
    return result


@lru_cache(maxsize=2)
def _environment_map(mode, size, pattern):
    """只缓存未旋转的基准图，调用者只能通过不修改数组的查询函数读取。"""
    image = (
        build_latlong(2 * size, size, pattern=pattern)
        if mode == "latlong"
        else build_cubemap(size, pattern=pattern)
    )
    image.flags.writeable = False
    return image


def camera_rays(size, eye=(3, 2, 5), target=(0, 0, 0), up=(0, 1, 0), fov=45):
    """真实针孔像素中心射线 (size,size,3)，y 向上、数组行向下；fov 用度。"""
    size = _size(size, "图像边长")
    if not np.isscalar(fov) or not np.isfinite(fov) or not 0 < fov < 180:
        raise ValueError("垂直 fov 必须在 (0,180) 度之间")
    view = _camera.look_at(eye, target, up)
    y, x = np.mgrid[:size, :size]
    tangent = np.tan(np.deg2rad(fov) / 2)
    local = np.stack(
        [
            (2 * (x + 0.5) / size - 1) * tangent,
            (1 - 2 * (y + 0.5) / size) * tangent,
            -np.ones_like(x),
        ],
        axis=-1,
    )
    return normalize(local @ view[:3, :3])


def render_sphere(
    size=256,
    eye=(3, 2, 5),
    target=(0, 0, 0),
    up=(0, 1, 0),
    fov=45,
    center=(0, 0, 0),
    radius=1,
    env_yaw=0,
    mode="latlong",
    map_size=128,
    pattern="studio",
):
    """针孔眼射线 + 解析球求交 + 理想镜面方向查询，无局部光源或粗糙度。

    mode 为 analytic/latlong/cube；map_size=N 表示经纬图 H=N,W=2N，
    或每个立方体面的边长 N。环境在无限远，只有查询方向、没有位置视差。
    返回 image/mask 与实际几何缓冲。incident 是全屏有效单位眼射线；
    points/normals/reflected 在未命中处置零。lookup_direction 将世界方向
    （背景眼射线或球面反射）乘 R_y(−env_yaw)，得到环境局部方向；
    uv/face/face_uv 是它在 yaw=0 基准图中的真实查询地址。
    输出不含 NaN 或无穷大。
    """
    if mode not in ("analytic", "latlong", "cube"):
        raise ValueError("mode 必须为 analytic、latlong 或 cube")
    map_size = _size(map_size, "环境分辨率")
    eye, center = _array(eye, 3, "相机位置"), _array(center, 3, "球心")
    if eye.shape != (3,) or center.shape != (3,):
        raise ValueError("相机位置与球心必须各是一个三维点")
    if not np.isscalar(radius) or not np.isfinite(radius) or radius <= 0:
        raise ValueError("球半径必须是有限正数")
    incident = camera_rays(size, eye, target, up, fov)
    offset = eye - center
    h = np.sum(incident * offset, axis=-1)
    c = np.dot(offset, offset) - radius**2
    discriminant = h * h - c
    root = np.sqrt(np.maximum(discriminant, 0))
    # q 形式避免远处球体的近根由两个几乎相等的数相减得到。
    q = -h - np.copysign(root, h)
    other = np.divide(c, q, out=np.zeros_like(q), where=q != 0)
    near, far = np.minimum(q, other), np.maximum(q, other)
    distance = np.where(near > 0, near, far)
    mask = (discriminant >= 0) & (distance > 0)
    points, normals, reflected = (np.zeros_like(incident) for _ in range(3))
    points[mask] = eye + distance[mask, None] * incident[mask]
    normals[mask] = normalize(points[mask] - center)
    reflected[mask] = reflect(incident[mask], normals[mask])
    query = incident.copy()
    query[mask] = reflected[mask]
    lookup_direction = environment_local_direction(query, env_yaw)
    uv = direction_to_latlong(lookup_direction)
    face, face_uv = direction_to_cube(lookup_direction)
    if mode == "analytic":
        image = analytic_environment(lookup_direction, pattern=pattern)
    elif mode == "latlong":
        image = sample_latlong(_environment_map(mode, map_size, pattern), uv)
    else:
        image = sample_cubemap(
            _environment_map(mode, map_size, pattern), lookup_direction
        )
    return dict(
        image=image,
        mask=mask,
        points=points,
        normals=normals,
        incident=incident,
        reflected=reflected,
        lookup_direction=lookup_direction,
        uv=uv,
        face=face,
        face_uv=face_uv,
    )
