"""逐像素实验；Python 生成覆盖、权重、颜色与裁剪顶点。"""
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, CustomJS, FixedTicker
from bokeh.plotting import figure

from .core import linear_to_srgb
from .raster import (SUBPIXEL, edge_function, top_left, snap_vertices, triangle_coverage,
                     pixel_bounds, rasterize_triangle, clip_triangle, clip_to_screen)


def build():
    preset = pn.widgets.Select(name="场景", options=["单个彩色三角形", "方形 · 两个三角形", "近平面切割", "共线退化"], width=190)
    size = pn.widgets.Select(name="输出分辨率", options=[8, 16, 32, 64], value=16, width=140)
    rule = pn.widgets.Select(name="边界归属", options={"一致边规则": "top_left", "所有边都包含": "inclusive"}, width=175)
    display = pn.widgets.RadioButtonGroup(name="输出内容", options=["颜色", "覆盖次数"], value="颜色")
    shift = pn.widgets.FloatSlider(name="水平移动（像素）", start=-2, end=2, step=.0625, value=0, width=260)
    near_z = pn.widgets.FloatSlider(name="顶点 C 的 z_clip · near=-1", start=-2.5, end=.5, step=.05, value=-1.6, width=260, visible=False)
    selected = pn.widgets.Select(name="逐步检查哪个输出三角形", options={"三角形 1": 0}, value=0, width=225)
    step = pn.widgets.IntSlider(name="包围盒候选 · 步号", start=1, end=2, value=1, sizing_mode="stretch_width")
    previous = pn.widgets.Button(name="← 上一个像素", width=145)
    following = pn.widgets.Button(name="下一个像素 →", width=145)
    restart = pn.widgets.Button(name="从包围盒开始", width=145)
    cells = ColumnDataSource(dict(x=[], y=[], color=[]), name="raster_cells")
    image = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name="raster_image")
    outlines = ColumnDataSource(dict(xs=[], ys=[]))
    original = ColumnDataSource(dict(xs=[], ys=[]))
    probe = ColumnDataSource(dict(x=[], y=[]), name="raster_probe")
    bbox = ColumnDataSource(dict(x=[], y=[], width=[], height=[]))
    extent = ColumnDataSource(dict(size=[16]))
    figures = []
    for name, title in [("raster_grid", "① 像素中心与边界"), ("raster_output", "② 写入图像数组")]:
        fig = figure(title=title, height=360, sizing_mode="stretch_width", tools="", toolbar_location=None,
                     x_range=(-1, 17), y_range=(-1, 17), min_border=34,
                     background_fill_color="#fbfcf8", border_fill_color="#fbfcf8", outline_line_color=None, name=name)
        fig.title.text_font_size = "16px"
        fig.axis.major_label_text_font_size = "14px"
        fig.axis.axis_label_text_font_size = "14px"
        fig.axis.axis_label_text_font_style = "normal"
        fig.xaxis.axis_label, fig.yaxis.axis_label = "x →", "y ↑"
        fig.grid.visible = False
        equal = CustomJS(args=dict(plot=fig, extent=extent), code="""
const w=plot.inner_width, h=plot.inner_height, n=extent.data.size[0];
if(w>0&&h>0){ const sx=n*1.12*Math.max(1,w/h), sy=n*1.12*Math.max(1,h/w);
plot.x_range.setv({start:n/2-sx/2,end:n/2+sx/2});
plot.y_range.setv({start:n/2-sy/2,end:n/2+sy/2}); }
""")
        fig.js_on_change("inner_width", equal); fig.js_on_change("inner_height", equal)
        extent.js_on_change("data", equal)
        figures.append(fig)
    grid_plot, output_plot = figures
    grid_plot.rect("x", "y", width=1, height=1, fill_color="color", line_color="#ccd4c6", line_alpha=.5, source=cells)
    grid_plot.scatter("x", "y", size=3, color="#87947b", source=cells)
    grid_plot.multi_line("xs", "ys", source=original, color="#81917d", line_dash="dashed", line_width=2)
    grid_plot.multi_line("xs", "ys", source=outlines, color="#285b40", line_width=2)
    grid_plot.rect("x", "y", width="width", height="height", source=bbox,
                   fill_alpha=0, line_color="#54769a", line_dash="dotdash", line_width=2)
    output_plot.image_rgba(image="image", x="x", y="y", dw="dw", dh="dh", source=image, origin="bottom_left")
    for fig in figures:
        fig.rect("x", "y", width=1, height=1, fill_alpha=0, line_color="#102d23", line_width=4, source=probe)
        fig.rect("x", "y", width=1, height=1, fill_alpha=0, line_color="white", line_width=2, source=probe)
    facts = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px", "line-height": "1.7"})
    summary = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px"})
    state = dict(triangles=[], attrs=[], counts=None, colors=None, candidates=np.empty((0, 2)), updating=False)

    def pack(rgb):
        c = np.rint(linear_to_srgb(rgb) * 255).astype(np.uint32)
        return np.flipud(c[..., 0] | (c[..., 1] << 8) | (c[..., 2] << 16) | (255 << 24)).copy()

    def show_probe(x, y):
        n, index = size.value, selected.value
        probe.data = dict(x=[x], y=[y])
        if index is None or not state["triangles"]:
            facts.object = "这个场景没有非退化的输出三角形；没有像素需要写入。"
            return
        tri = state["triangles"][index]
        candidate = np.flatnonzero(np.all(state["candidates"] == [x, y], axis=1))
        if len(candidate):
            state["updating"] = True
            step.value = int(candidate[0]) + 1
            state["updating"] = False
        mask, weights = triangle_coverage(tri, [x, y], rule.value)
        q, p = snap_vertices(tri), np.rint(np.array([x, y]) * SUBPIXEL).astype(np.int64)
        edges = [(q[1], q[2]), (q[2], q[0]), (q[0], q[1])]
        if edge_function(q[0], q[1], q[2]) < 0:
            edges = [(b, a) for a, b in edges]
        values = [int(edge_function(a, b, p)) for a, b in edges]
        flags = [rule.value == "inclusive" or top_left(a, b) for a, b in edges]
        col, row = int(x), n - 1 - int(y)
        x0, x1, y0, y1 = pixel_bounds(tri, n, n)
        verdicts = ["通过" if v > 0 or (v == 0 and include) else "拒绝" for v, include in zip(values, flags)]
        lines = "\n".join(f"| {label} | {value} | {'包含' if flag else '排除'} | {result} |"
                          for label, value, flag, result in zip(["BC", "CA", "AB"], values, flags, verdicts))
        values_text = ", ".join(f"{v:.4f}" for v in weights)
        rgb = weights @ state["attrs"][index]
        result = "写入：线性 RGB = (" + ", ".join(f"{v:.4f}" for v in rgb) + ")" if bool(mask) else "不写入：至少一个边测试未通过。"
        facts.object = f"""**P = ({x:.1f}, {y:.1f}) → `image[{row}, {col}]`** · 当前三角形{'覆盖' if mask else '未覆盖'}

包围盒：`{x0} ≤ x_index < {x1}`，`{y0} ≤ y_index < {y1}`。边值使用 1/256 像素整数单位。

| 有向边（已统一绕序） | E(P) | E=0 时 | 判断 |
| --- | ---: | --- | --- |
{lines}

权重 `(λA, λB, λC) = ({values_text})`。{result}

全部三角形合计覆盖 **{state['counts'][row, col]} 次**。蓝虚线框是当前候选包围盒；浅绿表示一次覆盖，橙红表示重复覆盖。"""

    def step_probe(event=None):
        if state["updating"]:
            return
        candidates = state["candidates"]
        if len(candidates):
            x, y = candidates[min(step.value - 1, len(candidates) - 1)]
            show_probe(float(x), float(y))

    def choose_triangle(event=None, preserve=False):
        old_point = (probe.data["x"][0], probe.data["y"][0]) if preserve and len(probe.data["x"]) else None
        state["updating"] = True
        if selected.value is None or not state["triangles"]:
            state["candidates"] = np.empty((0, 2)); bbox.data = dict(x=[], y=[], width=[], height=[])
        else:
            x0, x1, y0, y1 = pixel_bounds(state["triangles"][selected.value], size.value, size.value)
            x, y = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
            state["candidates"] = np.stack([x.ravel(), y.ravel()], axis=-1)
            bbox.data = dict(x=[(x0+x1)/2], y=[(y0+y1)/2], width=[x1-x0], height=[y1-y0])
        step.end, step.value = max(2, len(state["candidates"])), 1
        step.disabled = previous.disabled = following.disabled = restart.disabled = len(state["candidates"]) == 0
        state["updating"] = False
        if len(state["candidates"]):
            show_probe(*old_point) if old_point is not None else step_probe()
        else:
            probe.data = dict(x=[], y=[])
            facts.object = "没有候选样本：三角形退化、被完全裁掉，或包围盒不包含任何像素中心。"

    def update_output(event=None):
        if state["counts"] is None:
            return
        palette = np.array([[.86, .89, .83], [.23, .51, .34], [.86, .17, .065]])
        rgb = state["colors"] if display.value == "颜色" else palette[np.minimum(state["counts"], 2)]
        n = size.value
        image.data = dict(image=[pack(rgb)], x=[0], y=[0], dw=[n], dh=[n])

    def render(event=None):
        n = size.value
        near_z.visible = preset.value == "近平面切割"
        if preset.value == "方形 · 两个三角形":
            xy = np.array([[.25, .25], [.75, .25], [.75, .75], [.25, .75]])
            faces, colors = [[0, 1, 2], [0, 2, 3]], np.array([[1, .05, .02], [.05, 1, .02], [.02, .05, 1], [1, .7, .02]])
        else:
            xy = np.array([[.15, .18], [.86, .22], [.4, .87]])
            if preset.value == "共线退化":
                xy = np.array([[.2, .2], [.5, .5], [.8, .8]])
            faces, colors = [[0, 1, 2]], np.eye(3)
        v = np.column_stack([xy * 2 - 1, np.zeros(len(xy)), np.ones(len(xy))])
        v[:, 0] += 2 * shift.value / n
        if preset.value == "近平面切割":
            v[2, 2] = near_z.value
        old_lines, new_lines, triangles, attributes = [], [], [], []
        counts, rendered = np.zeros((n, n), dtype=int), np.full((n, n, 3), .91)
        for face in faces:
            original_xy, _, _ = clip_to_screen(v[face], n, n)
            old_lines.append(np.vstack([original_xy, original_xy[0]]))
            clipped, attrs = clip_triangle(v[face], colors[face])
            for clip, attr in zip(clipped, attrs):
                screen, _, _ = clip_to_screen(clip, n, n)
                if edge_function(*snap_vertices(screen)) == 0:
                    continue
                triangles.append(screen); attributes.append(attr)
                new_lines.append(np.vstack([screen, screen[0]]))
                rows, cols, weights = rasterize_triangle(screen, n, n, rule.value)
                counts[rows, cols] += 1
                rendered[rows, cols] = weights @ attr
        state.update(triangles=triangles, attrs=attributes, counts=counts, colors=rendered)
        original.data = dict(xs=[a[:, 0] for a in old_lines], ys=[a[:, 1] for a in old_lines])
        outlines.data = dict(xs=[a[:, 0] for a in new_lines], ys=[a[:, 1] for a in new_lines])
        x, y = np.meshgrid(np.arange(n) + .5, np.arange(n) + .5)
        palette = np.array(["#f1f3ed", "#b7d7b8", "#ed9476"])
        cells.data = dict(x=x.ravel(), y=y.ravel(), color=palette[np.minimum(np.flipud(counts), 2)].ravel())
        extent.data = dict(size=[n])
        for fig in figures:
            fig.xaxis.ticker = fig.yaxis.ticker = FixedTicker(ticks=list(range(0, n+1, max(1, n//4))))
        state["updating"] = True
        selected.options = {f"三角形 {i+1}": i for i in range(len(triangles))}
        selected.value = 0 if triangles else None
        state["updating"] = False
        choose_triangle(); update_output()
        summary.object = f"**{len(faces)} 个输入三角形 → 裁剪 / 去退化后 {len(triangles)} 个三角形 → {np.count_nonzero(counts):,} 个像素**。重复覆盖 {np.count_nonzero(counts > 1)} 个。显示颜色最后编码为 sRGB；覆盖次数使用固定图例。"

    def tap(event):
        n = size.value
        if event.x is not None and event.y is not None and 0 <= event.x < n and 0 <= event.y < n:
            show_probe(np.floor(event.x) + .5, np.floor(event.y) + .5)

    for fig in figures:
        fig.on_event(Tap, tap)
    for control in (preset, size, rule, shift, near_z):
        control.param.watch(render, "value")
    selected.param.watch(lambda event: choose_triangle(preserve=True) if not state["updating"] else None, "value")
    display.param.watch(update_output, "value")
    step.param.watch(step_probe, "value")
    previous.on_click(lambda event: setattr(step, "value", max(1, step.value - 1)))
    following.on_click(lambda event: setattr(step, "value", min(len(state["candidates"]), step.value + 1)))
    restart.on_click(lambda event: (setattr(step, "value", 1), step_probe()))
    render()
    return pn.Column(
        pn.FlexBox(preset, size, rule, display, flex_wrap="wrap", align_items="center"),
        pn.FlexBox(shift, near_z, flex_wrap="wrap"),
        pn.FlexBox(*[pn.Column(pn.pane.Bokeh(fig, sizing_mode="stretch_width"), sizing_mode="stretch_width", styles={"flex": "1 1 400px", "min-width": "280px"}) for fig in figures], flex_wrap="wrap", sizing_mode="stretch_width"),
        summary, pn.FlexBox(selected, previous, following, restart, flex_wrap="wrap", align_items="center"),
        step, facts,
        pn.pane.Markdown("**建议路线**：选「方形 · 两个三角形」和「覆盖次数」，比较两种边界规则。点击对角线上的像素，切换检查三角形 1 / 2。再选「近平面切割」，拖动 z_clip：越界顶点不会让整张三角形凭空消失。虚线是输入轮廓，实线是裁剪后轮廓。"),
        sizing_mode="stretch_width")
