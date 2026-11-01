"""书页里的数学动画。Python 算坐标与数值，浏览器只画矢量并传回拖动。

每个 @figure 函数就是一个可独立阅读的小例子；t ∈ [0,1] 是播放进度。
颜色只标识数学角色：蓝色 x/输入，绿色 y/结果，黄色当前探针，红色错误比较。
"""

from __future__ import annotations
from contextlib import contextmanager
import inspect
import numpy as np
from pathlib import Path
from studio_render import ROOT, _core, _png

BLUE, GREEN, YELLOW, RED, WHITE, MUTED = (
    "#71b7ff",
    "#76dfb1",
    "#ffdc80",
    "#f38c98",
    "#e8edf6",
    "#687c96",
)
FIGURES = {}


def figure(
    identifier, chapter, title, defaults, controls=(), *, source=None, animated=True
):
    def register(function):
        FIGURES[identifier] = dict(
            id=identifier,
            chapter=chapter,
            title=title,
            defaults=defaults,
            controls=list(controls),
            function=function,
            source=source,
            animated=animated,
        )
        return function

    return register


def choice(key, label, values):
    return dict(
        key=key, label=label, options=[dict(value=v, label=str(v)) for v in values]
    )


def slider(key, label, low, high, step=0.01):
    return dict(key=key, label=label, min=low, max=high, step=step)


class Drawing:
    """统一的小型矢量词汇，不包含绘图框架。所有坐标均为数学坐标（y 向上）。"""

    def __init__(self, bounds=(-4, 4, -2.3, 2.3)):
        self.bounds, self.items, self.handles, self.values = bounds, [], [], {}
        self.panels = []
        self.formula = ""

    @contextmanager
    def panel(self, key, bounds, *, columns=1):
        """标出一幅有独立意义的子图；浏览器可重排，数学坐标与参数不变。

        bounds 与 Drawing 一样是 (xmin, xmax, ymin, ymax)。整个 block
        只增加排版元数据，宽屏仍使用原来的完整构图。columns 可把相邻
        小图在窄屏组成 2 或 3 列；默认一列，避免把细节图挤小。
        """
        if any(panel["key"] == key for panel in self.panels):
            raise ValueError(f"重复子图：{key}")
        a, b, c, d = bounds
        if not np.all(np.isfinite(bounds)) or not (a < b and c < d):
            raise ValueError("子图范围必须有限且有正面积")
        if columns not in (1, 2, 3):
            raise ValueError("子图列数须为 1、2 或 3")
        first_item, first_handle = len(self.items), len(self.handles)
        self.panels.append(dict(key=key, bounds=list(bounds), columns=columns))
        yield self
        for item in self.items[first_item:]:
            item["panel"] = key
        for handle in self.handles[first_handle:]:
            handle["panel"] = key

    def line(self, points, color=MUTED, width=1.4, opacity=1, dash=False):
        self.items.append(
            dict(
                kind="line",
                points=np.asarray(points).tolist(),
                color=color,
                width=width,
                opacity=opacity,
                dash=dash,
            )
        )

    def polygon(self, points, color=BLUE, opacity=0.2):
        self.items.append(
            dict(
                kind="polygon",
                points=np.asarray(points).tolist(),
                color=color,
                opacity=opacity,
            )
        )

    def dot(self, at, color=YELLOW, radius=0.045, opacity=1):
        self.items.append(
            dict(
                kind="circle",
                at=np.asarray(at).tolist(),
                radius=radius,
                color=color,
                opacity=opacity,
            )
        )

    def text(self, at, text, color=WHITE, size=14):
        self.items.append(
            dict(
                kind="text",
                at=np.asarray(at).tolist(),
                text=str(text),
                color=color,
                size=size,
            )
        )

    def image(self, at, size, url, *, pixelated=False):
        """at 是图像左下角；Python 已完成颜色编码，浏览器只摆放像素。"""
        self.items.append(
            dict(
                kind="image", at=list(at), size=list(size), url=url, pixelated=pixelated
            )
        )

    def arrow(self, start, end, color=BLUE, label=None):
        start, end = np.asarray(start, float), np.asarray(end, float)
        self.line([start, end], color, 2.7)
        d = end - start
        if np.linalg.norm(d) > 1e-6:
            d = d / np.linalg.norm(d)
            n = np.array([-d[1], d[0]])
            self.polygon(
                [end, end - 0.13 * d + 0.055 * n, end - 0.13 * d - 0.055 * n], color, 1
            )
        if label:
            self.text(end + [0.12, 0.12], label, color)

    def handle(self, at, key, label="", index=None, axes=(0, 1), limits=None):
        h = dict(at=np.asarray(at).tolist(), key=key, label=label, axes=list(axes))
        if index is not None:
            h["index"] = index
        if limits is not None:
            h["limits"] = limits
        self.handles.append(h)

    def axes(self, xmin=-3, xmax=3, ymin=-1.8, ymax=1.8):
        self.line([(xmin, 0), (xmax, 0)], MUTED, 0.8)
        self.line([(0, ymin), (0, ymax)], MUTED, 0.8)

    def grid(self, matrix=None, extent=3):
        A = np.eye(2) if matrix is None else np.asarray(matrix)
        for k in range(-extent, extent + 1):
            self.line(np.array([[-extent, k], [extent, k]]) @ A.T, MUTED, 0.7, 0.3)
            self.line(np.array([[k, -extent], [k, extent]]) @ A.T, MUTED, 0.7, 0.3)

    def result(self):
        if self.panels and any(
            "panel" not in item for item in [*self.items, *self.handles]
        ):
            raise ValueError("分幅演示中的图元与控制柄必须属于一幅子图")
        return dict(
            bounds=self.bounds,
            items=self.items,
            handles=self.handles,
            formula=self.formula,
            values=self.values,
            panels=self.panels,
        )


def color(linear):
    rgb = _core("01").linear_to_srgb(np.clip(linear, 0, 1))
    return "#" + "".join(f"{int(round(x*255)):02x}" for x in rgb)


def circle(center, radius, count=100):
    a = np.linspace(0, 2 * np.pi, count)
    return np.asarray(center) + radius * np.column_stack([np.cos(a), np.sin(a)])


@figure(
    "pixel-sampling",
    "01",
    "一个像素，许多个观察位置",
    {"point": [0.1, 0.15], "samples": 4},
    [choice("samples", "每轴样本", [1, 2, 4, 8])],
)
def pixel_sampling(p, t):
    d = Drawing((-1.4, 2.6, -1.4, 1.4))
    center = np.asarray(p["point"])
    n = int(p["samples"])
    samples = _core("01").sample_offsets(n) - 0.5
    covered = np.linalg.norm(samples - center, axis=1) < 0.56
    d.polygon([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], WHITE, 0.07)
    d.line([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]], WHITE)
    d.line(circle(center, 0.56), BLUE, 2)
    count = max(1, int(np.ceil(t * len(samples))))
    for xy, inside in zip(samples[:count], covered[:count]):
        d.dot(xy, GREEN if inside else RED, 0.025)
    average = float(covered[:count].mean())
    d.polygon(
        [[1.15, -0.4], [1.95, -0.4], [1.95, 0.4], [1.15, 0.4]], color([average] * 3), 1
    )
    d.text([1.12, 0.65], "像素的平均值", WHITE, 13)
    d.handle(center, "point", "圆心", limits=[-0.6, 0.6, -0.6, 0.6])
    d.formula = r"C \approx \frac{1}{N}\sum_{i=1}^{N}f(x_i,y_i)"
    d.values = {"已累计样本": count, "总样本": n * n, "覆盖估计": round(average, 4)}
    return d


@figure(
    "color-average",
    "01",
    "平均光，再编码为屏幕颜色",
    {"mix": 0.5},
    [slider("mix", "白色所占比例", 0, 1)],
)
def color_average(p, t):
    d = Drawing((-0.3, 2.5, -0.25, 1.5))
    x = np.linspace(0, 1, 100)
    mix = p["mix"] * t
    d.axes(0, 1.1, 0, 1.1)
    d.line(np.column_stack([x, _core("01").linear_to_srgb(x)]), GREEN, 2.5)
    d.line([[0, 0], [1, 1]], MUTED, 1, 1, True)
    encoded = float(_core("01").linear_to_srgb(mix))
    d.dot([mix, encoded])
    d.line([[mix, 0], [mix, encoded], [0, encoded]], YELLOW, 1)
    for y, value, label in [
        (1, encoded, "线性平均 → sRGB"),
        (0.35, mix, "直接平均 sRGB"),
    ]:
        shade = "#" + f"{round(value*255):02x}" * 3
        d.polygon(
            [[1.45, y - 0.25], [2.15, y - 0.25], [2.15, y + 0.05], [1.45, y + 0.05]],
            shade,
            1,
        )
        d.text([1.4, y + 0.15], label, WHITE, 12)
    d.text([0.55, -0.15], "线性光强", MUTED, 12)
    d.text([0.06, 1.15], "sRGB", GREEN, 12)
    d.formula = (
        r"\begin{aligned}"
        r"C_1&=\operatorname{sRGB}((1-t)\,0+t\,1)\\"
        r"C_2&=(1-t)\operatorname{sRGB}(0)+t\operatorname{sRGB}(1)\\"
        r"C_1&\ne C_2\quad(0<t<1)"
        r"\end{aligned}"
    )
    d.values = {
        "线性亮度": round(mix, 3),
        "正确屏幕编码": round(encoded, 3),
        "错误屏幕编码": round(mix, 3),
    }
    return d


