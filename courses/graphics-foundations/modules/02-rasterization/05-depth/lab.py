"""深度实验：Python 生成三个像素数组，Bokeh 只显示并回传所选像素。"""

import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, Range1d
from bokeh.plotting import figure

from .core import (clip_vertices, depth_from_distance, distance_from_depth, render)


def _rgba(image, linear_rgb=False):
    """数组首行为顶部；Bokeh 下原点图像需在上传时翻转一次。"""
    image = np.clip(image, 0, 1)
    if linear_rgb:
        image = np.where(image <= .0031308, 12.92*image, 1.055*image**(1/2.4)-.055)
    rgba = np.empty((*image.shape[:2], 4), dtype=np.uint8)
    rgba[..., :3], rgba[..., 3] = np.rint(image*255).astype(np.uint8), 255
    return np.ascontiguousarray(rgba.view(np.uint32).reshape(image.shape[:2])[::-1])


def build():
    scene = pn.widgets.Select(name="实验场景", options=["相交的两个斜面", "一角穿过近平面", "完全同深度", "近乎重合与量化"], width=200)
    order = pn.widgets.RadioButtonGroup(name="绘制顺序", options=["A → B", "B → A"], value="A → B")
    precision = pn.widgets.Select(name="深度存储", options={"float64 参考": 0, "8 位定点演示": 8, "16 位定点演示": 16, "24 位定点演示": 24}, value=0, width=180)
    resolution = pn.widgets.Select(name="像素分辨率", options=[48, 96, 144], value=96, width=135)
    slope = pn.widgets.FloatSlider(name="斜面深度起伏", start=0, end=3.5, value=2, step=.1, width=250)
    offset = pn.widgets.FloatSlider(name="B 顶点距离偏移", start=-.3, end=.3, value=0, step=.001, width=250)
    near = pn.widgets.FloatSlider(name="近平面 n", start=.1, end=2, value=1, step=.1, width=250)
    far = pn.widgets.FloatSlider(name="远平面 F", start=10, end=100, value=10, step=5, width=250)
    row = pn.widgets.IntInput(name="数组行 row ↓", value=47, start=0, end=95, width=145)
    col = pn.widgets.IntInput(name="数组列 col →", value=47, start=0, end=95, width=145)
    reset = pn.widgets.Button(name="恢复默认", width=120)
    summary, probe = pn.pane.Markdown(), pn.pane.Markdown()
    summary.sizing_mode = probe.sizing_mode = "stretch_width"
    images, plots = [], []
    marker = ColumnDataSource(dict(x=[47.5], y=[48.5]), name="depth_pixel_probe")
    for index, title in enumerate(["逐像素深度测试", "错误对照 · 整面平均深度排序", "深度 D · 固定 0—1 灰度"]):
        source = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name=f"depth_image_{index}")
        plot = figure(width=320, height=340, sizing_mode="scale_width", min_width=250,
                      x_range=Range1d(0, 96), y_range=Range1d(0, 96), title=title,
                      toolbar_location=None, tools="", min_border=5, name=f"depth_canvas_{index}")
        plot.image_rgba(source=source, image="image", x="x", y="y", dw="dw", dh="dh", origin="bottom_left")
        plot.rect("x", "y", source=marker, width=1, height=1, fill_alpha=0, line_color="white", line_width=3)
        plot.rect("x", "y", source=marker, width=1, height=1, fill_alpha=0, line_color="#173f33", line_width=1)
        plot.axis.visible = plot.grid.visible = False
        plot.background_fill_color = plot.border_fill_color = "#fbfcf8"
        plot.outline_line_color = "#d4dbd0"
        plot.title.text_font_size = "13px"
        plot.title.text_font_style = "normal"
        images.append(source)
        plots.append(plot)
    curve_source = ColumnDataSource(dict(x=[], y=[]))
    tick_source = ColumnDataSource(dict(x=[], y=[]))
    curve = figure(height=270, sizing_mode="stretch_width", x_range=(0, 10), y_range=(-.04, 1.04),
                   toolbar_location=None, tools="", title="相机距离 d → 存储深度 D：16 个等间距 D 刻度落在哪里？")
    curve.xaxis.axis_label, curve.yaxis.axis_label = "相机前方距离 d = −z_view", "归一化深度 D"
    curve.line("x", "y", source=curve_source, line_color="#25563e", line_width=2.5)
    curve.segment(x0="x", y0=0, x1="x", y1="y", source=tick_source, line_color="#be9c62", line_alpha=.6)
    curve.scatter("x", "y", source=tick_source, color="#be9c62", size=7)
    curve.background_fill_color = curve.border_fill_color = "#fbfcf8"
    curve.title.text_font_size = "13px"
    curve.title.text_font_style = "normal"
    state = dict(correct=None, painter=None, updating=False, size=96)

    def probe_pixel(event=None):
        if state["updating"] or state["correct"] is None:
            return
        size = resolution.value
        r, c = np.clip([row.value or 0, col.value or 0], 0, size-1).astype(int)
        state["updating"] = True
        row.value, col.value = int(r), int(c)
        state["updating"] = False
        marker.data = dict(x=[c+.5], y=[size-r-.5])
        result, painter = state["correct"], state["painter"]
        stored_depth = np.inf
        rows = []
        for index in result["order"]:
            raw, stored = result["candidates"][index, r, c], result["stored_candidates"][index, r, c]
            if np.isfinite(raw):
                passed = stored < stored_depth
                action = "通过，更新" if passed else ("同深度，保留先画者" if stored == stored_depth else "更远，拒绝")
                rows.append(f"| {'AB'[index]} | {raw:.8f} | {stored:.8f} | {action} |")
                if passed:
                    stored_depth = stored
            else:
                rows.append(f"| {'AB'[index]} | — | — | 不覆盖该像素 |")
        winner = result['owner'][r, c]
        wrong = painter['owner'][r, c]
        winning_label = '背景' if winner < 0 else 'AB'[winner]
        painter_label = '背景' if wrong < 0 else 'AB'[wrong]
        probe.object = (f"**像素 `[{r}, {c}]`** · 采样中心 ({c+.5:.1f}, {size-r-.5:.1f})，几何 y 向上\n\n"
                        "| 提交顺序 | 理想 D | 存储 D | 与当前缓冲比较 |\n|---|---:|---:|---|\n" + "\n".join(rows) +
                        f"\n\n**最终胜者：{winning_label}**；整面排序对照：{painter_label}。规则始终是严格 `<`，相等时先画者赢。")

    def update(event=None):
        size = resolution.value
        a_xy = np.array([[-.88, -.72], [.82, -.60], [-.1, .9]])
        b_xy = np.array([[-.78, .65], [.83, .75], [.05, -.87]])
        a_depth = np.array([4-slope.value, 4+slope.value, 4])
        b_depth = np.array([4+slope.value, 4-slope.value, 4]) + offset.value
        if scene.value == "一角穿过近平面":
            a_depth = np.array([.4, 4, 4])
        elif scene.value == "完全同深度":
            b_xy = a_xy.copy()
            a_depth = b_depth = np.full(3, 4.)
        elif scene.value == "近乎重合与量化":
            b_xy = a_xy.copy()
            a_depth, b_depth = np.full(3, 7.), np.full(3, 7.003 + offset.value)
        triangles = [clip_vertices(a_xy, a_depth, near.value, far.value),
                     clip_vertices(b_xy, b_depth, near.value, far.value)]
        colors = [[.055, .32, .18], [.68, .16, .06]]
        sequence = [0, 1] if order.value == "A → B" else [1, 0]
        correct = render(triangles, colors, size, size, sequence, bits=precision.value or None)
        painter = render(triangles, colors, size, size, sequence, method="painter", bits=precision.value or None)
        state["correct"], state["painter"] = correct, painter
        depth_image = np.repeat(np.where(np.isfinite(correct["depth"]), correct["depth"], .96)[..., None], 3, axis=2)
        depth_image[correct["owner"] < 0] = [.90, .94, .88]  # 背景有淡绿色，与 D=1 区分。
        for index, pixels in enumerate([correct['color'], painter['color'], depth_image]):
            images[index].data = dict(image=[_rgba(pixels, linear_rgb=index < 2)], x=[0], y=[0], dw=[size], dh=[size])
            plots[index].x_range.end = plots[index].y_range.end = size
        old = state["size"]
        state["updating"] = True
        row.end = col.end = size-1
        row.value = min(size-1, int((row.value+.5)/old*size))
        col.value = min(size-1, int((col.value+.5)/old*size))
        state["size"], state["updating"] = size, False
        mismatch = np.sum(correct["owner"] != painter["owner"])
        overlap = np.isfinite(correct["candidates"]).all(axis=0)
        tied = overlap & (correct["stored_candidates"][0] == correct["stored_candidates"][1])
        summary.object = (f"**A 为绿色，B 为橙色。** 整面平均深度排序与逐像素结果有 **{mismatch:,}** 个像素不同；"
                          f"重叠区有 **{np.sum(tied):,}** 个像素的存储深度完全相同。\n\n"
                          "点击任意图查看同一像素的两个候选值。场景固定顶点的投影位置，沿相机射线调节距离；"
                          "因此改变起伏会改变三维三角形，并非刚体平移。深度图黑近白远，背景为淡绿，色阶始终固定 [0,1]。")
        d = np.geomspace(near.value, far.value, 300)
        curve_source.data = dict(x=d, y=depth_from_distance(d, near.value, far.value))
        levels = np.linspace(0, 1, 16)
        tick_source.data = dict(x=distance_from_depth(levels, near.value, far.value), y=levels)
        curve.x_range.start, curve.x_range.end = 0, far.value
        probe_pixel()

    def pick(event):
        size = resolution.value
        if 0 <= event.x < size and 0 <= event.y < size:
            state["updating"] = True
            row.value, col.value = size-1-int(event.y), int(event.x)
            state["updating"] = False
            probe_pixel()

    def defaults(event):
        for control, value in [(scene, "相交的两个斜面"), (order, "A → B"), (precision, 0),
                               (resolution, 96), (slope, 2), (offset, 0), (near, 1), (far, 10)]:
            control.value = value

    for plot in plots:
        plot.on_event(Tap, pick)
    for control in (scene, order, precision, resolution, slope, offset, near, far):
        control.param.watch(update, "value")
    row.param.watch(probe_pixel, "value")
    col.param.watch(probe_pixel, "value")
    reset.on_click(defaults)
    update()
    return pn.Column(pn.pane.Markdown("先在交叉处选两个像素，检查谁在前面；再切换「完全同深度」，交换 A、B 顺序，观察平局如何处理。"),
                     pn.FlexBox(scene, order, precision, resolution, reset, flex_wrap="wrap", gap="12px"),
                     pn.FlexBox(*[pn.Column(plot, min_width=250, sizing_mode="stretch_width", styles={"flex": "1 1 280px"}) for plot in plots], flex_wrap="wrap", gap="16px", sizing_mode="stretch_width"),
                     summary, pn.FlexBox(row, col, flex_wrap="wrap", gap="12px"), probe,
                     pn.FlexBox(slope, offset, near, far, flex_wrap="wrap", gap="20px"), curve,
                     pn.pane.Markdown("曲线中的 16 个点只是 4 位定点分布的放大示意，与上方实际选用的存储精度分开。先把 near 拉近，观察距离刻度如何挤在相机附近。"),
                     sizing_mode="stretch_width")
