"""第 02 章实验界面。矩阵与几何由 core.py 计算；build() 可独立装配。"""
import numpy as np
import panel as pn
from bokeh.events import DocumentReady
from bokeh.models import Arrow, ColumnDataSource, CustomJS, Div, LabelSet, PointDrawTool, VeeHead
from bokeh.plotting import figure
from .core import apply, compose, inverse, rotation, scaling, translation


GREEN, RED, BLUE, ORANGE = "#27664e", "#bd594d", "#4679a7", "#b57831"
HOUSE = np.array([[-.8, -.8], [.8, -.8], [.8, .4], [0, 1.2], [-.8, .4], [-.8, -.8]])


def build():
    """控件、画布和数值读数共用一份 Python 状态，无额外课程框架。"""
    angle = pn.widgets.FloatSlider(name="旋转 θ（度）", start=-180, end=180, step=1, value=30)
    sx = pn.widgets.FloatSlider(name="缩放 sx", start=-2, end=2, step=.05, value=1)
    sy = pn.widgets.FloatSlider(name="缩放 sy", start=-2, end=2, step=.05, value=1)
    tx = pn.widgets.FloatSlider(name="平移 tx", start=-2, end=2, step=.05, value=1)
    ty = pn.widgets.FloatSlider(name="平移 ty", start=-2, end=2, step=.05, value=0)
    for slider in [angle, sx, sy, tx, ty]:
        slider.sizing_mode = "stretch_width"
    order = pn.widgets.Select(name="矩阵乘积（从右向左执行）", options=["TRS", "RTS", "TSR", "RST", "STR", "SRT"], value="TRS")
    kind = pn.widgets.RadioButtonGroup(name="探针语义", options=["点 · w = 1", "向量 · w = 0"], value="点 · w = 1", sizing_mode="stretch_width")
    compare = pn.widgets.Checkbox(name="橙色虚线：交换 T 和 R 的位置", value=True)
    px = pn.widgets.FloatInput(name="输入 x", value=1., step=.1, width=125)
    py = pn.widgets.FloatInput(name="输入 y", value=.5, step=.1, width=125)
    point = ColumnDataSource(dict(x=[1.], y=[.5]), name="transforms_point")
    mapped = ColumnDataSource(dict(x=[0.], y=[0.], label=["Mp"]))
    other_point = ColumnDataSource(dict(x=[0.], y=[0.]))
    polygon = ColumnDataSource(dict(x=[], y=[]))
    other_polygon = ColumnDataSource(dict(x=[], y=[]))
    grid = ColumnDataSource(dict(xs=[], ys=[]))
    connection = ColumnDataSource(dict(x=[], y=[]))
    state = ColumnDataSource(dict(m=[np.eye(3).tolist()], other=[np.eye(3).tolist()], w=[1], order=["TRS"], other_order=["RTS"]))
    readout = Div(text="", sizing_mode="stretch_width", name="transforms_readout")
    matrix_view = pn.pane.HTML(sizing_mode="stretch_width")
    checked = pn.pane.HTML(sizing_mode="stretch_width", name="transforms_verified")
    plot = figure(height=500, sizing_mode="stretch_width", tools="", toolbar_location=None,
                  x_range=(-5.5, 5.5), y_range=(-5.5, 5.5), min_border=28,
                  background_fill_color="#fbfcf8", border_fill_color="#fbfcf8",
                  outline_line_color=None, name="transforms_canvas")
    plot.axis.axis_line_color = "#bac8ba"
    plot.axis.major_label_text_color = "#748573"
    plot.axis.major_tick_line_color = None
    plot.axis.minor_tick_line_color = None
    plot.grid.grid_line_color = "#e9eee5"
    plot.xaxis.axis_label, plot.yaxis.axis_label = "x", "y"
    plot.multi_line("xs", "ys", source=grid, line_color=GREEN, line_alpha=.23, line_width=1)
    plot.patch(HOUSE[:, 0], HOUSE[:, 1], fill_color="#93a49a", fill_alpha=.08, line_color="#8b998e", line_dash="dotted", line_width=2)
    plot.patch("x", "y", source=polygon, fill_color=GREEN, fill_alpha=.13, line_color=GREEN, line_width=2.5)
    alternate = plot.line("x", "y", source=other_polygon, line_color=ORANGE, line_width=2, line_dash="dashed")
    plot.line("x", "y", source=connection, line_color="#7a8d7c", line_dash="dotted", line_width=1.5)
    basis_arrows = []
    for color in [RED, BLUE]:
        arrow = Arrow(end=VeeHead(size=12, fill_color=color, line_color=color),
                      x_start=0, y_start=0, x_end=1, y_end=0, line_color=color, line_width=3)
        plot.add_layout(arrow)
        basis_arrows.append(arrow)
    plot.scatter("x", "y", source=mapped, size=14, fill_color=GREEN, line_color="white", line_width=2)
    alternate_point = plot.scatter("x", "y", source=other_point, size=12, marker="diamond", fill_color=ORANGE, line_color="white")
    handles = plot.scatter("x", "y", source=point, size=19, fill_color="#223b30", line_color="white", line_width=3,
                           selection_fill_color="#223b30", nonselection_alpha=1)
    plot.add_layout(LabelSet(x="x", y="y", source=mapped, text="label", x_offset=10, y_offset=10, text_color=GREEN, text_font_size="12px"))
    draw = PointDrawTool(renderers=[handles], add=False, drag=True)
    plot.add_tools(draw)
    plot.toolbar.active_drag = draw
    # Python 提供矩阵，JS 只在拖动的一帧内做矩阵乘点；松手后 Python 独立复核。
    preview = CustomJS(args=dict(point=point, state=state, mapped=mapped, other_point=other_point,
                                 connection=connection, readout=readout), code="""
const x=point.data.x[0], y=point.data.y[0], d=state.data, w=d.w[0];
if (point.data.x.length!==1 || !Number.isFinite(x+y)) return;
const multiply=m=>[m[0][0]*x+m[0][1]*y+m[0][2]*w,m[1][0]*x+m[1][1]*y+m[1][2]*w];
const q=multiply(d.m[0]), r=multiply(d.other[0]), m=d.m[0], f=v=>(Math.abs(v)<.0005?0:v).toFixed(3);
mapped.data={x:[q[0]],y:[q[1]],label:[w?'Mp':'Mv']};
other_point.data={x:[r[0]],y:[r[1]]};
connection.data={x:[x,q[0]],y:[y,q[1]]};
readout.text=`<div style="font:14px/1.85 system-ui;color:#314637;overflow-wrap:anywhere">
<strong>${w?'点 p':'向量 v'} = (${f(x)}, ${f(y)}), w = ${w}</strong><br>
x′ = ${f(m[0][0])} × ${f(x)} + ${f(m[0][1])} × ${f(y)} + ${f(m[0][2])} × ${w}<br>
y′ = ${f(m[1][0])} × ${f(x)} + ${f(m[1][1])} × ${f(y)} + ${f(m[1][2])} × ${w}<br>
<b style="color:#27664e">${d.order[0]} → (${f(q[0])}, ${f(q[1])})</b><br>
<span style="color:#a26727">${d.other_order[0]} → (${f(r[0])}, ${f(r[1])})</span></div>`;
""")
    point.js_on_change("change", preview)
    state.js_on_change("data", preview)
    # 范围由屏幕纵横比校正；一个 x 单位始终与一个 y 单位等长。
    equal_units = CustomJS(args=dict(plot=plot), code="""
const w=plot.inner_width,h=plot.inner_height;
if(w>0 && h>0){
  const xs=11*Math.max(1,w/h),ys=11*Math.max(1,h/w);
  plot.x_range.setv({start:-xs/2,end:xs/2});
  plot.y_range.setv({start:-ys/2,end:ys/2});
}
""")
    plot.js_on_change("inner_width", equal_units)
    plot.js_on_change("inner_height", equal_units)
    plot.js_on_event(DocumentReady, equal_units)
    plot.js_on_event(DocumentReady, preview)
    if pn.state.curdoc is not None:
        pn.state.curdoc.js_on_event(DocumentReady, equal_units)
        pn.state.curdoc.js_on_event(DocumentReady, preview)
    updating = False
    last_point = [1., .5]
    matrix = np.eye(3)

    def check_point(event=None):
        nonlocal updating, last_point
        if updating:
            return
        xy = np.array([point.data["x"], point.data["y"]], float)
        if xy.shape != (2, 1) or not np.isfinite(xy).all() or np.max(np.abs(xy)) > 1e4:
            point.data = dict(x=[last_point[0]], y=[last_point[1]])
            return
        last_point = xy[:, 0].tolist()
        updating = True
        px.value, py.value = last_point
        updating = False
        vector = kind.value.startswith("向量")
        q = apply(matrix, last_point, vector=vector)
        r = apply(np.asarray(state.data["other"][0]), last_point, vector=vector)
        mapped.data = dict(x=[q[0]], y=[q[1]], label=["Mv" if vector else "Mp"])
        other_point.data = dict(x=[r[0]], y=[r[1]])
        connection.data = dict(x=[last_point[0], q[0]], y=[last_point[1], q[1]])
        try:
            restored = apply(inverse(matrix), q, vector=vector)
            error = np.max(np.abs(restored-last_point))
            message = f"逆变换恢复 ({restored[0]:.3f}, {restored[1]:.3f})；误差 {error:.1e}"
        except ValueError:
            message = "不可逆：一整条线上的点被映到同一点，原位置无法唯一恢复。"
        checked.object = f'<p style="font-size:13px;color:#627361;line-height:1.7">Python 核对 → ({q[0]:.3f}, {q[1]:.3f})<br>{message}</p>'

    def edit_point(event):
        if not updating and px.value is not None and py.value is not None:
            point.data = dict(x=[px.value], y=[py.value])

    def refresh(event=None):
        nonlocal matrix
        operations = dict(T=translation(tx.value, ty.value), R=rotation(np.deg2rad(angle.value)), S=scaling(sx.value, sy.value))
        matrix = compose(*(operations[letter] for letter in order.value))
        other_order = order.value.translate(str.maketrans("TR", "RT"))
        other = compose(*(operations[letter] for letter in other_order))
        state.data = dict(m=[matrix.tolist()], other=[other.tolist()], w=[int(kind.value.startswith("点"))], order=[order.value], other_order=[other_order])
        transformed = apply(matrix, HOUSE)
        alt = apply(other, HOUSE)
        polygon.data = dict(x=transformed[:, 0], y=transformed[:, 1])
        other_polygon.data = dict(x=alt[:, 0], y=alt[:, 1])
        # 有限的小网格使矩阵对整个坐标空间的作用可见。
        lines = [np.array([[v, -1.5], [v, 1.5]]) for v in np.arange(-1.5, 1.51, .5)]
        lines += [np.array([[-1.5, v], [1.5, v]]) for v in np.arange(-1.5, 1.51, .5)]
        transformed_lines = [apply(matrix, line) for line in lines]
        grid.data = dict(xs=[line[:, 0] for line in transformed_lines], ys=[line[:, 1] for line in transformed_lines])
        origin = apply(matrix, [0, 0])
        columns = apply(matrix, np.eye(2), vector=True)
        for arrow, column in zip(basis_arrows, columns):
            arrow.x_start, arrow.y_start = origin
            arrow.x_end, arrow.y_end = origin+column
        rows = "".join("<tr>"+"".join(f'<td style="padding:3px 9px;text-align:right">{0 if abs(v)<.0005 else v:.3f}</td>' for v in row)+"</tr>" for row in matrix)
        det = np.linalg.det(matrix[:2, :2])
        gram = matrix[:2, :2].T @ matrix[:2, :2]
        preserves = np.allclose(gram, np.eye(2), atol=1e-10)
        angle_preserves = abs(det) > 1e-12 and np.allclose(gram, np.eye(2) * np.trace(gram) / 2, atol=1e-10)
        signed = "方向翻转" if det < 0 else "压成线或点" if abs(det) < 1e-12 else "方向保持"
        names = dict(T="平移", R="旋转", S="缩放")
        sequence = " → ".join(names[c] for c in reversed(order.value))
        matrix_view.object = f'''<div style="font:14px/1.7 system-ui;color:#314637">
<p style="margin:0"><b>M = {' · '.join(order.value)}</b> · {sequence}</p>
<table style="font:15px/1.6 ui-monospace,monospace;border-left:2px solid #a4b59d;border-right:2px solid #a4b59d;margin:13px 0">{rows}</table>
<p style="font-size:12px;color:#687b67"><span style="color:{RED}">第 1 列 = 新 x 基</span> · <span style="color:{BLUE}">第 2 列 = 新 y 基</span><br>第 3 列 = 新原点；前两列的最后一项为 0。</p>
<p>det(A) = <b>{det:.3f}</b> · {signed}<br>面积倍率 |det(A)| = {abs(det):.3f}<br>长度：{'保持' if preserves else '不保证保持'}<br>角度：{'保持（AᵀA = cI，c > 0）' if angle_preserves else '退化后可能无定义' if abs(det) < 1e-12 else '一般不保持'}</p></div>'''
        alternate.visible = alternate_point.visible = compare.value
        check_point()

    point.on_change("data", lambda attr, old, new: check_point())
    for widget in [angle, sx, sy, tx, ty, order, kind, compare]:
        widget.param.watch(refresh, "value")
    px.param.watch(edit_point, "value")
    py.param.watch(edit_point, "value")
    presets = {
        "恢复默认": (30, 1, 1, 1, 0, "TRS"),
        "手算 90°": (90, 1, 1, 2, 0, "TRS"),
        "镜像": (0, -1, 1, 0, 0, "TRS"),
        "压成一条线": (0, 0, 1, 0, 0, "TRS"),
    }

    def preset(values):
        for widget, value in zip([angle, sx, sy, tx, ty, order], values):
            widget.value = value
        kind.value = "点 · w = 1"
        point.data = dict(x=[1.], y=[.5 if values == presets["恢复默认"] else 0.])
        refresh()

    buttons = []
    for label, values in presets.items():
        button = pn.widgets.Button(name=label, width=112, height=36)
        button.on_click(lambda event, values=values: preset(values))
        buttons.append(button)
    refresh()
    controls = pn.Column(order, angle, pn.Row(sx, sy, sizing_mode="stretch_width"), pn.Row(tx, ty, sizing_mode="stretch_width"),
                         kind, compare, sizing_mode="stretch_width", styles={"max-width": "680px"})
    canvas = pn.Column(pn.pane.Markdown("**拖动深色探针** · 灰色：原图形　绿色：当前变换　橙色：交换顺序"),
                       pn.pane.Bokeh(plot, sizing_mode="stretch_width"), sizing_mode="stretch_width",
                       styles={"flex": "2 1 560px", "min-width": "280px"})
    inspector = pn.Column(matrix_view, pn.pane.Bokeh(readout, sizing_mode="stretch_width"), pn.Row(px, py), checked,
                          sizing_mode="stretch_width", styles={"flex": "1 1 300px", "max-width": "390px", "padding": "12px"})
    return pn.Column(pn.FlexBox(*buttons, flex_wrap="wrap"), controls,
                     pn.FlexBox(canvas, inspector, flex_wrap="wrap", align_items="flex-start", sizing_mode="stretch_width"),
                     pn.pane.Markdown("**先猜再试**：选「手算 90°」。为什么绿色点是 (2, 1)，橙色点却是 (0, 3)？切到向量后，两点为什么重合？图中的房子始终按点变换；切换只改变探针的齐次权重。"),
                     sizing_mode="stretch_width")