@figure(
    "basis-transform",
    "02",
    "矩阵的两列，就是两根基向量",
    {"basis": [[1.5, 0.4], [-0.5, 1.1]], "point": [2, 1]},
)
def basis_transform(p, t):
    d = Drawing()
    A = np.array(p["basis"]).T
    B = (1 - t) * np.eye(2) + t * A
    v = np.asarray(p["point"])
    d.grid(B)
    d.line([[0, 0], v], WHITE, 1.5, 0.55, True)
    d.text(v + [0.12, -0.16], "v", WHITE)
    d.handle(v, "point", "输入 v", limits=[-2.5, 2.5, -1.5, 1.5])
    d.arrow([0, 0], B[:, 0], BLUE, "Ae₁")
    d.arrow([0, 0], B[:, 1], GREEN, "Ae₂")
    out = B @ v
    d.arrow([0, 0], out, YELLOW, "Av")
    d.line([B[:, 0] * v[0], out], GREEN, 1.5, 1, True)
    for i in range(2):
        d.handle(
            A[:, i],
            "basis",
            "目标基向量 " + str(i + 1),
            index=i,
            limits=[-2.5, 2.5, -1.8, 1.8],
        )
    d.formula = r"A\binom{x}{y}=x\,A\mathbf e_1+y\,A\mathbf e_2"
    d.values = {
        "当前矩阵列": B.T.round(3).tolist(),
        "目标矩阵列": A.T.round(3).tolist(),
        "向量": v.tolist(),
        "结果": out.round(3).tolist(),
        "当前行列式": round(float(np.linalg.det(B)), 3),
    }
    return d


@figure(
    "transform-order",
    "02",
    "交换顺序，会交换运动的路径",
    {"point": [1.3, 0.5], "angle": 70},
    [slider("angle", "旋转角 / °", -180, 180, 1)],
)
def transform_order(p, t):
    c = _core("02")
    d = Drawing()
    base = np.array(
        [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.3], [0, 0.65], [-0.4, 0.3], [-0.4, -0.4]]
    )
    a = np.deg2rad(p["angle"])
    v = np.asarray(p["point"])
    first = min(1, t * 2)
    second = max(0, t * 2 - 1)
    # 右边矩阵先执行；先旋转后平移，与先平移后旋转。
    TR = c.compose(c.translation(*(v * second)), c.rotation(a * first))
    RT = c.compose(c.rotation(a * second), c.translation(*(v * first)))
    d.grid(extent=2)
    d.line(base, MUTED, 1.5)
    for M, col, label in [(TR, BLUE, "TR"), (RT, GREEN, "RT")]:
        pts = c.apply(M, base)
        d.line(pts, col, 2.5)
        d.text(pts[3] + [0, 0.2], label, col)
    d.arrow([0, 0], v, YELLOW, "平移")
    d.handle(v, "point", "平移", limits=[-2, 2, -1.5, 1.5])
    d.formula = r"\text{一般情况下：}\quad TR\mathbf p\ne RT\mathbf p"
    d.values = {"阶段": "第一步" if t < 0.5 else "第二步", "旋转角": p["angle"]}
    return d


@figure(
    "projection-rays",
    "03",
    "近大远小来自一对相似三角形",
    {"point": [3, 1.5], "focal": 1},
    [slider("focal", "像平面距离", 0.4, 1.8)],
)
def projection_rays(p, t):
    d = Drawing((-0.5, 4.5, -1.8, 2))
    P = np.asarray(p["point"])
    f = p["focal"]
    hit = np.array([f, f * P[1] / P[0]])
    d.axes(0, 4.2, -1.5, 1.5)
    d.line([[f, -1.5], [f, 1.5]], GREEN, 2)
    d.polygon([[0, 0], P, [P[0], 0]], BLUE, 0.09)
    d.polygon([[0, 0], hit, [f, 0]], GREEN, 0.2)
    d.line([[0, 0], P * t], YELLOW, 2.3)
    d.dot(P, BLUE)
    d.dot(hit, GREEN)
    for at, label, col in [(P, "P", BLUE), (hit, "P′", GREEN), ([0, -0.2], "O", WHITE)]:
        d.text(np.asarray(at) + [0.08, 0.08], label, col)
    d.handle(P, "point", "场景点", limits=[2, 4, -1.5, 1.5])
    d.text([2.5, -0.3], "d = −z", MUTED)
    d.formula = r"\frac{y\prime}{f}=\frac{y}{d},\qquad y\prime=\frac{fy}{d}"
    d.values = {
        "距离 d": round(P[0], 3),
        "高度 y": round(P[1], 3),
        "投影高度 y′": round(hit[1], 3),
    }
    return d


@figure(
    "perspective-divide", "03", "除以 w，把视锥变成统一的方盒", {"point": [1.4, 3.0]}
)
def perspective_divide(p, t):
    d = Drawing()
    x, depth = p["point"]
    c = _core("03")
    P = c.perspective(60, 1, 0.2, 10)
    clip = c.transform_points(np.array([[x, 0, -depth]]), P)[0]
    ndc = c.perspective_divide(clip[None])[0]

    # 左半图为相机 x/距离剖面；右半图为 NDC x/z 剖面。
    def left(q):
        return [-3 + q[0] * 0.6, -1.4 + q[1] * 0.5]

    d.line([left([-2.3, 4]), left([0, 0]), left([2.3, 4])], MUTED)
    d.line([[0.7, -1.4], [3.3, -1.4], [3.3, 1.4], [0.7, 1.4], [0.7, -1.4]], GREEN)
    a = np.array(left([x, depth]))
    b = np.array([2 + 1.3 * ndc[0], 1.4 * ndc[2]])
    inside = bool(np.all(np.abs(ndc) <= 1))
    d.bounds = (-4, max(4, float(b[0]) + 0.8), -2.3, 2.3)
    d.dot(a, BLUE)
    d.dot(b, GREEN if inside else RED)
    d.line([a, b], MUTED, 1, 0.7, True)
    d.dot(a + (b - a) * t, YELLOW, 0.075)
    d.handle(a, "point", "相机点", axes=[0, 1], limits=[0.1, 2.5, 1, 4])
    d.handles[-1]["mapping"] = {"scale": [0.6, 0.5], "offset": [-3, -1.4]}
    d.text([-3.5, 1.8], "相机坐标（局部剖面）", BLUE)
    d.text([1.1, 1.8], "绿框：NDC 裁剪范围", GREEN)
    d.formula = (
        r"(x_n,y_n,z_n)=\frac{(x_c,y_c,z_c)}{w_c},\qquad w_c=-z_{\mathrm{camera}}"
    )
    d.values = {
        "clip": clip.round(3).tolist(),
        "NDC": ndc.round(3).tolist(),
        "w": round(float(clip[3]), 3),
        "位于裁剪体内": inside,
    }
    return d


@figure(
    "barycentric-area",
    "04",
    "三个有向面积，拼成一个位置",
    {"vertices": [[-2, -1], [2, -1], [0, 1.5]], "point": [0.2, 0.1]},
)
def barycentric_area(p, t):
    d = Drawing()
    V = np.asarray(p["vertices"])
    P = np.asarray(p["point"])
    colors = [BLUE, GREEN, RED]
    area = float(_core("04").cross2(V[1] - V[0], V[2] - V[0]))
    if abs(area) < 1e-6:
        d.text([-1, 0], "三点共线：面积为零", RED)
        w = None
    else:
        w = _core("04").barycentric(P, V)
        for i in range(3):
            d.polygon(
                [P, V[(i + 1) % 3], V[(i + 2) % 3]],
                colors[i],
                0.1 + 0.22 * np.clip(t * 3 - i, 0, 1),
            )
            center = (P + V[(i + 1) % 3] + V[(i + 2) % 3]) / 3
            d.text(center, f"λ{i} = {w[i]:.2f}", colors[i], 13)
    d.line([*V, V[0]], WHITE, 1.5)
    for i, v in enumerate(V):
        d.handle(v, "vertices", chr(65 + i), index=i, limits=[-2.7, 2.7, -1.5, 1.6])
    d.handle(P, "point", "P", limits=[-3, 3, -1.8, 1.8])
    d.formula = (
        r"\lambda_i=\frac{A_i}{A},\quad \sum_i\lambda_i=1,\quad P=\sum_i\lambda_i V_i"
    )
    d.values = {
        "权重": None if w is None else w.round(4).tolist(),
        "权重和": None if w is None else round(float(w.sum()), 6),
    }
    return d


