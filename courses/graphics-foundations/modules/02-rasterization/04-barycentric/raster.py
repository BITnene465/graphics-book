"""从边函数到像素；无界面依赖。几何 y 向上，返回数组行号向下。

屏幕顶点统一量化到 1/256 像素，然后用整数边函数判定共享边。
这会轻微改变几何，但使相同端点的共享边有一致、无 epsilon 的归属。
"""
import numpy as np

SUBPIXEL = 256
CLIP_PLANES = np.array([[1, 0, 0, 1], [-1, 0, 0, 1], [0, 1, 0, 1],
                        [0, -1, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1]], dtype=float)


def edge_function(a, b, points):
    """E_AB(P)=(B-A)×(P-A)；正数表示 P 在有向边 AB 左侧。"""
    a, b, p = np.asarray(a), np.asarray(b), np.asarray(points)
    return (b[0] - a[0]) * (p[..., 1] - a[1]) - (b[1] - a[1]) * (p[..., 0] - a[0])


def top_left(a, b):
    """y 向上、内部在左：向下的边或向左的水平边包含零边函数。"""
    dx, dy = np.asarray(b) - np.asarray(a)
    return bool(dy < 0 or (dy == 0 and dx < 0))


def snap_vertices(vertices):
    """返回子像素整数坐标。1e6 的上限保证本章整数边函数不溢出。"""
    vertices = np.asarray(vertices, dtype=float)
    if vertices.shape != (3, 2) or not np.isfinite(vertices).all() or (np.abs(vertices) > 1e6).any():
        raise ValueError("屏幕顶点需要形状 (3,2)，有限且绝对值不超过 1e6")
    return np.rint(vertices * SUBPIXEL).astype(np.int64)


def triangle_coverage(vertices, points, rule="top_left"):
    """任意像素中心 → (覆盖布尔数组, 原顶点顺序的重心权重)。

    points 形状 (...,2)。退化三角形不覆盖任何样本，权重为 NaN。
    rule='inclusive' 故意包含所有边，供观察共享边重复覆盖。
    """
    if rule not in ("top_left", "inclusive"):
        raise ValueError("rule 必须为 top_left 或 inclusive")
    q, p = snap_vertices(vertices), np.asarray(points, dtype=float)
    if p.ndim < 1 or p.shape[-1] != 2 or not np.isfinite(p).all() or (np.abs(p) > 1e6).any():
        raise ValueError("样本需要 (...,2) 的有限坐标，绝对值不超过 1e6")
    p = np.rint(p * SUBPIXEL).astype(np.int64)
    area = edge_function(q[0], q[1], q[2])
    if area == 0:
        return np.zeros(p.shape[:-1], dtype=bool), np.full(p.shape[:-1] + (3,), np.nan)
    edges = [(q[1], q[2]), (q[2], q[0]), (q[0], q[1])]
    if area < 0:
        edges = [(b, a) for a, b in edges]  # 仅反向边，不重排权重对应的顶点。
    values = np.stack([edge_function(a, b, p) for a, b in edges], axis=-1)
    included = [rule == "inclusive" or top_left(a, b) for a, b in edges]
    mask = np.all((values > 0) | ((values == 0) & included), axis=-1)
    return mask, values / abs(area)


def pixel_bounds(vertices, width, height):
    """返回候选整数像素的半开包围盒 (x0,x1,y0,y1)，几何 y 向上。"""
    if any(not isinstance(n, (int, np.integer)) or not 1 <= n <= 4096 for n in (width, height)):
        raise ValueError("图像尺寸必须为 1 至 4096 的整数")
    q = snap_vertices(vertices) / SUBPIXEL
    lower = np.ceil(q.min(axis=0) - .5).astype(int)
    upper = np.floor(q.max(axis=0) - .5).astype(int) + 1
    lower = np.clip(lower, [0, 0], [width, height])
    upper = np.clip(upper, [0, 0], [width, height])
    return int(lower[0]), int(upper[0]), int(lower[1]), int(upper[1])


def rasterize_triangle(vertices, width, height, rule="top_left"):
    """→ (rows[N], cols[N], weights[N,3])。只枚举包围盒内被覆盖的中心。"""
    x0, x1, y0, y1 = pixel_bounds(vertices, width, height)
    x, y = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
    points = np.stack([x + .5, y + .5], axis=-1)
    mask, weights = triangle_coverage(vertices, points, rule)
    return height - 1 - y[mask], x[mask], weights[mask]


