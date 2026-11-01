"""方向 → 纹理地址；观察方向和法线 → 镜面查询方向。

NumPy 与 core.py 完成全部数学和图像；浏览器只显示图元、传回拖柄。
两图注册时 animated=False。经纬图和立方体面的 v 都采用图像向下。
"""

from functools import lru_cache

import numpy as np


WHITE, MUTED, BLUE, GREEN, YELLOW, RED = (
    "#e8edf6",
    "#687c96",
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#f38c98",
)
DIRECTION_DEFAULTS = dict(uv=[0.12, 0.38], pattern="studio")
REFLECTION_DEFAULTS = dict(normal=[0.3, 1.0], eye=[-0.8, 0.8], pattern="studio")


@lru_cache(maxsize=4)
def _maps(core, pattern):
    """同一连续方向函数的两种存储；固定分辨率使拖动只改变查询。"""
    return (
        core.build_latlong(width=256, height=128, pattern=pattern),
        core.build_cubemap(size=96, pattern=pattern),
    )


def _border(d, x, y, width, height, color=MUTED, thickness=1):
    d.line(
        [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]],
        color,
        thickness,
    )


def _map_point(uv, x, y, width, height):
    """图像 UV 的 v 向下，Drawing 的 y 向上。"""
    return np.array([x + width * uv[0], y + height * (1 - uv[1])])


def _panorama(d, image, encode, uv, x, y, width, *, draggable=False):
    height = width / 2
    d.image([x, y], [width, height], encode(image))
    _border(d, x, y, width, height)
    at = _map_point(uv, x, y, width, height)
    d.line([[at[0], y], [at[0], y + height]], YELLOW, 0.9, 0.7)
    d.line([[x, at[1]], [x + width, at[1]]], YELLOW, 0.9, 0.7)
    if draggable:
        d.handle(at, "uv", "方向 UV", limits=[0, 1, 0, 1])
        d.handles[-1]["mapping"] = dict(scale=[width, -height], offset=[x, y + height])
    else:
        d.dot(at, YELLOW, 0.06)
    # u=0 与 u=1 是同一条经线；端点探针同时标出另一侧。
    if uv[0] == 0 or uv[0] == 1:
        other = _map_point([1 - uv[0], uv[1]], x, y, width, height)
        d.dot(other, YELLOW, 0.06)


def _sphere(d, direction, core, center, radius):
    """固定正交投影；背半球网线与查询箭头用虚线明确标识。"""
    center = np.asarray(center, float)
    right = np.array([1, 0, -1]) / np.sqrt(2)
    up = np.array([-1, 2, -1]) / np.sqrt(6)
    front = np.array([1, 1, 1]) / np.sqrt(3)
    projection = np.stack([right, up])

    def project(points):
        return center + radius * (np.asarray(points) @ projection.T)

    def wire(points, color=MUTED, width=0.8):
        points = np.asarray(points)
        visible = points @ front >= 0
        # 连续的可见/背面片段各画一次，避免逐线段扩大 payload。
        changes = np.flatnonzero(visible[1:] != visible[:-1]) + 1
        for indices in np.split(np.arange(len(points)), changes):
            start, stop = indices[0], min(indices[-1] + 2, len(points))
            d.line(
                project(points[start:stop]),
                color,
                width,
                0.85 if visible[start] else 0.35,
                not bool(visible[start]),
            )

    u = np.linspace(0, 1, 145)
    v = np.linspace(0, 1, 97)
    for longitude in np.arange(0, 1, 0.125):
        wire(
            core.latlong_to_direction(np.column_stack([np.full_like(v, longitude), v]))
        )
    for latitude in (0.25, 0.5, 0.75):
        wire(core.latlong_to_direction(np.column_stack([u, np.full_like(u, latitude)])))
    latitude = core.direction_to_latlong(direction)[1]
    wire(
        core.latlong_to_direction(np.column_stack([u, np.full_like(u, latitude)])),
        YELLOW,
        1.5,
    )
    angle = np.linspace(0, 2 * np.pi, 145)
    d.line(center + radius * np.column_stack([np.cos(angle), np.sin(angle)]), WHITE, 1)
    for axis, name in zip(np.eye(3), ("+X", "+Y", "+Z")):
        end = project(axis * 1.22)
        d.arrow(center, end, MUTED)
        d.text(end + [0.04, 0.07], name, WHITE, 11)
    end = project(direction)
    if np.dot(direction, front) >= 0:
        d.arrow(center, end, YELLOW)
    else:
        d.line([center, end], YELLOW, 2, 1, True)
    d.dot(end, YELLOW, 0.055)