@figure(
    "edge-rule",
    "04",
    "共享边上的样本，只交给一侧",
    {"offset": 0, "closed": False},
    [
        slider("offset", "亚像素平移", -0.45, 0.45),
        choice("closed", "两侧都包含边界", [False, True]),
    ],
)
def edge_rule(p, t):
    d = Drawing((-1, 7, -0.6, 6.1))
    o = p["offset"]
    v = np.array([[0.5, 0.5], [4.5, 0.5], [4.5, 4.5], [0.5, 4.5]]) + o
    faces = [v[[0, 1, 2]], v[[0, 2, 3]]]
    owners = np.zeros((6, 6), int)
    # 复用已由纹理章节导入的 top-left 光栅化器。
    raster = _core("07")._raster
    for k, tri in enumerate(faces):
        d.polygon(tri, [BLUE, GREEN][k], 0.12)
        d.line([*tri, tri[0]], [BLUE, GREEN][k])
        rule = "inclusive" if p["closed"] else "top_left"
        rows, cols, _ = raster.rasterize_triangle(tri, 6, 6, rule=rule)
        owners[rows, cols] += 1
    for row in range(6):
        for col in range(6):
            # 光栅器返回首行在顶部的数组索引；矢量图 y 向上。
            if row * 6 + col <= t * 36:
                d.dot(
                    [col + 0.5, 6 - row - 0.5],
                    (
                        RED
                        if owners[row, col] > 1
                        else YELLOW if owners[row, col] else MUTED
                    ),
                    0.05,
                )
    d.text([0.5, 5.65], "红：重复归属    黄：唯一归属", WHITE, 12)
    d.formula = r"E>0\;\lor\;(E=0\;\land\;\mathrm{topLeft})"
    d.values = {
        "重复归属样本": int((owners > 1).sum()),
        "唯一归属样本": int((owners == 1).sum()),
    }
    return d


@figure(
    "depth-order",
    "05",
    "每个片元都要和当前深度比较",
    {"a": 0.3, "b": 0.65, "order": "AB", "method": "depth"},
    [
        slider("a", "A 深度", 0, 1),
        slider("b", "B 深度", 0, 1),
        choice("order", "顺序", ["AB", "BA"]),
        choice("method", "比较方式", ["depth", "painter"]),
    ],
)
def depth_order(p, t):
    d = Drawing()
    best = np.inf
    owner = "背景"
    seen = []
    for name in p["order"][: min(2, int(t * 2) + 1)]:
        z = p[name.lower()]
        accepted = p["method"] == "painter" or z < best
        seen.append((name, z, accepted))
        if accepted:
            best = z
            owner = name
    for i, (name, z, accepted) in enumerate(seen):
        x = -2.5 + i * 1.8
        col = BLUE if name == "A" else GREEN
        d.polygon([[x, -0.45], [x + 1, -0.45], [x + 1, 0.45], [x, 0.45]], col, 0.35)
        d.text([x, 0.85], f"{name} : {z:.2f}", col)
        d.text([x, -0.85], "通过" if accepted else "丢弃", GREEN if accepted else RED)
    d.arrow([0.4, 0], [1.1, 0], WHITE)
    d.polygon(
        [[1.4, -0.6], [2.8, -0.6], [2.8, 0.6], [1.4, 0.6]],
        BLUE if owner == "A" else GREEN if owner == "B" else MUTED,
        0.5,
    )
    d.text([1.45, 0.9], f"保留 {owner}")
    d.formula = (
        r"\begin{aligned}"
        r"z_{\mathrm{buffer}}&=+\infty\quad\text{initially}\\"
        r"z_{\mathrm{new}}&<z_{\mathrm{buffer}}\\"
        r"&\Rightarrow(z,C)\leftarrow(z_{\mathrm{new}},C_{\mathrm{new}})"
        r"\end{aligned}"
    )
    d.values = {"缓冲深度": best, "可见片元": owner, "已处理片元": len(seen)}
    return d


@figure(
    "depth-precision",
    "05",
    "深度精度集中在近裁剪面附近",
    {"near": 0.2, "bits": 8, "distance": 4},
    [slider("near", "近面", 0.05, 2, 0.05), choice("bits", "位数", [8, 16, 24])],
)
def depth_precision(p, t):
    d = Drawing((-4.2, 4.2, -2, 2.3))
    c = _core("05")
    near, dist = p["near"], p["distance"]

    def plot(x, z):
        # 图表两轴使用各自的单位：距离 [0,10]，深度 [0,1]。
        return np.column_stack([np.atleast_1d(x), np.atleast_1d(z)]) * [0.44, 2.2] + [
            -3.2,
            -0.9,
        ]

    x = np.linspace(near, 10, 300)
    z = c.depth_from_distance(x, near, 10)
    d.line(plot([0, 0, 10], [1.05, 0, 0]), MUTED)
    d.line(plot(x, z), BLUE, 2.5)
    for tick in [0, 2, 4, 6, 8, 10]:
        d.text(plot(tick, -0.12)[0], str(tick), MUTED, 10)
    for tick in [0, 0.5, 1]:
        d.text(plot(-0.8, tick)[0], str(tick), MUTED, 10)
    d.text([-3.2, 1.7], "存储深度 z", BLUE, 12)
    d.text([-0.5, -1.6], "相机距离 d", MUTED, 12)
    value = float(c.depth_from_distance(dist, near, 10))
    active = near + (dist - near) * t
    val = float(c.depth_from_distance(active, near, 10))
    active_q = float(c.quantize_depth(val, int(p["bits"])))
    d.line(plot([active, active, 0], [0, val, val]), YELLOW, 1)
    d.dot(plot(active, val)[0], YELLOW)
    d.dot(plot(active, active_q)[0], RED, 0.035)
    d.handle(
        plot(dist, value)[0], "distance", "距离", axes=[0], limits=[2.01, 9.8, 0, 1]
    )
    d.handles[-1]["mapping"] = {"scale": [0.44, 2.2], "offset": [-3.2, -0.9]}
    d.formula = (
        r"z(d)=\frac{f}{f-n}-\frac{fn}{(f-n)d},\quad \frac{dz}{dd}=\frac{fn}{(f-n)d^2}"
    )
    # 全局曲线上的量化间距可能小于一像素，因此将邻近三级单独放大。
    levels = 2 ** int(p["bits"]) - 1
    step = 1 / levels
    index = int(round(active_q * levels))
    first = max(0, min(levels - 2, index - 1))
    d.text([1.65, 1.7], "局部深度尺", WHITE, 12)
    d.line([[1.95, -0.8], [1.95, 0.8]], MUTED, 1)
    for i in range(3):
        y = -0.6 + 0.6 * i
        d.line([[1.8, y], [2.1, y]], MUTED, 1)
        d.text([2.25, y - 0.04], f"{(first+i)*step:.8f}", MUTED, 10)
    d.dot([1.95, -0.6 + 0.6 * (val * levels - first)], YELLOW, 0.04)
    d.dot([2.1, -0.6 + 0.6 * (index - first)], RED, 0.04)
    d.text([1.65, -1.2], "黄：原值", YELLOW, 11)
    d.text([1.65, -1.6], "红：量化值", RED, 11)
    d.values = {
        "当前距离": round(active, 5),
        "目标距离": dist,
        "探针深度": round(val, 7),
        "量化后": round(active_q, 7),
        "深度存储间隔": step,
        "量化距离误差": round(
            float(abs(c.distance_from_depth(active_q, near, 10) - active)), 7
        ),
    }
    return d


@figure(
    "normal-transform",
    "06",
    "法线必须继续垂直于切线",
    {"scale": [2, 0.6], "angle": 40},
    [slider("angle", "曲面角 / °", 0, 180, 1)],
)
def normal_transform(p, t):
    d = Drawing()
    a = np.deg2rad(p["angle"])
    n = np.array([np.cos(a), np.sin(a)])
    v = np.array([-n[1], n[0]])
    s = 1 + (np.array(p["scale"]) - 1) * t
    A = np.diag(s)
    q = A @ n
    tangent = A @ v
    good = _core("06").transform_normals(np.r_[n, 0][None], np.diag([*s, 1]))[0, :2]
    wrong = A @ n
    wrong /= np.linalg.norm(wrong)
    d.line(circle([0, 0], 1) @ A.T, MUTED)
    d.line([q - tangent * 0.7, q + tangent * 0.7], WHITE, 2)
    d.dot(q, YELLOW, 0.055)
    d.arrow(q, q + good, BLUE, "A⁻ᵀn")
    d.arrow(q, q + wrong, RED, "An")
    d.handle(p["scale"], "scale", "半轴", limits=[0.4, 2.4, 0.4, 1.5])
    d.formula = r"(A\mathbf t)\cdot(A^{-T}\mathbf n)=\mathbf t\cdot\mathbf n=0"
    d.values = {
        "正确点积": round(float(tangent @ good), 6),
        "错误点积": round(float(tangent @ wrong), 4),
    }
    return d


