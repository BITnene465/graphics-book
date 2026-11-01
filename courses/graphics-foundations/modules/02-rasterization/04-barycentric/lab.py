"""本节界面装配。数学在 core.py；拖动预览在 preview.js。没有课程框架。"""

from io import BytesIO
from pathlib import Path
import json

import numpy as np
import panel as pn
from bokeh.events import DocumentReady, Tap
from bokeh.models import ColumnDataSource, CustomJS, Div, FixedTicker, LabelSet, PointDrawTool, Toggle
from bokeh.plotting import figure

from .core import barycentric, interpolate, is_inside, linear_to_srgb
from .raster_lab import build as build_raster


HERE = Path(__file__).parent
CSS = (HERE.parents[4] / "book.css").read_text()


def html(text, **kwargs):
    return pn.pane.HTML(text, stylesheets=[CSS], sizing_mode="stretch_width", **kwargs)


# 四个点就是全部几何状态；其他视图全部由它们算出来。
PRESETS = {
    "内部点": ([0, 2, 0, .5], [0, 0, 2, .5]),
    "边上点": ([0, 2, 0, 1], [0, 0, 2, 1]),
    "外部点": ([0, 2, 0, 1.5], [0, 0, 2, 1.5]),
    "共线顶点": ([0, 1, 2, .5], [0, 1, 2, 1.5]),
}
LABELS = ["A", "B", "C", "P"]
COLORS = ["#d46150", "#449b68", "#507cbb", "#244d39"]


def point_data(x, y):
    return dict(x=list(x), y=list(y), label=LABELS, color=COLORS)


points = ColumnDataSource(point_data(*PRESETS["内部点"]), name="lesson_points")
outline = ColumnDataSource(dict(x=[0, 2, 0, 0], y=[0, 0, 2, 0]))
regions = ColumnDataSource(dict(xs=[], ys=[], color=[]))
cell = ColumnDataSource(dict(x=[.5], y=[.5]))
readout = Div(text="载入当前探针…", stylesheets=[CSS], sizing_mode="stretch_width", name="live_readout")
plot = figure(height=460, x_range=(-.55, 2.55), y_range=(-.4, 2.45),
              tools="", toolbar_location=None, sizing_mode="stretch_width",
              background_fill_color="#fbfcf8", border_fill_color="#fbfcf8",
              outline_line_color=None, min_border=30, name="triangle_canvas")
plot.xaxis.axis_label, plot.yaxis.axis_label = "x", "y"
plot.axis.axis_line_color = "#c5d2c3"
plot.axis.major_tick_line_color = None
plot.axis.minor_tick_line_color = None
plot.axis.major_label_text_color = "#82907d"
plot.axis.axis_label_text_color = "#708269"
plot.axis.axis_label_text_font_style = "normal"
plot.grid.grid_line_color = "#e2e8dc"
plot.xaxis.ticker = FixedTicker(ticks=[0, 1, 2])
plot.yaxis.ticker = FixedTicker(ticks=[0, 1, 2])
area_view = plot.patches("xs", "ys", source=regions, fill_color="color", fill_alpha=.17,
                         line_color="color", line_alpha=.5, line_width=1)
cell_view = plot.rect("x", "y", width=1, height=1, source=cell, fill_alpha=.04,
                      fill_color="#356a46", line_color="#92ac88", line_dash="dashed", visible=False)
plot.line("x", "y", source=outline, color="#809b84", line_width=2)
handles = plot.scatter("x", "y", source=points, size=18, fill_color="color",
                       line_color="#ffffff", line_width=3, nonselection_alpha=1,
                       selection_fill_color="color", selection_line_color="#173e28")
plot.add_layout(LabelSet(x="x", y="y", text="label", source=points, x_offset=12, y_offset=9,
                         text_color="color", text_font_size="13px", text_font_style="bold"))
draw = PointDrawTool(renderers=[handles], add=False, drag=True)
plot.add_tools(draw)
plot.toolbar.active_drag = draw

# Bokeh 原生 Toggle 可由预览直接读取，不需要额外前端状态库。
snap = Toggle(label="吸附到像素中心", active=False, width=154, stylesheets=[CSS], name="snap_toggle")
areas = Toggle(label="显示面积分区", active=True, width=140, stylesheets=[CSS])
areas.js_on_change("active", CustomJS(args=dict(view=area_view), code="view.visible = cb_obj.active;"))
preview = CustomJS(args=dict(points=points, outline=outline, regions=regions, cell=cell,
                             cell_view=cell_view, readout=readout, snap=snap),
                   code=(HERE / "preview.js").read_text())