def environment_direction(p, t, Drawing, core, encode):
    """拖经纬图探针，联动三维方向和主轴选面的地址。"""
    uv = np.clip(np.asarray(p["uv"], float), 0, 1)
    pattern = p["pattern"]
    direction = core.latlong_to_direction(uv)
    face, face_uv = core.direction_to_cube(direction)
    face = int(face)
    panorama, faces = _maps(core, pattern)
    d = Drawing((-0.3, 10.55, -5.15, 4.85))
    with d.panel("panorama", (-0.25, 6.5, 0, 4.8)):
        d.text([0, 4.38], "经纬图 · 拖动黄色探针", YELLOW, 14)
        _panorama(d, panorama, encode, uv, 0, 0.95, 6, draggable=True)
        d.text([0, 0.57], "u → 周期经度；v ↓ 北极到南极", MUTED, 11)
        d.text([0, 0.18], f"u = {uv[0]:.3f}    v = {uv[1]:.3f}", WHITE, 12)
    with d.panel("direction-sphere", (6.65, 10.5, 0, 4.8)):
        d.text([6.86, 4.38], "同一方向 · 单位球", WHITE, 14)
        _sphere(d, direction, core, [8.52, 2.28], 1.24)
        d.text([6.86, 0.63], "虚线在背面 · 黄圈为纬线", MUTED, 11)
        d.text(
            [6.86, 0.22],
            f"相对立体角 = sin(πv) = {np.sin(np.pi * uv[1]):.3f}",
            YELLOW,
            11,
        )
    with d.panel("cube-atlas", (-0.25, 6.5, -5.15, 0)):
        d.text([0, -0.40], "六个面 · 按世界轴命名", WHITE, 14)
        for index, name in enumerate(core.FACE_NAMES):
            column, row = index % 3, index // 3
            x, y, size = column * 2.12, -2.63 - row * 2.25, 1.66
            d.image([x, y], [size, size], encode(faces[index]))
            _border(
                d,
                x,
                y,
                size,
                size,
                YELLOW if index == face else MUTED,
                2 if index == face else 0.8,
            )
            d.text([x, y + size + 0.14], name, YELLOW if index == face else WHITE, 12)
            if index == face:
                d.dot(_map_point(face_uv, x, y, size, size), YELLOW, 0.045)
    with d.panel("selected-face", (6.65, 10.5, -5.15, 0)):
        d.text([6.86, -0.40], f"选中面 {core.FACE_NAMES[face]} · 面内 UV", YELLOW, 14)
        x, y, size = 6.93, -3.86, 3.10
        d.image([x, y], [size, size], encode(faces[face]))
        _border(d, x, y, size, size, YELLOW, 1.5)
        at = _map_point(face_uv, x, y, size, size)
        d.line([[at[0], y], [at[0], y + size]], YELLOW, 0.8)
        d.line([[x, at[1]], [x + size, at[1]]], YELLOW, 0.8)
        d.dot(at, YELLOW, 0.05)
        d.text(
            [6.86, -4.27], f"u꜀ = {face_uv[0]:.3f}    v꜀ = {face_uv[1]:.3f}", WHITE, 12
        )
        d.text([6.86, -4.69], "面内 u →，v ↓；边界会换面", MUTED, 11)
    d.formula = (
        r"\begin{aligned}"
        r"\phi&=2\pi u,\quad\theta=\pi v\\"
        r"\mathbf d&=(\sin\theta\cos\phi,\cos\theta,\sin\theta\sin\phi)\\"
        r"d\omega&=2\pi^2\sin(\pi v)\,du\,dv"
        r"\end{aligned}"
    )
    d.values = {
        "经纬 UV（v 向下）": np.round(uv, 5).tolist(),
        "单位方向 [x,y,z]": np.round(direction, 6).tolist(),
        "经度 φ / 极角 θ（°）": np.round(uv * [360, 180], 4).tolist(),
        "立方体面 / 面内 UV": [core.FACE_NAMES[face], np.round(face_uv, 5).tolist()],
        "单位方向长度": round(float(np.linalg.norm(direction)), 6),
        "面内反算方向最大差": float(
            np.max(np.abs(core.cube_to_direction(face, face_uv) - direction))
        ),
        "同 UV 小格 / 赤道立体角比": round(float(np.sin(np.pi * uv[1])), 6),
        "解析环境线性 RGB": np.round(
            core.analytic_environment(direction, pattern=pattern), 5
        ).tolist(),
        "坐标边界": "极点经度不唯一；u=0 与 1 相接；主轴并列按 X、Y、Z",
    }
    return d