@figure(
    "light-lobes",
    "06",
    "高光指数控制亮点的宽度",
    {"angle": 35, "exponent": 16},
    [
        slider("angle", "入射角 / °", -85, 85, 1),
        choice("exponent", "高光指数", [4, 16, 64, 256]),
    ],
)
def light_lobes(p, t):
    d = Drawing((-3.5, 3.5, -0.6, 2.5))
    theta = np.linspace(-np.pi / 2, np.pi / 2, 180)
    a = np.deg2rad(p["angle"])
    L = np.array([np.sin(a), np.cos(a)])
    d.line([[-3, 0], [3, 0]], MUTED)
    d.arrow([0, 0], [0, 1.8], WHITE, "n")
    d.arrow([0, 0], L * 1.8, BLUE, "l")
    # 固定光线、扫过观察方向；Blinn-Phong 的半程向量由 l+v 归一化。
    views = np.column_stack([np.sin(theta), np.cos(theta), np.zeros(len(theta))])
    light = np.r_[L, 0]
    normal = np.array([0, 1, 0])
    half = _core("06").normalize(views + light)
    spec = np.maximum(half[:, 1], 0) ** p["exponent"]
    diff = max(L[1], 0)
    d.line(np.column_stack([np.sin(theta) * diff, np.cos(theta) * diff]), GREEN, 2)
    d.line(
        np.column_stack([np.sin(theta) * (spec * 1.8), np.cos(theta) * (spec * 1.8)]),
        YELLOW,
        2.5,
    )
    v = views[min(len(theta) - 1, int(t * (len(theta) - 1))), :2]
    d.arrow([0, 0], v * 1.9, MUTED, "v")
    d.formula = r"I_d\propto\max(0,\mathbf n\cdot\mathbf l),\quad I_s\propto\max(0,\mathbf n\cdot\mathbf h)^s"
    d.values = {"漫反射因子": round(diff, 4), "高光指数": p["exponent"]}
    return d


@figure(
    "perspective-uv",
    "07",
    "屏幕的一半，不一定是纹理的一半",
    {"far": 4, "probe": 0.5},
    [slider("far", "远端 w", 1, 10, 0.1)],
)
def perspective_uv(p, t):
    d = Drawing((-0.4, 1.6, -0.3, 1.4))
    x = np.linspace(0, 1, 120)
    weights = np.column_stack([1 - x, x])
    c = _core("07")
    uv = c.perspective_interpolate(weights, [[0], [1]], [1, 1 / p["far"]])[:, 0]
    d.axes(0, 1.1, 0, 1.1)
    d.line(np.column_stack([x, x]), RED, 2)
    d.line(np.column_stack([x, uv]), GREEN, 2.5)
    s = p["probe"] * t
    correct = float(
        c.perspective_interpolate([1 - s, s], [[0], [1]], [1, 1 / p["far"]])[0]
    )
    d.line([[s, s], [s, correct]], YELLOW, 2)
    d.dot([s, correct])
    d.handle([p["probe"], 0], "probe", "屏幕位置", axes=[0], limits=[0, 1, 0, 1])
    d.text([0.1, 1.2], "红：仿射    绿：透视校正", WHITE, 12)
    d.formula = r"u(s)=\frac{(1-s)u_0/w_0+s u_1/w_1}{(1-s)/w_0+s/w_1}"
    d.values = {
        "屏幕位置": round(s, 3),
        "仿射 u": round(s, 3),
        "正确 u": round(correct, 3),
    }
    return d


@figure(
    "texture-filter", "07", "四个纹素，四个随位置变化的权重", {"point": [0.48, 0.57]}
)
def texture_filter(p, t):
    d = Drawing((-0.2, 2, -0.25, 1.3))
    uv = np.asarray(p["point"])
    tex = np.array([[[1.0, 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 1]]])
    rows, cols, w = _core("07").bilinear_taps(uv, 2, 2)
    for r in range(2):
        for c in range(2):
            x = c * 0.5
            y = (1 - r) * 0.5
            d.polygon(
                [[x, y], [x + 0.5, y], [x + 0.5, y + 0.5], [x, y + 0.5]],
                color(tex[r, c]),
                1,
            )
    # clamp 可使四次读取落在相同纹素；图上合并权重，数值保留四项。
    for row, col in dict.fromkeys(zip(rows, cols)):
        weight = float(w[(rows == row) & (cols == col)].sum())
        q = [(col + 0.5) / 2, 1 - (row + 0.5) / 2]
        d.line([q, uv], WHITE, 1 + 4 * weight, 0.3 + 0.7 * t)
        d.text(q, f"{weight:.2f}", WHITE, 12)
    out = _core("07").sample_texture(tex, uv)
    near = _core("07").sample_texture(tex, uv, "nearest")
    for x, col, label in [(1.15, color(out), "双线性"), (1.6, color(near), "最近邻")]:
        d.polygon([[x, 0.25], [x + 0.3, 0.25], [x + 0.3, 0.55], [x, 0.55]], col, 1)
        d.text([x, 0.72], label, WHITE, 12)
    d.handle(uv, "point", "UV", limits=[0, 1, 0, 1])
    d.formula = r"C(u,v)=\sum_{i=0}^{3}w_i C_i,\qquad \sum_i w_i=1"
    d.values = {
        "UV": uv.round(3).tolist(),
        "纹素行列": np.column_stack([rows, cols]).tolist(),
        "权重": w.round(3).tolist(),
        "线性颜色": out.round(3).tolist(),
    }
    return d


@figure(
    "sampling-alias",
    "08",
    "不同的波，可能留下完全相同的样本",
    {"frequency": 7, "phase": 0},
    [
        choice("frequency", "信号频率", [3, 7, 9, 11, 15, 16]),
        slider("phase", "相位", 0, 6.28, 0.01),
    ],
)
def sampling_alias(p, t):
    d = Drawing((-0.05, 1.1, -1.7, 1.7))
    f = p["frequency"]
    alias = float(_core("08").alias_frequency(f, 8))
    phase = p["phase"] + 2 * np.pi * t
    x = np.linspace(0, 1, 500)
    y = np.sin(2 * np.pi * f * x + phase)
    low = np.sin(2 * np.pi * alias * x + phase)
    d.axes(0, 1, -1.2, 1.2)
    d.line(np.column_stack([x, y]), BLUE, 1.5, 0.7)
    d.line(np.column_stack([x, low]), GREEN, 2.5)
    for q in np.arange(9) / 8:
        d.dot([q, np.sin(2 * np.pi * f * q + phase)], YELLOW, 0.012)
    d.text([0.02, 1.4], "蓝：原信号    绿：混叠    黄：采样", WHITE, 12)
    d.formula = r"\sin(2\pi(f+kf_s)n/f_s+\phi)=\sin(2\pi f n/f_s+\phi)"
    d.values = {"原频率": f, "有符号混叠频率": alias, "采样频率": 8}
    return d


@figure(
    "sample-coverage",
    "08",
    "覆盖率是面积，采样是估计",
    {"point": [0.08, 0.08], "angle": 35, "samples": 16},
    [
        choice("samples", "样本数", [1, 4, 16, 64, 256]),
        slider("angle", "边缘方向 / °", 0, 180, 1),
    ],
)
def sample_coverage(p, t):
    d = Drawing((-1.1, 1.8, -0.9, 0.9))
    a = np.deg2rad(p["angle"])
    n = np.array([np.cos(a), np.sin(a)])
    P = np.asarray(p["point"])
    threshold = float(n @ P)
    tangent = np.array([-n[1], n[0]])
    d.line([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]], WHITE)
    d.line([P - tangent * 1.4, P + tangent * 1.4], BLUE, 2)
    samples = _core("01").sample_offsets(int(np.sqrt(p["samples"]))) - 0.5
    covered = samples @ n <= threshold
    count = max(1, int(np.ceil(t * len(samples))))
    for q, inside in zip(samples[:count], covered[:count]):
        d.dot(q, GREEN if inside else RED, 0.012)
    exact = float(
        np.asarray(
            _core("08").halfplane_coverage(np.array([[0.0, 0.0]]), n, threshold)
        ).ravel()[0]
    )
    estimate = float(covered[:count].mean())
    d.text([0.8, 0.25], f"面积 {exact:.3f}", GREEN)
    d.text([0.8, -0.1], f"估计 {estimate:.3f}", YELLOW)
    d.handle(P, "point", "边缘", limits=[-0.5, 0.5, -0.5, 0.5])
    d.formula = r"\alpha=\int_{\mathrm{pixel}}\mathbf1_{\mathrm{covered}}\,dA\;\approx\;\frac{N_{\mathrm{inside}}}{N}"
    d.values = {
        "真实覆盖率": round(exact, 5),
        "采样估计": round(estimate, 5),
        "绝对误差": round(abs(exact - estimate), 5),
    }
    return d