# PointDrawTool 拖动中只发通用 change，松手才发 change:data。
points.js_on_change("change", preview)
pn.state.curdoc.js_on_event(DocumentReady, CustomJS(args=dict(selection=points.selected), code="""
// PointDraw 默认追加选择。同步限制为一个点，必须在本次拖动计算之前完成。
selection.properties.indices.change.connect(() => {
    if (selection.indices.length > 1) selection.indices = selection.indices.slice(-1);
});
"""))
snap.js_on_change("active", preview)
pn.state.curdoc.js_on_event(DocumentReady, preview)
# 屏幕上一个 x 单位和一个 y 单位等长；窗口变窄也不会扭曲几何。
equal_units = CustomJS(args=dict(plot=plot), code="""
const width = plot.inner_width, height = plot.inner_height;
if (width > 0 && height > 0) {
    const xspan = 3.1 * Math.max(1, width / height);
    const yspan = 3.1 * Math.max(1, height / width);
    plot.x_range.setv({start: 1 - xspan / 2, end: 1 + xspan / 2});
    plot.y_range.setv({start: 1 - yspan / 2, end: 1 + yspan / 2});
}
""")
plot.js_on_change("inner_width", equal_units)
plot.js_on_change("inner_height", equal_units)
pn.state.curdoc.js_on_event(DocumentReady, equal_units)
plot.js_on_event(Tap, CustomJS(args=dict(points=points, snap=snap), code="""
const d = points.data;
// 点到已有控制点交给拖动工具；点击空白处则移动探针。
if (d.x.some((x, i) => Math.hypot(x-cb_obj.x, d.y[i]-cb_obj.y) < .12)) return;
const x = d.x.slice(), y = d.y.slice();
x[3] = snap.active ? Math.floor(cb_obj.x)+.5 : cb_obj.x;
y[3] = snap.active ? Math.floor(cb_obj.y)+.5 : cb_obj.y;
points.data = {...d, x, y};
points.selected.indices = [3];
"""))

selected = pn.widgets.Select(name="编辑点", options=LABELS, value="P", width=78)
x_input = pn.widgets.FloatInput(name="x", value=.5, step=.1, start=-.5, end=2.5, width=98)
y_input = pn.widgets.FloatInput(name="y", value=.5, step=.1, start=-.5, end=2.5, width=98)
verified = html('<div class="status-line">Python 校验就绪</div>')
updating = False
last_good = point_data(*PRESETS["内部点"])


def refresh_python():
    """鼠标松开或数值输入后，独立调用 Python 参考函数。"""
    global updating, last_good
    data = points.data
    coordinates = np.array([data["x"], data["y"]], dtype=float)
    if coordinates.shape != (2, 4) or not np.isfinite(coordinates).all() or (np.abs(coordinates) > 1e6).any():
        points.data = last_good.copy()  # 拖点工具的删除键不能删除课程顶点。
        return
    if snap.active:
        snapped = np.floor(coordinates[:, 3]) + .5
        if not np.array_equal(snapped, coordinates[:, 3]):
            coordinates[:, 3] = snapped
            points.data = point_data(*coordinates)
            return
    last_good = point_data(*coordinates)
    updating = True
    index = LABELS.index(selected.value)
    x_input.value, y_input.value = map(float, coordinates[:, index])
    updating = False
    try:
        w = barycentric(coordinates[:, 3], coordinates[:, :3].T)
        rebuilt = interpolate(w, coordinates[:, :3].T)
        # 覆盖后才编码颜色；外部点保留负权重，不把它伪装成内部点。
        if is_inside(w):
            linear_to_srgb(interpolate(w, np.eye(3)))
        error = np.max(np.abs(rebuilt - coordinates[:, 3]))
        values = ", ".join(f"{n:.3f}" for n in w)
        verified.object = f'<div class="status-line">✓ Python 核对 ({values})<br>位置重建误差 {error:.1e}</div>'
    except ValueError:
        verified.object = '<div class="status-line">Python：面积为零或接近零，权重未定义。拖开顶点即可恢复。</div>'


def edit_coordinate(event):
    if updating or x_input.value is None or y_input.value is None:
        return
    x, y = list(points.data["x"]), list(points.data["y"])
    index = LABELS.index(selected.value)
    x[index], y[index] = x_input.value, y_input.value
    points.data = point_data(x, y)


