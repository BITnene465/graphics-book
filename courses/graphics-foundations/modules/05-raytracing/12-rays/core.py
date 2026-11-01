"""确定性基础光线追踪：解析求交、点光阴影与有限镜面反射，没有随机采样。"""

import importlib.util
from pathlib import Path

import numpy as np


def _load(name, relative):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[2] / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_camera = _load('ray_camera', '01-images-and-space/03-camera/core.py')
_rasterize = _load('ray_raster', '04-shadows-and-geometry/09-shadows/core.py').rasterize_world
CENTERS, RADII = np.array([[-.95, .8, 0], [1, .7, -.5]]), np.array([.8, .7])
MATERIALS = np.array([[.16, .34, .43], [.65, .20, .08], [.57, .58, .44]])
MIRRORS = np.array([.65, .08, .20])
EYE, TARGET, FOV = np.array([4., 2.5, 6.]), np.array([0., .65, 0.]), 42.


def normalize(vector):
    vector = np.asarray(vector, float)
    length = np.linalg.norm(vector, axis=-1, keepdims=True)
    if not np.isfinite(vector).all() or np.any(length == 0):
        raise ValueError('方向必须有限且非零')
    return vector / length


def reflect(direction, normal):
    """normal 必须是单位向量；不要求 direction 已归一化。"""
    direction, normal = np.asarray(direction, float), np.asarray(normal, float)
    return direction - 2*np.sum(direction*normal, axis=-1, keepdims=True)*normal


def sphere_roots(origin, direction, center, radius):
    """返回按大小排序的两个参数根；无交点记 (+∞,+∞)，支持批量射线。

    a=dot(d,d) 不可省略：非单位方向仍须得到正确参数。
    用 q 形式减少 -h 与 sqrt 相消；切线 q=0 时单独取重根。
    """
    origin, direction, center = np.asarray(origin, float), np.asarray(direction, float), np.asarray(center, float)
    if not np.isfinite(origin).all() or not np.isfinite(direction).all() or not np.isfinite(center).all() or not np.isfinite(radius) or radius <= 0:
        raise ValueError('球与射线参数必须有限，半径必须为正')
    oc = origin-center
    a, h, c = np.sum(direction*direction, axis=-1), np.sum(oc*direction, axis=-1), np.sum(oc*oc, axis=-1)-radius**2
    if np.any(a == 0):
        raise ValueError('射线方向不能为零')
    discriminant = h*h-a*c
    root = np.sqrt(np.maximum(discriminant, 0))
    q = -h-np.copysign(root, h)
    second = np.divide(c, q, out=np.zeros_like(q), where=q != 0)
    roots = np.sort(np.stack((q/a, second), axis=-1), axis=-1)
    return np.where((discriminant >= 0)[..., None], roots, np.inf)


def plane_t(origin, direction, point=(0, 0, 0), normal=(0, 1, 0)):
    """平面解析交点参数；平行（含共面）不产生唯一交点，返回 +∞。"""
    origin, direction = np.asarray(origin, float), np.asarray(direction, float)
    normal = normalize(normal)
    numerator, denominator = np.sum((np.asarray(point)-origin)*normal, axis=-1), np.sum(direction*normal, axis=-1)
    return np.divide(numerator, denominator, out=np.full_like(denominator, np.inf), where=denominator != 0)


def nearest_hit(origins, directions, t_min=1e-5, t_max=np.inf, *, centers=None, radii=None):
    """场景中最近的 t_min <= t <= t_max；+∞ / id=-1 表示未命中。

    三个物体 id=0/1 为球，id=2 为 |x|,|z|<=5 的方形地面。
    可显式传入两个球心和半径；不修改全局场景，多个演示实例互不影响。
    """
    origins, directions = np.broadcast_arrays(np.atleast_2d(origins).astype(float), np.atleast_2d(directions).astype(float))
    if np.any(np.asarray(t_min) < 0) or np.any(np.asarray(t_max) < t_min):
        raise ValueError('要求 0 <= t_min <= t_max')
    centers = CENTERS if centers is None else np.asarray(centers, float)
    radii = RADII if radii is None else np.asarray(radii, float)
    if centers.shape != (2, 3) or radii.shape != (2,) or not np.isfinite(centers).all() or not np.isfinite(radii).all() or np.any(radii <= 0):
        raise ValueError("需要两个有限球心和两个正半径")
    candidates = []
    for center, radius in zip(centers, radii):
        roots = sphere_roots(origins, directions, center, radius)
        legal = (roots >= np.asarray(t_min)[..., None]) & (roots <= np.asarray(t_max)[..., None])
        candidates.append(np.min(np.where(legal, roots, np.inf), axis=-1))
    ground_t = plane_t(origins, directions)
    ground_point = origins + np.where(np.isfinite(ground_t), ground_t, 0)[:, None]*directions
    legal = (ground_t >= t_min) & (ground_t <= t_max) & (np.abs(ground_point[:, [0, 2]]) <= 5).all(axis=1)
    candidates.append(np.where(legal, ground_t, np.inf))
    candidates = np.stack(candidates, axis=-1)
    owner, t = np.argmin(candidates, axis=-1), np.min(candidates, axis=-1)
    owner = np.where(np.isfinite(t), owner, -1)
    points = origins + np.where(np.isfinite(t), t, 0)[:, None]*directions
    normals = np.tile([0., 1., 0.], (len(points), 1))
    for index in range(2):
        selected = owner == index
        normals[selected] = (points[selected]-centers[index])/radii[index]
    normals[owner < 0] = 0
    return dict(t=t, owner=owner, point=points, normal=normals)