@figure(
    "shadow-compare",
    "09",
    "沿着光线，再做一次可见性判断",
    {"point": [0.5, 0], "height": 1.3},
    [slider("height", "遮挡物高度", 0.3, 2, 0.05)],
)
def shadow_compare(p, t):
    d = Drawing((-3.5, 3.5, -0.6, 2.7))
    h = p["height"]
    x = p["point"][0]
    d.line([[-3, 0], [3, 0]], WHITE)
    d.line([[-0.8, 0], [-0.8, h], [0.8, h], [0.8, 0]], BLUE, 2.5)
    # 光线统一向下：同一个光源像素中的最近深度。
    for q in np.linspace(-2.5, 2.5, 11):
        end = h if abs(q) <= 0.8 else 0
        d.arrow([q, 2.3], [q, 2.3 + (end - 2.3) * t], YELLOW)
    stored = (2.3 - h) / 2.3 if abs(x) <= 0.8 else 1.0
    receiver = 1.0
    visible = receiver <= stored
    d.dot([x, 0], GREEN if visible else RED, 0.1)
    d.handle([x, 0], "point", "接收点", axes=[0], limits=[-2.8, 2.8, 0, 0])
    d.text([-2.8, 2.5], "平行光：所有射线方向相同", MUTED, 12)
    d.formula = (
        r"\begin{aligned}"
        r"D&=(2.3-y)/2.3\\"
        r"\mathrm{shadow}&\iff D_{\mathrm{receiver}}>D_{\mathrm{map}}\\"
        r"b&=0"
        r"\end{aligned}"
    )
    d.values = {
        "接收点光空间深度": receiver,
        "阴影图最近深度": round(stored, 3),
        "可见": visible,
    }
    return d


@figure(
    "shadow-bias",
    "09",
    "偏移是在错误自遮挡与漏光之间取舍",
    {"bias": 0.02},
    [slider("bias", "深度偏移", 0, 0.15, 0.001)],
)
def shadow_bias(p, t):
    d = Drawing((-3.2, 3.2, -0.8, 1.8))
    x = np.linspace(-2.7, 2.7, 25)
    receiver = 0.6
    stored = np.where(x < 0, 0.59 + np.sin(x * 8) * 0.009, 0.52)
    visible = _core("09").pcf_visibility(
        np.full((len(x),), receiver), stored[:, None], p["bias"]
    )
    d.line([[-3, (receiver - 0.4) * 4], [3, (receiver - 0.4) * 4]], WHITE, 2)
    d.text([-2.9, 1.4], "左：应照亮的同一表面    右：应被遮挡", WHITE, 12)
    for i, (q, z, vis) in enumerate(zip(x, stored, visible)):
        if i <= t * 25:
            d.dot([q, (z - 0.4) * 4], BLUE, 0.04)
            d.line([[q, (z - 0.4) * 4], [q, (z + p["bias"] - 0.4) * 4]], YELLOW, 2)
            d.dot([q, -0.2], GREEN if vis else RED, 0.065)
    d.text([-2.9, -0.5], "蓝：阴影图深度    黄：偏移    绿：通过测试", MUTED, 11)
    d.formula = r"V=\mathbf1\{z_{\mathrm{receiver}}\le z_{\mathrm{stored}}+b\}"
    d.values = {
        "错误自阴影": int((visible[x < 0] == 0).sum()),
        "错误漏光": int((visible[x >= 0] > 0).sum()),
        "偏移": p["bias"],
    }
    return d


@figure(
    "surface-normal",
    "10",
    "参数切向量与隐式梯度指向同一张曲面",
    {"axes": [2, 1], "angle": 40},
    [slider("angle", "参数角 / °", 0, 360, 1)],
)
def surface_normal(p, t):
    d = Drawing()
    a, b = p["axes"]
    u = np.deg2rad(p["angle"]) + t * 2 * np.pi
    c = _core("10")
    axes = (a, b, 1)
    # 椭球赤道 v=π/2（参数实现的极角），展示可读的二维剖面。
    P = np.array([a * np.cos(u), b * np.sin(u), 0])
    normal = c.analytic_normal(P, axes)[:2]
    tangent = np.array([-a * np.sin(u), b * np.cos(u)])
    tangent /= np.linalg.norm(tangent)
    radial = P[:2] / np.linalg.norm(P[:2])
    d.line(circle([0, 0], 1) * [a, b], WHITE, 1.5)
    d.arrow(P[:2], P[:2] + normal, BLUE, "单位法线")
    d.arrow(P[:2], P[:2] + tangent, GREEN, "切向量")
    d.arrow(P[:2], P[:2] + radial, RED, "径向")
    d.handle(p["axes"], "axes", "半轴", limits=[0.5, 2.4, 0.5, 1.4])
    d.formula = r"F=\frac{x^2}{a^2}+\frac{y^2}{b^2}+\frac{z^2}{c^2}-1,\quad \nabla F\perp\frac{\partial\mathbf p}{\partial u}"
    d.values = {
        "赤道点": P.round(3).tolist(),
        "单位法线": normal.round(3).tolist(),
        "点积": round(float(normal @ tangent), 7),
        "径向与切向点积": round(float(radial @ tangent), 5),
    }
    return d


@figure(
    "mesh-refine",
    "10",
    "先看圆截面：细分如何减小弦误差",
    {"segments": 8},
    [choice("segments", "初始分段", [4, 8, 16, 32])],
)
def mesh_refine(p, t):
    d = Drawing((-2.3, 3.8, -1.8, 1.8))
    n = int(p["segments"])
    R = 1.35
    angles = np.linspace(0, 2 * np.pi, n + 1)
    coarse = R * np.column_stack([np.cos(angles), np.sin(angles)])
    vertices = []
    for i in range(n):
        mid = (coarse[i] + coarse[i + 1]) / 2
        true = R * np.array(
            [
                np.cos((angles[i] + angles[i + 1]) / 2),
                np.sin((angles[i] + angles[i + 1]) / 2),
            ]
        )
        vertices.extend([coarse[i], mid + (true - mid) * t])
        d.dot(mid + (true - mid) * t, YELLOW, 0.025)
    d.line(circle([0, 0], R), MUTED, 1.5)
    d.line([*vertices, vertices[0]], BLUE, 2)
    # 凸内接折线到原点的最近距离决定最大径向间隙。
    starts = np.asarray(vertices)
    edges = np.roll(starts, -1, axis=0) - starts
    fractions = np.clip(
        -np.sum(starts * edges, axis=1) / np.sum(edges * edges, axis=1), 0, 1
    )
    current = R - float(
        np.min(np.linalg.norm(starts + fractions[:, None] * edges, axis=1))
    )
    error = R * (1 - np.cos(np.pi / n))
    d.text([1.8, 0.6], f"{n} → {2*n} 段", WHITE)
    d.text([1.8, 0.2], f"当前误差 {current:.5f}", YELLOW, 13)
    d.formula = r"\epsilon_N=R\left(1-\cos\frac{\pi}{N}\right)\sim\frac{R\pi^2}{2N^2}"
    d.values = {
        "当前折线最大径向误差": round(current, 6),
        "旧弦最大误差": round(error, 6),
        "细分后最大误差": round(R * (1 - np.cos(np.pi / (2 * n))), 6),
        "含义": "圆截面的弦误差",
    }
    return d


BEZIER = [[-2, -1], [-1, 1.5], [1, 1.5], [2, -1]]


@figure("casteljau-steps", "11", "三层线性插值，构造一条三次曲线", {"points": BEZIER})
def casteljau_steps(p, t):
    d = Drawing((-3.65, 3.65, -2.3, 2.3))
    c = _core("11")
    P = np.asarray(p["points"])
    curve = c.evaluate(P, np.linspace(0, 1, 150))
    levels = c.de_casteljau(P, t)
    with d.panel("casteljau", d.bounds):
        d.line(curve, WHITE, 1.5, 0.65)
        for i, level in enumerate(levels):
            col = [MUTED, BLUE, GREEN, YELLOW][i]
            d.line(level, col, 1.8)
            for q in level:
                d.dot(q, col, 0.045)
        for i, q in enumerate(P):
            d.handle(q, "points", f"P{i}", index=i, limits=[-3, 3, -1.8, 1.8])
    d.formula = r"P_i^{(k)}(t)=(1-t)P_i^{(k-1)}(t)+tP_{i+1}^{(k-1)}(t)"
    d.values = {"t": round(t, 3), "曲线点": np.asarray(levels[-1][0]).round(3).tolist()}
    return d


