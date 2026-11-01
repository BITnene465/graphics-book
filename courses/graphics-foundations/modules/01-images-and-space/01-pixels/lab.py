"""本章实验。build() 每次创建独立状态；所有图像与颜色由 Python 计算。"""
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, CustomJS, FixedTicker, Range1d
from bokeh.plotting import figure

from .core import (render_image, rgba_for_bokeh, probe_pixel, linear_to_srgb,
                   srgb_to_linear, mix_colors, sample_offsets)


def build():
    resolution = pn.widgets.Select(name="图像分辨率", options=[8, 16, 32, 64], value=16, width=140)
    samples = pn.widgets.Select(name="每像素采样", options={"1×1 · 1 次": 1, "2×2 · 4 次": 2, "4×4 · 16 次": 4}, value=1, width=155)
    pattern = pn.widgets.Select(name="连续场景", options={"圆盘边缘": "disk", "线性灰度渐变": "gradient", "方向检查 · 四角": "corners"}, width=180)
    zoom = pn.widgets.Select(name="只放大查看", options={"1× · 全图": 1, "2×": 2, "4×": 4}, value=1, width=135)
    grid = pn.widgets.Checkbox(name="像素网格", value=True, width=120)
    row_input = pn.widgets.IntInput(name="数组行 row ↓", value=7, start=0, end=15, width=125)
    col_input = pn.widgets.IntInput(name="数组列 col →", value=7, start=0, end=15, width=125)
    image_data = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name="pixels_image")
    marker = ColumnDataSource(dict(x=[7.5], y=[8.5]), name="pixels_probe")
    sample_points = ColumnDataSource(dict(x=[], y=[]), name="pixels_samples")
    lines = ColumnDataSource(dict(xs=[], ys=[]))
    view = ColumnDataSource(dict(cx=[8.], cy=[8.], span=[17.]), name="pixels_view")
    plot = figure(height=450, sizing_mode="stretch_width", x_range=Range1d(-.5, 16.5),
                  y_range=Range1d(-.5, 16.5), tools="", toolbar_location=None,
                  background_fill_color="#f1f3ed", border_fill_color="#fbfcf8",
                  outline_line_color=None, min_border=38, name="pixels_canvas")
    plot.xaxis.axis_label, plot.yaxis.axis_label = "x →（像素单位）", "y ↑（像素单位）"
    plot.axis.axis_label_text_font_style = "normal"
    plot.axis.axis_label_text_font_size = "14px"
    plot.axis.major_label_text_font_size = "14px"
    plot.axis.major_label_text_color = "#52604f"
    plot.grid.visible = False
    plot.image_rgba(source=image_data, image="image", x="x", y="y", dw="dw", dh="dh", origin="bottom_left")
    grid_glyph = plot.multi_line("xs", "ys", source=lines, line_color="#ffffff", line_alpha=.22)
    plot.rect("x", "y", source=marker, width=1, height=1, fill_alpha=0, line_color="#16372a", line_width=4)
    plot.rect("x", "y", source=marker, width=1, height=1, fill_alpha=0, line_color="#ffffff", line_width=2)
    plot.scatter("x", "y", source=marker, marker="cross", size=12, line_color="white", line_width=2)
    plot.scatter("x", "y", source=sample_points, size=6, color="#ffcf63", line_color="#16372a", line_width=1)
    equal_units = CustomJS(args=dict(plot=plot, view=view), code="""
const w = plot.inner_width, h = plot.inner_height, d = view.data;
if (w > 0 && h > 0) {
  const sx = d.span[0] * Math.max(1, w/h), sy = d.span[0] * Math.max(1, h/w);
  plot.x_range.setv({start:d.cx[0]-sx/2, end:d.cx[0]+sx/2});
  plot.y_range.setv({start:d.cy[0]-sy/2, end:d.cy[0]+sy/2});
}
""")
    plot.js_on_change("inner_width", equal_units)
    plot.js_on_change("inner_height", equal_units)
    view.js_on_change("data", equal_units)
    probe = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "16px", "line-height": "1.7"})
    caption = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "14px"})
    state = dict(image=None, updating=False, size=16)

    def update_probe(event=None):
        if state["updating"] or state["image"] is None:
            return
        n = resolution.value
        row, col = int(row_input.value or 0), int(col_input.value or 0)
        # 键盘输入也走相同边界约定；图像外的点击由 pick() 忽略。
        row, col = np.clip([row, col], 0, n - 1).astype(int)
        state["updating"] = True
        row_input.value, col_input.value = int(row), int(col)
        state["updating"] = False
        x, y = col + .5, n - row - .5
        marker.data = dict(x=[x], y=[y])
        offsets = sample_offsets(samples.value)
        sample_points.data = dict(x=col+offsets[:, 0], y=n-row-1+offsets[:, 1])
        color = state["image"][row, col]
        encoded = linear_to_srgb(color)
        byte = np.rint(encoded * 255).astype(int)
        fmt = lambda a: ", ".join(f"{v:.4f}" for v in a)
        probe.object = f"""**当前像素 · `image[{row}, {col}]`**

数组形状：`({n}, {n}, 3)` · 共 **{n*n:,}** 个像素

几何中心：**({x:.1f}, {y:.1f})**  
归一化中心：({x/n:.4f}, {y/n:.4f})

**线性 RGB**  
`({fmt(color)})`

**显示用 sRGB**  
`({fmt(encoded)})`

**8 位 RGB**  
`({byte[0]}, {byte[1]}, {byte[2]})`

行号从上向下；几何 y 从下向上。白色十字标记像素中心，金色圆点是本次 **{samples.value**2} 个实际求值位置**。只有 1×1 采样时两者重合。方框表示这个像素的显示范围；放大到 4× 可分辨圆点。"""
        if zoom.value != 1:
            update_view()

    def update_view(event=None):
        n, factor = resolution.value, zoom.value
        cx, cy = (n / 2, n / 2) if factor == 1 else (marker.data["x"][0], marker.data["y"][0])
        view.data = dict(cx=[cx], cy=[cy], span=[n * 1.06 / factor])

    def render(event=None):
        old, n = state["size"], resolution.value
        state["updating"] = True
        row_input.end = col_input.end = n - 1
        row_input.value = min(n - 1, int((row_input.value + .5) / old * n))
        col_input.value = min(n - 1, int((col_input.value + .5) / old * n))
        state["updating"] = False
        state["size"] = n
        state["image"] = render_image(n, n, samples.value, pattern.value)
        image_data.data = dict(image=[rgba_for_bokeh(state["image"])], x=[0], y=[0], dw=[n], dh=[n])
        edges = list(range(n + 1))
        lines.data = dict(xs=[[i, i] for i in edges] + [[0, n] for _ in edges],
                          ys=[[0, n] for _ in edges] + [[i, i] for i in edges])
        plot.xaxis.ticker = plot.yaxis.ticker = FixedTicker(ticks=list(range(0, n + 1, max(1, n // 4))))
        caption.object = f"**Python 渲染** · {n} × {n} 像素 · 每像素 {samples.value**2} 次采样 · 共 {n*n*samples.value**2:,} 次场景求值。放大查看不会改变这些数字。"
        update_probe()
        update_view()

    def pick(event):
        n = resolution.value
        try:
            row, col = probe_pixel(event.x, event.y, n, n)
        except ValueError:
            return
        state["updating"] = True
        row_input.value, col_input.value = row, col
        state["updating"] = False
        update_probe()

    plot.on_event(Tap, pick)
    for control in (resolution, samples, pattern):
        control.param.watch(render, "value")
    for control in (row_input, col_input):
        control.param.watch(update_probe, "value")
    zoom.param.watch(update_view, "value")
    grid.param.watch(lambda event: setattr(grid_glyph, "visible", event.new), "value")
    render()

    a = pn.widgets.ColorPicker(name="颜色 A · sRGB", value="#000000", width=145)
    b = pn.widgets.ColorPicker(name="颜色 B · sRGB", value="#ffffff", width=145)
    amount = pn.widgets.FloatSlider(name="颜色 B 的权重 t", start=0, end=1, step=.01, value=.5, sizing_mode="stretch_width")
    colors = pn.pane.HTML(sizing_mode="stretch_width")
    mix_math = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px"})
    presets = pn.widgets.RadioButtonGroup(name="混合示例", options=["黑与白", "红与蓝"], value="黑与白")

    def update_mix(event=None):
        decode_hex = lambda s: np.array([int(s[i:i+2], 16) / 255 for i in (1, 3, 5)])
        ca, cb, t = decode_hex(a.value), decode_hex(b.value), amount.value
        right, wrong = mix_colors(ca, cb, t), mix_colors(ca, cb, t, linear=False)
        hex_color = lambda v: "#" + "".join(f"{c:02x}" for c in np.rint(v * 255).astype(int))
        triplet = lambda v: "(" + ", ".join(f"{x:.3f}" for x in v) + ")"
        colors.object = f"""<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:15px;line-height:1.65">
<div style="flex:1;min-width:160px"><b>先解码，再混合</b><div style="height:76px;background:{hex_color(right)};border:1px solid #cad1c5;margin:8px 0"></div>sRGB {triplet(right)}<br>线性 {triplet(srgb_to_linear(right))}</div>
<div style="flex:1;min-width:160px"><b>直接平均编码值</b><div style="height:76px;background:{hex_color(wrong)};border:1px solid #cad1c5;margin:8px 0"></div>sRGB {triplet(wrong)}<br>线性 {triplet(srgb_to_linear(wrong))}</div></div>"""
        mix_math.object = rf"""$$C_{{\rm linear}}=(1-{t:.2f})D(A)+{t:.2f}D(B),\qquad C_{{\rm display}}=E(C_{{\rm linear}}).$$

E 是编码，D 是解码。这里比较的是**线性光强的混合**；颜料混合和感知均匀渐变是另外的问题。"""

    def preset_mix(event):
        a.value, b.value = ("#000000", "#ffffff") if event.new == "黑与白" else ("#ff0000", "#0000ff")
        amount.value = .5
        update_mix()

    presets.param.watch(preset_mix, "value")
    for control in (a, b, amount):
        control.param.watch(update_mix, "value")
    update_mix()
    canvas = pn.Column(pn.pane.Markdown("**点击图像里的任一像素** · 白框与右侧数组索引同步"),
                       pn.pane.Bokeh(plot, sizing_mode="stretch_width"), caption,
                       sizing_mode="stretch_width", styles={"flex": "2 1 520px", "min-width": "280px"})
    inspector = pn.Column(pn.FlexBox(row_input, col_input, flex_wrap="wrap"), probe,
                          sizing_mode="stretch_width", styles={"flex": "1 1 290px", "min-width": "260px"})
    return pn.Column(
        pn.FlexBox(resolution, samples, pattern, zoom, grid, align_items="center", flex_wrap="wrap"),
        pn.FlexBox(canvas, inspector, flex_wrap="wrap", align_items="flex-start", sizing_mode="stretch_width"),
        pn.pane.Markdown("**做一次受控比较**：先固定 16×16，把查看放大到 4×；再回到全图，把分辨率改为 64。前者只看得更大，后者重新询问了更多场景位置。最后固定 16×16，把采样改为 4×4，观察圆边缘出现的中间色。"),
        pn.layout.Divider(), pn.pane.Markdown("### 黑与白的中点，为什么不是 128？\n先猜，再拖动权重。两个色块使用同样的输入颜色与权重。"),
        pn.FlexBox(presets, a, b, flex_wrap="wrap"), amount, colors, mix_math,
        sizing_mode="stretch_width")