def clip_polygon(vertices_clip, attributes=None):
    """六个齐次半空间逐面裁剪，返回 (多边形顶点[M,4], 属性[M,K]或None)。

    属性在交点处按同一线段参数插值；不要预先除以 w。空结果是正常情况。
    属性要求 (N,K)；标量属性也保留一列，便于颜色/UV/法线共用接口。
    """
    vertices = np.asarray(vertices_clip, dtype=float)
    if vertices.ndim != 2 or vertices.shape[1] != 4 or not np.isfinite(vertices).all():
        raise ValueError("裁剪顶点需要有限的 (N,4) 齐次坐标")
    attrs = np.empty((len(vertices), 0)) if attributes is None else np.asarray(attributes, dtype=float)
    if attrs.ndim != 2 or len(attrs) != len(vertices) or not np.isfinite(attrs).all():
        raise ValueError("属性需要与顶点对齐的有限 (N,K) 数组")
    for plane in CLIP_PLANES:
        output, output_attrs = [], []
        for i in range(len(vertices)):
            a, b = vertices[i - 1], vertices[i]
            aa, ab = attrs[i - 1], attrs[i]
            da, db = float(a @ plane), float(b @ plane)
            if (da >= 0) != (db >= 0):
                # 相邻三角形反向遍历同一条边时，采用相同的运算次序。
                if tuple(a) > tuple(b):
                    a, b, aa, ab, da, db = b, a, ab, aa, db, da
                t = da / (da - db)
                point = (1 - t) * a + t * b
                axis = int(np.flatnonzero(plane[:3])[0])
                point[axis] = -plane[axis] * point[3]  # 精确落在当前裁剪平面上。
                output.append(point)
                output_attrs.append((1 - t) * aa + t * ab)
            if float(vertices[i] @ plane) >= 0:
                output.append(vertices[i])
                output_attrs.append(attrs[i])
        vertices = np.asarray(output, dtype=float).reshape(-1, 4)
        attrs = np.asarray(output_attrs, dtype=float).reshape(len(output), attrs.shape[1])
        # 顶点恰落在平面上时可能重复；只去掉相邻重复，不改变多边形顺序。
        if len(vertices) > 1:
            keep = np.any(vertices != np.roll(vertices, 1, axis=0), axis=1)
            vertices, attrs = vertices[keep], attrs[keep]
    return vertices, None if attributes is None else attrs


def triangulate_fan(vertices, attributes=None):
    """凸多边形拆成 (v0,vi,vi+1)，返回 (T,3,D) 顶点与 (T,3,K) 属性。"""
    vertices = np.asarray(vertices, dtype=float)
    if vertices.ndim != 2:
        raise ValueError("顶点需要二维数组")
    indices = np.array([(0, i, i + 1) for i in range(1, len(vertices) - 1)], dtype=int).reshape(-1, 3)
    attrs = None if attributes is None else np.asarray(attributes, dtype=float)[indices]
    return vertices[indices], attrs


def clip_triangle(vertices_clip, attributes=None):
    """→ (triangles[T,3,4], attributes[T,3,K]或None)；先裁剪，再扇形三角化。"""
    if np.asarray(vertices_clip).shape != (3, 4):
        raise ValueError("一个三角形必须含三个齐次顶点")
    return triangulate_fan(*clip_polygon(vertices_clip, attributes))


def clip_to_screen(vertices_clip, width, height):
    """→ (xy[...,2], z_ndc[...], inv_w[...])；应在裁剪后调用。"""
    vertices = np.asarray(vertices_clip, dtype=float)
    if vertices.ndim < 1 or vertices.shape[-1] != 4 or not np.isfinite(vertices).all() or np.any(vertices[..., 3] <= 0):
        raise ValueError("透视除法需要有限齐次坐标和正的 w")
    inv_w = 1 / vertices[..., 3]
    ndc = vertices[..., :3] * inv_w[..., None]
    xy = (ndc[..., :2] + 1) * np.array([width, height]) / 2
    return xy, ndc[..., 2], inv_w