@figure(
    "bezier-tangent",
    "11",
    "让割线的两点靠近，留下切线",
    {"points": BEZIER, "position": 0.35},
    [slider("position", "曲线位置", 0.05, 0.8)],
)
def bezier_tangent(p, t):
    d = Drawing((-3.7, 9.1, -2.45, 2.45))
    c = _core("11")
    P = np.asarray(p["points"])
    u = p["position"]
    delta = max(0.001, (1 - t) * 0.18)
    A = c.evaluate(P, u)
    B = c.evaluate(P, u + delta)
    der = c.derivative(P, u)
    sec = (B - A) / delta
    with d.panel("curve-secant", (-3.7, 3.7, -2.45, 2.45)):
        d.line(c.evaluate(P, np.linspace(0, 1, 150)), WHITE, 1.6)
        d.line([A, B], YELLOW, 3)
        d.dot(A, BLUE, 0.065)
        d.dot(B, YELLOW, 0.065)
        for i, q in enumerate(P):
            d.handle(q, "points", f"P{i}", index=i, limits=[-3, 3, -1.8, 1.8])
    origin = np.array([6.55, -0.45])
    # 两支矢量共用倍率与原点；各自单位化会隐藏差商的长度误差。
    display_scale = 1.6 / max(np.linalg.norm(der), np.linalg.norm(sec), 1)
    with d.panel("derivative-comparison", (4.0, 9.1, -2.45, 2.45)):
        d.text([4.3, 2.02], "同一原点 · 同一显示倍率", WHITE, 13)
        d.text([4.3, 1.58], "绿色 C′(t)   黄色 ΔC / Δt", MUTED, 12)
        d.line([origin + [-1.85, 0], origin + [1.85, 0]], MUTED, 1, 0.55)
        d.line([origin + [0, -1.75], origin + [0, 1.55]], MUTED, 1, 0.55)
        d.arrow(origin, origin + display_scale * der, GREEN)
        d.arrow(origin, origin + display_scale * sec, YELLOW)
        d.dot(origin, WHITE, 0.035)
        if np.linalg.norm(der) == 0:
            d.text([4.3, -2.12], "C′(t)=0 · 单位切向未定义", RED, 12)
    d.formula = r"\lim_{\Delta t\to0}\frac{C(t+\Delta t)-C(t)}{\Delta t}=C\prime(t)"
    d.values = {
        "Δt": round(delta, 4),
        "差商": sec.round(3).tolist(),
        "解析导数": der.round(3).tolist(),
        "误差": round(float(np.linalg.norm(sec - der)), 5),
        "两矢量共同显示倍率": round(float(display_scale), 5),
    }
    return d


@figure(
    "ray-intersection",
    "12",
    "二次方程给出候选根，再检查合法区间",
    {"origin": [-2.5, 0.5], "aim": [1, -0.3], "t_min": 0, "t_max": 6},
    [
        slider("t_min", "最小参数", 0, 3, 0.05),
        slider("t_max", "最大参数", 0.1, 6, 0.05),
    ],
)
def ray_intersection(p, t):
    d = Drawing()
    O = np.asarray(p["origin"])
    direction = np.asarray(p["aim"]) - O
    c = _core("12")
    if np.linalg.norm(direction) < 1e-8:
        d.line(circle([0, 0], 1), BLUE, 2)
        d.text([-1.6, 1.5], "两点重合：射线方向未定义", RED)
        d.handle(O, "origin", "射线原点", limits=[-3, 3, -1.8, 1.8])
        d.handle(p["aim"], "aim", "方向", limits=[-3, 3, -1.8, 1.8])
        d.values = {"实根": [], "首个合法根": None, "方向有效": False}
        return d
    direction = direction / np.linalg.norm(direction)
    roots = c.sphere_roots(np.r_[O, 0], np.r_[direction, 0], [0, 0, 0], 1)
    d.line(circle([0, 0], 1), BLUE, 2)
    d.line([O, O + direction * 6], MUTED, 1, 1, True)
    d.arrow(O, O + direction * (0.15 + 5 * t), YELLOW)
    if p["t_min"] <= p["t_max"]:
        d.line([O + direction * p["t_min"], O + direction * p["t_max"]], GREEN, 4, 0.3)
    finite = []
    for root in np.asarray(roots).ravel():
        if np.isfinite(root):
            finite.append(float(root))
            q = O + root * direction
            legal = p["t_min"] <= root <= p["t_max"]
            d.dot(q, GREEN if legal else RED, 0.07)
            d.text(q + [0.08, 0.17], f"t={root:.2f}", GREEN if legal else RED, 12)
    d.handle(O, "origin", "射线原点", limits=[-3, 3, -1.8, 1.8])
    d.handle(p["aim"], "aim", "方向", limits=[-3, 3, -1.8, 1.8])
    d.formula = (
        r"\begin{aligned}"
        r"\|O+tD-C\|^2&=r^2\\"
        r"t_{\mathrm{hit}}&=\min\{t_i:t_{\min}\le t_i\le t_{\max}\}"
        r"\end{aligned}"
    )
    d.values = {
        "实根": finite,
        "首个合法根": min(
            [v for v in finite if p["t_min"] <= v <= p["t_max"]], default=None
        ),
        "合法区间": [p["t_min"], p["t_max"]],
        "方向有效": True,
    }
    return d


@figure(
    "ray-reflection",
    "12",
    "沿法线翻转垂直分量",
    {"normal": [0.2, 1], "incoming": [-1, 1]},
)
def ray_reflection(p, t):
    d = Drawing()
    n = np.asarray(p["normal"])
    n = n / max(np.linalg.norm(n), 1e-8)
    incoming = np.asarray(p["incoming"])
    direction = -incoming / max(np.linalg.norm(incoming), 1e-8)
    r = _core("12").reflect(direction, n)
    tangent = np.array([-n[1], n[0]])
    d.line([-tangent * 2.5, tangent * 2.5], MUTED, 2)
    d.arrow([0, 0], n * 1.5, BLUE, "n")
    d.arrow(-direction * 1.8, [0, 0], YELLOW, "d")
    d.arrow([0, 0], r * 1.8, GREEN, "r")
    travel = -direction * 1.8 * (1 - t * 2) if t < 0.5 else r * 1.8 * (t * 2 - 1)
    d.dot(travel, WHITE, 0.065)
    d.handle(p["normal"], "normal", "法线", limits=[-1, 1, 0.3, 1.4])
    d.handle(p["incoming"], "incoming", "入射", limits=[-2, 2, 0.3, 1.6])
    d.formula = r"\mathbf r=\mathbf d-2(\mathbf d\cdot\mathbf n)\mathbf n"
    d.values = {
        "入射法向分量": round(float(direction @ n), 4),
        "反射法向分量": round(float(r @ n), 4),
        "反射长度": round(float(np.linalg.norm(r)), 4),
    }
    return d


@figure(
    "convolution-window",
    "08",
    "移动窗口：一个像素到底平均了什么？",
    dict(center=0.15, half_width=0.25, frequency=2, phase=0),
    [
        slider("center", "窗口中心", -1, 1),
        slider("half_width", "窗口半宽", 0.03, 0.75),
        slider("frequency", "输入频率", 0, 6, 0.05),
        slider("phase", "相位", 0, 2 * np.pi),
    ],
    source=("figures.py", "convolution"),
)
def convolution_window(p, t):
    return _core("08", "figures.py").convolution(p, t, Drawing, _core("08"))


@figure(
    "sampling-spectrum",
    "08",
    "频谱的复制，和无法区分的频率",
    dict(frequency=7, sample_rate=8, phase=0, prefilter=False),
    [
        slider("frequency", "信号频率", 0, 12, 0.05),
        slider("sample_rate", "采样频率", 2, 12, 0.05),
        slider("phase", "相位", 0, 2 * np.pi),
        choice("prefilter", "盒式预过滤", [False, True]),
    ],
    source=("figures.py", "spectrum"),
)
def sampling_spectrum(p, t):
    return _core("08", "figures.py").spectrum(p, t, Drawing, _core("08"))


@figure(
    "mipmap-levels",
    "07",
    "同一个 UV，不同大小的平均范围",
    dict(lod=1.35, point=[0.36, 0.63], frequency=6),
    [slider("lod", "细节层级 λ", 0, 4), choice("frequency", "棋盘格数", [4, 6, 8])],
    source=("figures.py", "mipmap"),
)
def mipmap_levels(p, t):
    return _core("07", "figures.py").mipmap(p, t, Drawing, _core("07"), color)


@figure(
    "shading-frequency",
    "06",
    "移动光源，看高光在哪里被计算",
    dict(light=[-2, 2], light_z=5, latitude=5, exponent=128),
    [
        choice("latitude", "纬向分段", [4, 5, 6, 12, 24]),
        slider("exponent", "高光指数", 1, 512, 1),
        slider("light_z", "光源深度 Z", 3, 10, 0.1),
    ],
    source=("figures.py", "shading_frequency"),
    animated=False,
)
def shading_frequency(p, t):
    return _core("06", "figures.py").shading_frequency(
        p, t, Drawing, _core("06", "mesh_shading.py"), _png
    )


@figure(
    "texture-minification",
    "07",
    "四种过滤，同一个屏幕像素",
    dict(tilt=70, frequency=64, max_anisotropy=8, point=[0.5, 0.55]),
    [
        slider("tilt", "平面倾角", 0, 75, 1),
        choice("frequency", "棋盘格数", [16, 32, 64]),
        choice("max_anisotropy", "各向异性上限", [1, 2, 4, 8, 16]),
    ],
    source=("figures.py", "minification"),
    animated=False,
)
def texture_minification(p, t):
    return _core("07", "figures.py").minification(p, t, Drawing, _core("07"), _png)


@figure(
    "vector-products",
    "02",
    "三个投影，同一对三维向量",
    dict(a=[1.4, 0.4, 0.6], b=[0.3, 1.3, -0.5]),
    source=("spatial_figures.py", "vector_products"),
)
def vector_products(p, t):
    return _core("02", "spatial_figures.py").vector_products(
        p, t, Drawing, _core("02", "spatial.py")
    )