def camera_rays(size, *, eye=EYE, target=TARGET, up=(0, 1, 0), fov=FOV):
    """经过每个像素中心的单位方向；数组行向下，相机看自身 -Z。"""
    if not isinstance(size, (int, np.integer)) or not 1 <= size <= 96:
        raise ValueError('同步教学渲染限制为 1 至 96 像素每轴')
    if not np.isfinite(fov) or not 0 < fov < 180:
        raise ValueError("垂直视野必须位于 (0,180) 度")
    y, x = np.mgrid[:size, :size]
    scale = np.tan(np.deg2rad(fov)/2)
    local = np.stack(((2*(x+.5)/size-1)*scale, (1-2*(y+.5)/size)*scale, -np.ones_like(x)), axis=-1)
    rotation = _camera.look_at(eye, target, up)[:3, :3]
    directions = normalize(local.reshape(-1, 3) @ rotation)
    return np.broadcast_to(eye, directions.shape).copy(), directions


def shadow_hit(points, normals, light, epsilon, *, centers=None, radii=None):
    """只查询偏移起点至点光源之间的线段；空区间没有遮挡命中。"""
    origins = np.atleast_2d(np.asarray(points, float) + epsilon*np.asarray(normals, float))
    delta = np.asarray(light)-origins
    if not np.isfinite(delta).all() or not np.isfinite(epsilon) or epsilon < 0:
        raise ValueError('阴影线段必须有限，epsilon 必须非负')
    distance = np.linalg.norm(delta, axis=-1)
    direction = np.zeros_like(delta)
    nonzero = distance > 0
    direction[nonzero] = normalize(delta[nonzero])
    hit = dict(t=np.full(len(origins), np.inf), owner=np.full(len(origins), -1, dtype=int),
               point=origins.copy(), normal=np.zeros_like(origins))
    # 不能为满足 t_min <= t_max 而延长线段，否则会越过近处的光源。
    t_max = distance-epsilon
    valid = nonzero & (t_max >= epsilon)
    if np.any(valid):
        for key, values in nearest_hit(origins[valid], direction[valid], epsilon, t_max[valid], centers=centers, radii=radii).items():
            hit[key][valid] = values
    return hit, origins, direction, distance


def material_parameters(materials=None, mirrors=None, specular=0, shininess=48):
    """三个物体的线性 RGB、镜面混合权重及教学 Phong 参数。

    默认为原实验的漫反射材质；调用者可传数组，不修改全局常量。
    Phong 高光是局部点光响应，mirrors 是另一条射线的混合权重。
    """
    materials = np.array(MATERIALS if materials is None else materials, dtype=float)
    mirrors = np.array(MIRRORS if mirrors is None else mirrors, dtype=float)
    if materials.shape != (3, 3) or not np.isfinite(materials).all() or np.any((materials < 0) | (materials > 1)):
        raise ValueError('三个物体各需三个 [0,1] 线性颜色分量')
    if mirrors.shape != (3,) or not np.isfinite(mirrors).all() or np.any((mirrors < 0) | (mirrors > .95)):
        raise ValueError('三个物体的反射权重必须在 [0,.95]')
    if not np.isfinite(specular) or not 0 <= specular <= 1 or not np.isfinite(shininess) or not 1 <= shininess <= 256:
        raise ValueError('高光系数在 [0,1]，Phong 指数在 [1,256]')
    return materials, mirrors