points.on_change("data", lambda attr, old, new: refresh_python())
snap.on_change("active", lambda attr, old, new: refresh_python())


def select_point(event):
    points.selected.indices = [LABELS.index(selected.value)]
    refresh_python()


points.selected.on_change("indices", lambda attr, old, new: setattr(selected, "value", LABELS[new[-1]]) if new else None)
selected.param.watch(select_point, "value")
x_input.param.watch(edit_coordinate, "value")
y_input.param.watch(edit_coordinate, "value")


def set_preset(name):
    snap.active = False
    selected.value = "P"
    points.data = point_data(*PRESETS[name])


buttons = []
for name in PRESETS:
    button = pn.widgets.Button(name=name, width=90, height=40, margin=(3, 4), stylesheets=[CSS])
    button.on_click(lambda event, name=name: set_preset(name))
    buttons.append(button)
reset = pn.widgets.Button(name="恢复默认", width=90, height=40, margin=(3, 4), stylesheets=[CSS])
reset.on_click(lambda event: (set_preset("内部点"), setattr(areas, "active", True)))


def save_state():
    state = dict(lesson="barycentric", version=1, x=points.data["x"], y=points.data["y"],
                 snap=snap.active, areas=areas.active)
    return BytesIO(json.dumps(state, ensure_ascii=False, indent=2).encode())


download = pn.widgets.FileDownload(callback=save_state, filename="barycentric.json", label="保存参数", width=120)
upload = pn.widgets.FileInput(accept=".json", width=210, name="载入参数")
file_note = html('<div class="muted">保存这次实验，稍后从 JSON 恢复。</div>')


def load_state(event):
    try:
        if not event.new or len(event.new) > 16000:
            raise ValueError
        state = json.loads(event.new)
        xy = np.array([state["x"], state["y"]], dtype=float)
        if state.get("lesson") != "barycentric" or state.get("version") != 1:
            raise ValueError
        if xy.shape != (2, 4) or not np.isfinite(xy).all() or (np.abs(xy) > 1e6).any():
            raise ValueError
        if type(state.get("snap")) is not bool or type(state.get("areas")) is not bool:
            raise ValueError
        snap.active = False
        points.data = point_data(*xy)
        snap.active, areas.active = bool(state.get("snap")), bool(state.get("areas", True))
        file_note.object = '<div class="muted">已恢复这次实验。</div>'
    except (ValueError, KeyError, TypeError, OverflowError):
        file_note.object = '<div class="muted">文件不符合本节参数格式，请选择通过「保存参数」导出的 JSON。</div>'


upload.param.watch(load_state, "value")
refresh_python()
canvas = pn.Column(html('<div class="canvas-label"><strong>拖动 A / B / C / P</strong><span>点击空白处移动 P · 坐标 y 向上</span></div>'),
                   pn.pane.Bokeh(plot, sizing_mode="stretch_width"),
                   pn.FlexBox(snap, areas, flex_wrap="wrap"), sizing_mode="stretch_width",
                   styles={"flex": "2 1 580px", "min-width": "280px", "background": "#fbfcf8", "padding": "15px"})
inspector = pn.Column(pn.pane.Bokeh(readout, sizing_mode="stretch_width"),
                      pn.Row(selected, x_input, y_input), verified,
                      sizing_mode="stretch_width", styles={"flex": "1 1 300px", "max-width": "370px", "padding": "15px"})
workspace = pn.FlexBox(canvas, inspector, flex_wrap="wrap", align_items="flex-start", sizing_mode="stretch_width")
hint = html('<div class="hint"><strong>先猜一猜：把 P 移到 BC 边上，哪个权重会变成零？</strong>选「边上点」检查。再选「外部点」：三个权重仍相加为 1，为什么这个点却不被覆盖？</div>')
files = pn.Accordion(("保存 / 恢复实验参数", pn.Column(pn.FlexBox(download, upload, flex_wrap="wrap"), file_note)), active=[], sizing_mode="stretch_width")


def build():
    """只返回本章实验；全书导航、正文与代码由 app.py 装配。"""
    single = pn.Column(pn.FlexBox(*buttons, reset, flex_wrap="wrap"), workspace, hint, files,
                       sizing_mode="stretch_width")
    return pn.Tabs(("实验 A · 一个点的权重", single), ("实验 B · 填满像素网格", build_raster()),
                   sizing_mode="stretch_width", stylesheets=[CSS])