def reflection_lookup(p, t, Drawing, core, encode):
    """世界 XY 平面中的可拖法线/朝眼方向；用一般三维反射式求 R。"""
    normal_raw = np.clip(np.asarray(p["normal"], float), -1.25, 1.25)
    eye_raw = np.clip(np.asarray(p["eye"], float), -1.25, 1.25)
    normal_length, eye_length = np.linalg.norm(normal_raw), np.linalg.norm(eye_raw)
    valid = normal_length > 1e-8 and eye_length > 1e-8
    pattern = p["pattern"]
    panorama, _ = _maps(core, pattern)
    d = Drawing((-0.3, 11.0, -0.55, 4.85))
    origin, scale = np.array([2.0, 2.22]), 1.3
    with d.panel("reflection-geometry", (-0.25, 4.5, -0.5, 4.8)):
        d.text([0, 4.38], "拖法线 N 与朝眼向量 V", WHITE, 14)
        d.text([0, 3.98], "世界 XY 截面 · z = 0", MUTED, 11)
        d.line([origin + [-1.75, 0], origin + [1.75, 0]], MUTED, 0.7, 0.5)
        d.line([origin + [0, -1.75], origin + [0, 1.35]], MUTED, 0.7, 0.5)
        d.text(origin + [1.70, 0.10], "x", MUTED, 11)
        d.text(origin + [0.10, 1.29], "y", MUTED, 11)
        if valid:
            normal = np.r_[normal_raw / normal_length, 0.0]
            view = np.r_[eye_raw / eye_length, 0.0]
            incident = -view
            reflected = core.reflect(incident, normal)
            tangent = np.array([-normal[1], normal[0]])
            d.line([origin - 1.55 * tangent, origin + 1.55 * tangent], WHITE, 2.3)
            d.arrow(origin + scale * eye_raw, origin, BLUE)
            d.arrow(origin, origin + scale * normal_raw, GREEN)
            d.arrow(origin, origin + 1.45 * reflected[:2], YELLOW)
            d.text(origin + 1.45 * reflected[:2] + [0.08, 0.10], "R", YELLOW, 12)
        d.dot(origin, WHITE, 0.045)
        for raw, key, label, color in (
            (normal_raw, "normal", "N 法线", GREEN),
            (eye_raw, "eye", "V 朝眼", BLUE),
        ):
            d.handle(
                origin + scale * raw, key, label, limits=[-1.25, 1.25, -1.25, 1.25]
            )
            d.handles[-1].update(
                mapping=dict(scale=[scale, scale], offset=origin.tolist()), color=color
            )
        d.text([0, 0.16], "蓝箭头 I 指向表面；黄箭头 R 离开", MUTED, 11)
        d.text([0, -0.26], "拖柄只确定方向；计算时单位化", MUTED, 11)
    with d.panel("reflection-address", (4.65, 11.0, 0.4, 4.8)):
        d.text([4.87, 4.38], "反射方向查询经纬图", YELLOW, 14)
        if valid:
            uv = core.direction_to_latlong(reflected)
            _panorama(d, panorama, encode, uv, 4.87, 1.06, 5.70)
            d.text([4.87, 0.64], f"u = {uv[0]:.3f}    v = {uv[1]:.3f}", WHITE, 12)
        else:
            d.image([4.87, 1.06], [5.70, 2.85], encode(panorama))
            d.text([4.87, 0.64], "零向量没有方向；把柄拖离原点", RED, 12)
    with d.panel("reflected-color", (4.65, 11.0, -0.5, 0.4)):
        if valid:
            color = core.analytic_environment(reflected, pattern=pattern)
            d.image([4.87, -0.31], [0.48, 0.48], encode(color[None, None, :]))
            d.text([5.56, -0.08], "C = E(R) · 解析环境颜色", YELLOW, 12)
        else:
            d.text([4.87, -0.08], "本次不输出反射方向与颜色", MUTED, 12)
    d.formula = (
        r"\begin{aligned}"
        r"\mathbf I&=-\widehat{\mathbf V}\\"
        r"\mathbf R&=\mathbf I-2(\mathbf I\cdot\widehat{\mathbf N})\widehat{\mathbf N}\\"
        r"C&=E(\mathbf R)"
        r"\end{aligned}"
    )
    d.values = {"方向有效": bool(valid), "截面约束": "世界 XY 平面，z=0；镜面双面示意"}
    if valid:
        face, face_uv = core.direction_to_cube(reflected)
        d.values.update(
            {
                "单位朝眼方向 V": np.round(view, 6).tolist(),
                "单位法线 N": np.round(normal, 6).tolist(),
                "指向表面的 I": np.round(incident, 6).tolist(),
                "离开表面的 R": np.round(reflected, 6).tolist(),
                "N·V / N·R": np.round(
                    [np.dot(normal, view), np.dot(normal, reflected)], 6
                ).tolist(),
                "反射向量长度": round(float(np.linalg.norm(reflected)), 6),
                "经纬 UV": np.round(uv, 6).tolist(),
                "立方体面 / UV": [
                    core.FACE_NAMES[int(face)],
                    np.round(face_uv, 6).tolist(),
                ],
                "解析环境线性 RGB": np.round(color, 6).tolist(),
            }
        )
    return d