def _local_color(hit, light, epsilon, *, centers=None, radii=None, materials=MATERIALS,
                 view=None, specular=0, shininess=48):
    owner, point, normal = hit['owner'], hit['point'], hit['normal']
    to_light = normalize(np.asarray(light)-point)
    blocker, _, _, _ = shadow_hit(point, normal, light, epsilon, centers=centers, radii=radii)
    base = materials[owner].copy()
    checkers = (np.floor(point[:, 0])+np.floor(point[:, 2])).astype(int) % 2 == 0
    base[(owner == 2) & checkers] *= .55
    diffuse = np.maximum(np.sum(normal*to_light, axis=-1), 0)
    visible = blocker['owner'] < 0
    # 教学点光：方向和有限阴影线段正确；强度恒定，不含距离衰减。
    local = base*(.12 + .88*diffuse*visible)[:, None]
    if specular and view is not None:
        # Phong：先反射入射光 -l，再看该方向与观察方向 v 的夹角。
        alignment = np.maximum(np.sum(reflect(-to_light, normal)*view, axis=-1), 0)
        highlight = specular*alignment**shininess*visible*(diffuse > 0)
        local += highlight[:, None]
    return local


def trace(origins, directions, light=(-3, 5, 4), bounces=2, epsilon=1e-4, *, centers=None, radii=None,
          materials=None, mirrors=None, specular=0, shininess=48):
    """批量确定性镜面链；允许一个起点或方向广播到整批射线。"""
    if not isinstance(bounces, (int, np.integer)) or not 0 <= bounces <= 3 or not np.isfinite(epsilon) or not 0 <= epsilon <= .05:
        raise ValueError('反射预算 0 至 3 次，epsilon 在 [0,.05]')
    materials, mirrors = material_parameters(materials, mirrors, specular, shininess)
    origins, directions = np.broadcast_arrays(np.atleast_2d(origins).astype(float),
                                             normalize(np.atleast_2d(directions)))
    color, throughput = np.zeros_like(origins), np.ones(len(origins))
    active = np.arange(len(origins))
    for bounce in range(bounces+1):
        if not len(active):
            break
        hit = nearest_hit(origins, directions, epsilon, centers=centers, radii=radii)
        found = hit['owner'] >= 0
        sky = .65*np.array([.64, .76, .83])
        color[active[~found]] += throughput[~found, None]*sky
        visible = {key: value[found] for key, value in hit.items()}
        mirror = mirrors[visible['owner']] if bounce < bounces else np.zeros(np.sum(found))
        color[active[found]] += (throughput[found]*(1-mirror))[:, None]*_local_color(visible, light, epsilon, centers=centers, radii=radii, materials=materials, view=-directions[found], specular=specular, shininess=shininess)
        reflected = normalize(reflect(directions[found], visible['normal']))
        origins = visible['point'] + epsilon*visible['normal']
        directions = reflected
        throughput, active = throughput[found]*mirror, active[found]
        keep = throughput > 1e-6
        origins, directions, throughput, active = origins[keep], directions[keep], throughput[keep], active[keep]
    return np.clip(color, 0, 1)


def render_image(size=64, light=(-3, 5, 4), bounces=2, epsilon=1e-4, *, centers=None, radii=None,
                 eye=EYE, target=TARGET, up=(0,1,0), fov=FOV,
                 materials=None, mirrors=None, specular=0, shininess=48):
    origins, directions = camera_rays(size, eye=eye, target=target, up=up, fov=fov)
    hit = nearest_hit(origins, directions, epsilon, centers=centers, radii=radii)
    color = trace(origins, directions, light, bounces, epsilon, centers=centers, radii=radii, materials=materials, mirrors=mirrors, specular=specular, shininess=shininess).reshape(size, size, 3)
    normal = np.where((hit['owner'] >= 0)[:, None], (hit['normal']+1)/2, [.9, .94, .88]).reshape(size, size, 3)
    distance = np.where(np.isfinite(hit['t']), np.minimum(hit['t']/15, 1), 1).reshape(size, size)
    return dict(color=color, normal=normal, distance=distance, hit=hit, directions=directions)