@figure(
    "axis-rotation",
    "02",
    "围绕一根可移动的轴旋转",
    dict(axis=[0.6, 1, 0.7], point=[1.5, 0.4, -0.3], angle=90),
    [slider("angle", "旋转角 / °", -180, 180, 1)],
    source=("spatial_figures.py", "axis_rotation"),
)
def axis_rotation(p, t):
    return _core("02", "spatial_figures.py").axis_rotation(
        p, t, Drawing, _core("02", "spatial.py")
    )


@figure(
    "multisample-compare",
    "08",
    "同样覆盖预算，不同着色频率",
    dict(grid=2, frequency=0.75, offset=0.15),
    [
        choice("grid", "每轴样本", [2, 4]),
        slider("frequency", "纹理频率 / 周每像素", 0, 3, 0.05),
        slider("offset", "平移 / px", -8, 8, 0.01),
    ],
    source=("multisample_figures.py", "compare"),
)
def multisample_compare(p, t):
    return _core("08", "multisample_figures.py").compare(
        p, t, Drawing, _core("08", "multisample.py"), _png
    )


@figure(
    "multisample-pixel",
    "08",
    "放大一个像素：覆盖、深度与颜色",
    dict(grid=2, frequency=0.75, offset=0.15, point=[24.5 / 48, 23.5 / 48]),
    [
        choice("grid", "每轴样本", [2, 4]),
        slider("frequency", "纹理频率 / 周每像素", 0, 3, 0.05),
        slider("offset", "平移 / px", -8, 8, 0.01),
    ],
    source=("multisample_figures.py", "pixel"),
)
def multisample_pixel(p, t):
    return _core("08", "multisample_figures.py").pixel(
        p, t, Drawing, _core("08", "multisample.py"), _png
    )


@figure(
    "ripmap-axis",
    "07",
    "分别缩小两根轴：ripmap 的查询范围",
    dict(point=[0.5, 0.5], axis=[12, 12], width=2.5, pattern="diagonal"),
    [
        slider("width", "轴 2 跨度 / texel", 0.25, 16, 0.25),
        choice("pattern", "源纹理", ["diagonal", "checker"]),
    ],
    source=("footprint_figures.py", "ripmap_axis"),
    animated=False,
)
def ripmap_axis(p, t):
    return _core("07", "footprint_figures.py").ripmap_axis(
        p, t, Drawing, _core("07", "footprint_filters.py"), _png
    )


@figure(
    "elliptical-footprint",
    "07",
    "转动足迹，检查实际参与的纹素权重",
    dict(point=[0.5, 0.5], axis=[12, 12], width=2.5, pattern="diagonal"),
    [
        slider("width", "轴 2 跨度 / texel", 0.25, 16, 0.25),
        choice("pattern", "源纹理", ["diagonal", "checker"]),
    ],
    source=("footprint_figures.py", "elliptical_footprint"),
    animated=False,
)
def elliptical_footprint(p, t):
    return _core("07", "footprint_figures.py").elliptical_footprint(
        p, t, Drawing, _core("07", "footprint_filters.py"), _png
    )


@figure(
    "pipeline-stages",
    "13",
    "一个像素经过了哪些阶段？",
    dict(point=[0.5, 0.5], angle=25, wave=0.2),
    [
        slider("angle", "模型转角 / °", -70, 70, 1),
        slider("wave", "顶点波幅", -0.8, 0.8, 0.01),
    ],
    source=("figures.py", "stages"),
)
def pipeline_stages(p, t):
    return _core("13", "figures.py").stages(p, t, Drawing, _core("13"), _png)


@figure(
    "alpha-compositing",
    "13",
    "半透明颜色为什么依赖前后顺序？",
    dict(position=[0, 0], alpha=0.5),
    [slider("alpha", "每层 alpha", 0, 1, 0.01)],
    source=("figures.py", "alpha_layers"),
    animated=False,
)
def alpha_compositing(p, t):
    return _core("13", "figures.py").alpha_layers(p, t, Drawing, _core("13"), _png)


@figure(
    "reflection-shear",
    "02",
    "镜像与错切：保持了什么，又改变了什么？",
    dict(
        point=[1.0, 0.3, 0.5],
        normal=[0.8, 0.5, 0.2],
        distance=0.25,
        shear=0.8,
        operation="平面镜像",
        edit="点 p",
    ),
    [
        choice("operation", "变换", ["平面镜像", "错切"]),
        dict(
            choice("edit", "编辑", ["点 p", "平面法向 n"]),
            when={"operation": "平面镜像"},
        ),
        dict(
            slider("distance", "镜面距离 d", -0.6, 0.6, 0.01),
            when={"operation": "平面镜像"},
        ),
        dict(slider("shear", "错切系数 k", -2, 2, 0.01), when={"operation": "错切"}),
    ],
    source=("linear3d_figures.py", "reflection_shear"),
)
def reflection_shear(p, t):
    return _core("02", "linear3d_figures.py").reflection_shear(
        p, t, Drawing, _core("02", "linear3d.py")
    )


@figure(
    "height-normal",
    "07",
    "纹理里的三个数，也可以是一根法线",
    dict(point=[0.34, 0.42], amplitude=0.25, frequency=1.5, normal_read="data"),
    [
        slider("amplitude", "高度幅值", 0, 0.6, 0.01),
        slider("frequency", "纹理频率", 0.25, 4, 0.25),
        dict(
            key="normal_read",
            label="读取方式",
            options=[
                dict(value="data", label="数据纹理"),
                dict(value="srgb_wrong", label="误当 sRGB"),
            ],
        ),
    ],
    source=("surface_maps_figures.py", "height_normal"),
    animated=False,
)
def height_normal(p, t):
    return _core("07", "surface_maps_figures.py").height_normal(
        p, t, Drawing, _core("07", "surface_maps.py"), _png
    )


@figure(
    "bump-displacement",
    "07",
    "改变光照的法线，还是改变真实轮廓？",
    dict(amplitude=0.25, frequency=1.5, divisions=16, light_xy=[-3, 3]),
    [
        slider("amplitude", "高度幅值", 0, 0.6, 0.01),
        slider("frequency", "纹理频率", 0.25, 4, 0.25),
        choice("divisions", "网格分段", [4, 8, 16, 32]),
    ],
    source=("surface_maps_figures.py", "bump_displacement"),
    animated=False,
)
def bump_displacement(p, t):
    return _core("07", "surface_maps_figures.py").bump_displacement(
        p, t, Drawing, _core("07", "surface_maps.py"), _png
    )


@figure(
    "general-basis",
    "02",
    "世界点不动，改变描述它的坐标架",
    dict(
        point=[1.6, 1.0, 1.0],
        origin=[-0.5, -0.4, 0.0],
        basis_x=[1.5, 0.2, 0.1],
        basis_y=[0.6, 1.2, 0.2],
        basis_z=[0.2, 0.1, 1.1],
        edit="basis_x",
    ),
    [
        dict(
            key="edit",
            label="编辑对象",
            options=[
                dict(value=key, label=label)
                for key, label in (
                    ("point", "世界点 p"),
                    ("origin", "原点 o"),
                    ("basis_x", "基 b₁"),
                    ("basis_y", "基 b₂"),
                    ("basis_z", "基 b₃"),
                )
            ],
        )
    ],
    source=("hierarchy_figures.py", "general_basis"),
    animated=False,
)
def general_basis(p, t):
    return _core("02", "hierarchy_figures.py").general_basis(
        p, t, Drawing, _core("02", "hierarchy.py")
    )


@figure(
    "two-link-hierarchy",
    "02",
    "父架到世界，子架到父架",
    dict(base=[-0.6, -0.3], parent_angle=35, child_angle=55, length1=1.6, length2=1.2),
    [
        slider("parent_angle", "父角 θ₁ / °", -180, 180, 1),
        slider("child_angle", "子角 θ₂ / °", -180, 180, 1),
        slider("length1", "第一杆长 L₁", 0, 2, 0.05),
        slider("length2", "第二杆长 L₂", 0, 2, 0.05),
    ],
    source=("hierarchy_figures.py", "two_link_hierarchy"),
    animated=False,
)
def two_link_hierarchy(p, t):
    return _core("02", "hierarchy_figures.py").two_link_hierarchy(
        p, t, Drawing, _core("02", "hierarchy.py")
    )


@figure(
    "temporal-aliasing",
    "08",
    "同一组帧，真实正转与等价反转",
    dict(time=0.375, speed=1.0, fps=12),
    [slider("fps", "帧率 / fps", 4, 40, 1)],
    source=("temporal_figures.py", "aliasing"),
    animated=False,
)
def temporal_aliasing(p, t):
    return _core("08", "temporal_figures.py").aliasing(
        p, t, Drawing, _core("08", "temporal.py"), _png
    )