def trace_path(origin, direction, light=(-3, 5, 4), bounces=2, epsilon=1e-4, *, centers=None, radii=None,
               materials=None, mirrors=None, specular=0, shininess=48):
    """一条射线的逐步解释，沿用 trace 的几何、材质和提前停止条件。"""
    if not isinstance(bounces, (int, np.integer)) or not 0 <= bounces <= 3 or not np.isfinite(epsilon) or not 0 <= epsilon <= .05:
        raise ValueError('解释图沿用 0 至 3 次反射和有限 epsilon 预算')
    materials, mirrors = material_parameters(materials, mirrors, specular, shininess)
    origin, direction = np.asarray(origin, float), normalize(direction)
    steps, throughput = [], 1.
    for bounce in range(bounces+1):
        hit = nearest_hit(origin, direction, epsilon, centers=centers, radii=radii)
        item = dict(bounce=bounce, origin=origin.copy(), direction=direction.copy(), t=hit['t'][0],
                    owner=int(hit['owner'][0]), throughput=float(throughput))
        if item['owner'] < 0:
            item.update(end=origin+8*direction, contribution=throughput*.65*np.array([.64, .76, .83]))
            steps.append(item)
            break
        point, normal = hit['point'][0], hit['normal'][0]
        blocker, start, shadow_dir, length = shadow_hit(point[None, :], normal[None, :], light, epsilon, centers=centers, radii=radii)
        shadow_t = min(blocker['t'][0], length[0])
        mirror = float(mirrors[item['owner']]) if bounce < bounces else 0.
        local = _local_color(hit, light, epsilon, centers=centers, radii=radii, materials=materials,
                             view=-direction[None, :], specular=specular, shininess=shininess)[0]
        item.update(end=point, normal=normal, reflected=normalize(reflect(direction, normal)),
                    shadow_start=start[0], shadow_end=start[0]+shadow_t*shadow_dir[0],
                    shadow_owner=int(blocker['owner'][0]), shadow_t=float(blocker['t'][0]), light_distance=float(length[0]),
                    reflectivity=float(mirrors[item['owner']]), continuation_weight=mirror,
                    local_color=local, contribution=throughput*(1-mirror)*local)
        steps.append(item)
        throughput *= mirror
        if throughput <= 1e-6:
            break
        origin, direction = point+epsilon*normal, item['reflected']
    return steps


def trace_pixel(size, row, col, light=(-3, 5, 4), bounces=2, epsilon=1e-4, *, centers=None, radii=None,
                eye=EYE, target=TARGET, up=(0,1,0), fov=FOV,
                materials=None, mirrors=None, specular=0, shininess=48):
    """与渲染使用同一求交函数；返回主/反射线段、阴影线段及逐步数值。"""
    if not 0 <= row < size or not 0 <= col < size:
        raise ValueError('像素行列越界')
    origins, directions = camera_rays(size, eye=eye, target=target, up=up, fov=fov)
    return trace_path(origins[row*size+col], directions[row*size+col], light, bounces, epsilon,
                      centers=centers, radii=radii, materials=materials, mirrors=mirrors,
                      specular=specular, shininess=shininess)


def raster_comparison(size=64, segments=12):
    """同相机同场景的真实光栅化法线图；解析球改为三角网格，显式暴露近似。"""
    if not isinstance(size, (int, np.integer)) or not 1 <= size <= 96 or segments not in (8, 12, 20):
        raise ValueError('对照预算：每轴最多 96 像素，球经向分段为 8、12 或 20')
    triangles = [[[-5, 0, -5], [5, 0, 5], [5, 0, -5]], [[-5, 0, -5], [-5, 0, 5], [5, 0, 5]]]
    for center, radius in zip(CENTERS, RADII):
        theta, phi = np.meshgrid(np.linspace(0, np.pi, segments//2+1), np.linspace(0, 2*np.pi, segments+1), indexing='ij')
        grid = center+radius*np.stack((np.sin(theta)*np.cos(phi), np.cos(theta), np.sin(theta)*np.sin(phi)), axis=-1)
        for i in range(segments//2):
            for j in range(segments):
                for vertices in [[grid[i, j], grid[i+1, j], grid[i+1, j+1]], [grid[i, j], grid[i+1, j+1], grid[i, j+1]]]:
                    vertices = np.array(vertices)
                    n = np.cross(vertices[1]-vertices[0], vertices[2]-vertices[0])
                    if np.linalg.norm(n) < 1e-12:
                        continue
                    if n @ (vertices.mean(axis=0)-center) < 0:
                        vertices = vertices[[0, 2, 1]]
                    triangles.append(vertices)
    matrix = _camera.perspective(FOV, 1, .1, 100) @ _camera.look_at(EYE, TARGET)
    result = _rasterize(np.array(triangles), matrix, size)
    normal = np.where((result['owner'] >= 0)[..., None], (result['normal']+1)/2, [.9, .94, .88])
    return dict(normal=normal, triangles=len(triangles))