@figure(
    "temporal-shutter",
    "08",
    "一帧收集一段时间的光",
    dict(time=0.375, speed=1.0, fps=12, duty=1.0, samples=2),
    [
        slider("fps", "帧率 / fps", 4, 40, 1),
        slider("speed", "真实速度 / rev/s", -3, 3, 0.05),
        choice("samples", "时间样本数 N", [1, 2, 4, 8, 16, 32, 64]),
    ],
    source=("temporal_figures.py", "shutter"),
    animated=False,
)
def temporal_shutter(p, t):
    return _core("08", "temporal_figures.py").shutter(
        p, t, Drawing, _core("08", "temporal.py"), _png
    )


@figure(
    "environment-direction",
    "14",
    "一个方向，两种纹理地址",
    dict(uv=[0.12, 0.38], pattern="studio"),
    [
        dict(
            key="pattern",
            label="环境",
            options=[
                dict(value="studio", label="色窗环境"),
                dict(value="direction", label="方向颜色"),
            ],
        )
    ],
    source=("environment_figures.py", "environment_direction"),
    animated=False,
)
def environment_direction(p, t):
    return _core("14", "environment_figures.py").environment_direction(
        p, t, Drawing, _core("14"), _png
    )


@figure(
    "environment-reflection",
    "14",
    "法线改变反射，也改变查询地址",
    dict(normal=[0.3, 1.0], eye=[-0.8, 0.8], pattern="studio"),
    [
        dict(
            key="pattern",
            label="环境",
            options=[
                dict(value="studio", label="色窗环境"),
                dict(value="direction", label="方向颜色"),
            ],
        )
    ],
    source=("environment_figures.py", "reflection_lookup"),
    animated=False,
)
def environment_reflection(p, t):
    return _core("14", "environment_figures.py").reflection_lookup(
        p, t, Drawing, _core("14"), _png
    )


@figure(
    "value-noise-lattice",
    "14",
    "从四个格点，构造一个连续的值",
    dict(point=[0.37, 0.42], seed=7),
    source=("procedural_figures.py", "value_noise_lattice"),
    animated=False,
)
def value_noise_lattice(p, t):
    return _core("14", "procedural_figures.py").value_noise_lattice(
        p, t, Drawing, _core("14", "procedural.py"), _png
    )


@figure(
    "fbm-coordinate-space",
    "14",
    "叠加尺度，再选择纹理所在的空间",
    dict(
        point=[0.25, -0.35],
        scale=2.5,
        octaves=4,
        gain=0.5,
        lacunarity=2.0,
        slice=0.4,
        shift=[0.35, 0.0],
        seed=7,
    ),
    [
        choice("octaves", "层数", [1, 2, 3, 4]),
        slider("gain", "幅度衰减", 0, 1, 0.05),
        slider("slice", "三维切片 z", -1, 1, 0.05),
    ],
    source=("procedural_figures.py", "fbm_coordinate_space"),
    animated=False,
)
def fbm_coordinate_space(p, t):
    return _core("14", "procedural_figures.py").fbm_coordinate_space(
        p, t, Drawing, _core("14", "procedural.py"), _png
    )


@figure(
    "spline-join",
    "11",
    "接得上、方向一致、速度连续，是三件事",
    _core("11", "spline_figures.py").DEFAULTS["spline-join"],
    _core("11", "spline_figures.py").CONTROLS["spline-join"],
    source=("spline_figures.py", "spline_join"),
    animated=False,
)
def spline_join(p, t):
    return _core("11", "spline_figures.py").spline_join(
        p, t, Drawing, _core("11"), _core("11", "splines.py"), _png
    )


@figure(
    "bspline-local",
    "11",
    "移动一个控制点，只改变一段曲线",
    _core("11", "spline_figures.py").DEFAULTS["bspline-local"],
    _core("11", "spline_figures.py").CONTROLS["bspline-local"],
    source=("spline_figures.py", "bspline_local"),
    animated=False,
)
def bspline_local(p, t):
    return _core("11", "spline_figures.py").bspline_local(
        p, t, Drawing, _core("11"), _core("11", "splines.py"), _png
    )


@figure(
    "rational-arc",
    "11",
    "一个权重，让二次曲线成为圆弧",
    _core("11", "spline_figures.py").DEFAULTS["rational-arc"],
    _core("11", "spline_figures.py").CONTROLS["rational-arc"],
    source=("spline_figures.py", "rational_arc"),
    animated=False,
)
def rational_arc(p, t):
    return _core("11", "spline_figures.py").rational_arc(
        p, t, Drawing, _core("11"), _core("11", "splines.py"), _png
    )


@figure(
    "patch-construction",
    "15",
    "两次曲线求值，得到一个曲面点",
    _core("15", "figures.py").DEFAULTS["patch-construction"],
    _core("15", "figures.py").CONTROLS["patch-construction"],
    source=("figures.py", "patch_construction"),
    animated=False,
)
def patch_construction(p, t):
    return _core("15", "figures.py").patch_construction(
        p, t, Drawing, _core("15"), _png
    )


@figure(
    "patch-frame",
    "15",
    "两个偏导，张成一张切平面",
    _core("15", "figures.py").DEFAULTS["patch-frame"],
    _core("15", "figures.py").CONTROLS["patch-frame"],
    source=("figures.py", "patch_frame"),
    animated=False,
)
def patch_frame(p, t):
    return _core("15", "figures.py").patch_frame(p, t, Drawing, _core("15"), _png)


@figure(
    "patch-seam",
    "15",
    "接缝上的位置、切向与弯曲",
    _core("15", "figures.py").DEFAULTS["patch-seam"],
    _core("15", "figures.py").CONTROLS["patch-seam"],
    source=("figures.py", "patch_seam"),
    animated=False,
)
def patch_seam(p, t):
    return _core("15", "figures.py").patch_seam(p, t, Drawing, _core("15"), _png)


def catalog():
    initial_progress = {"casteljau-steps": 0.45, "light-lobes": 0.4}
    result = []
    for identifier, spec in FIGURES.items():
        function = spec["function"]
        if spec["source"]:
            filename, name = spec["source"]
            function = getattr(_core(spec["chapter"], filename), name)
        result.append(
            {
                **{k: v for k, v in spec.items() if k not in ("function", "source")},
                "initialProgress": initial_progress.get(identifier, 1),
                "sourcePath": Path(inspect.getsourcefile(function))
                .relative_to(ROOT)
                .as_posix(),
                "sourceLine": inspect.getsourcelines(function)[1],
            }
        )
    return result


def render(identifier, params=None, progress=1):
    """只接受登记过的参数；数组形状、数值范围与选项在计算前检查。"""
    if identifier not in FIGURES:
        raise ValueError("未知教学插图")
    spec = FIGURES[identifier]
    supplied = params or {}
    if not isinstance(supplied, dict):
        raise ValueError("参数必须是对象")
    if (
        not isinstance(progress, (int, float))
        or not np.isfinite(progress)
        or not 0 <= progress <= 1
    ):
        raise ValueError("进度必须在 0 到 1 之间")
    p = {}
    for key, default in spec["defaults"].items():
        value = supplied.get(key, default)
        if isinstance(default, list):
            a = np.asarray(value, float)
            bound = (
                24
                if identifier in {"ripmap-axis", "elliptical-footprint"}
                and key == "axis"
                else 20
            )
            if (
                a.shape != np.asarray(default).shape
                or not np.isfinite(a).all()
                or np.abs(a).max() > bound
            ):
                raise ValueError("控制点格式或范围无效")
            value = a.tolist()
        elif isinstance(default, (float, int)) and not isinstance(default, bool):
            if not isinstance(value, (float, int)) or not np.isfinite(value):
                raise ValueError("参数必须是有限数值")
        for control in spec["controls"]:
            if control["key"] != key:
                continue
            if "options" in control and value not in [
                o["value"] for o in control["options"]
            ]:
                raise ValueError("无效选项")
            if "min" in control and not control["min"] <= value <= control["max"]:
                raise ValueError("参数超出范围")
        p[key] = value
    # Handles have tighter meaningful domains than the generic transport bound.
    limits = {
        "projection-rays": ("point", [2, -1.5], [4, 1.5]),
        "perspective-divide": ("point", [0.1, 1], [2.5, 4]),
        "normal-transform": ("scale", [0.4, 0.4], [2.4, 1.5]),
        "surface-normal": ("axes", [0.5, 0.5], [2.4, 1.4]),
        "texture-filter": ("point", [0, 0], [1, 1]),
        "ray-reflection": ("normal", [-1, 0.3], [1, 1.4]),
    }
    if identifier in limits:
        key, lo, hi = limits[identifier]
        p[key] = np.clip(p[key], lo, hi).tolist()
    if identifier == "ray-reflection":
        p["incoming"] = np.clip(p["incoming"], [-2, 0.3], [2, 1.6]).tolist()
    if identifier == "depth-precision":
        p["distance"] = float(np.clip(p["distance"], 2.01, 9.8))
    if identifier == "perspective-uv":
        p["probe"] = float(np.clip(p["probe"], 0, 1))
    drawing = spec["function"](p, float(progress))
    return dict(id=identifier, params=p, progress=progress, **drawing.result())
