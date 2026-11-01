"""光照实验：Python 生成两幅 160×160 图，Bokeh 只显示像素与数学曲线。"""
from time import perf_counter
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import Arrow, ColumnDataSource, VeeHead
from bokeh.plotting import figure
from .core import display_rgba, ellipsoid_surface, light_at, normalize, shade, transform_normals


EXTENT, SIZE = 1.9, 160
GREEN, ORANGE, BLUE = "#27664e", "#b57532", "#527eac"
BASE_COLOR = np.array([.18, .50, .31])


def build():
    def slider(name, start, end, value, step=.05):
        return pn.widgets.FloatSlider(name=name, start=start, end=end, value=value, step=step, sizing_mode="stretch_width", styles={"flex": "1 1 180px", "min-width": "150px"})

    component = pn.widgets.Select(name="观察的分量", options={"合成光照": "total", "仅漫反射": "diffuse", "仅高光": "specular", "仅环境常量": "ambient"}, value="total", width=170)
    light_type = pn.widgets.RadioButtonGroup(name="光源类型", options=["方向光", "点光源"], value="方向光", width=220)
    exponent = pn.widgets.IntSlider(name="高光指数 s", start=1, end=128, value=32, sizing_mode="stretch_width", styles={"flex": "1 1 180px", "min-width": "150px"})
    azimuth = slider("指向光源：方位角 φ（°）", -180, 180, 135, 1)
    elevation = slider("指向光源：仰角 ε（°）", -80, 90, 45, 1)
    lx, ly, lz = slider("点光源 x", -3, 3, -2), slider("点光源 y", -3, 3, 2), slider("点光源 z", 1.8, 5, 3)
    power = slider("光强 I（点光按 I / r² 衰减）", .1, 12, 1, .1)
    sx, sy, sz = slider("椭球半轴 ax", .4, 1.7, 1.5), slider("椭球半轴 ay", .4, 1.7, .8), slider("椭球半轴 az", .3, 1.7, .55)
    diffuse = slider("漫反射系数 kd", 0, 1, .8)
    specular = slider("高光系数 ks", 0, 1, .3)
    ambient = slider("环境常量 ka", 0, .2, .025, .005)
    probe_theta = slider("探针离正面中心的角度（°）", 0, 89, 45, 1)
    probe_phi = slider("探针在表面的方位角（°）", -180, 180, 35, 1)
    direction_controls = pn.FlexBox(azimuth, elevation, flex_wrap="wrap", sizing_mode="stretch_width")
    point_controls = pn.FlexBox(lx, ly, lz, flex_wrap="wrap", sizing_mode="stretch_width", visible=False)
    readout = pn.pane.HTML(sizing_mode="stretch_width", name="lighting_readout")
    note = pn.pane.HTML(sizing_mode="stretch_width")
    images, probes, arrows, scene_columns = [], [], [], []
    for title, color in [("正确法线 · A⁻ᵀn", GREEN), ("错误对照 · An", ORANGE)]:
        plot = figure(width=420, height=420, sizing_mode="scale_width", x_range=(-EXTENT, EXTENT), y_range=(-EXTENT, EXTENT),
                      tools="", toolbar_location=None, min_border=0, outline_line_color=None,
                      background_fill_color="#f7f9f3", name="lighting_correct" if not images else "lighting_wrong")
        plot.axis.visible = False
        plot.grid.visible = False
        image_source = ColumnDataSource(dict(image=[np.zeros((SIZE, SIZE), dtype=np.uint32)]))
        # 核心数组首行在顶部；display_rgba 已完成 Bokeh 底行在前的唯一翻转。
        plot.image_rgba(image="image", x=-EXTENT, y=-EXTENT, dw=2*EXTENT, dh=2*EXTENT, source=image_source)
        probe = ColumnDataSource(dict(x=[0.], y=[0.]))
        plot.scatter("x", "y", source=probe, size=12, line_color="#ffffff", line_width=3, fill_color=color)
        normal_arrow = Arrow(end=VeeHead(size=11, fill_color=color, line_color="#ffffff"), line_color=color, line_width=3)
        plot.add_layout(normal_arrow)
        images.append(image_source)
        probes.append(probe)
        arrows.append(normal_arrow)
        scene_columns.append(pn.Column(pn.pane.Markdown(f"**{title}** · 点击表面选择同一个探针"), pn.pane.Bokeh(plot, sizing_mode="stretch_width"),
                                       sizing_mode="stretch_width", styles={"flex": "1 1 350px", "min-width": "260px"}))
    angles = np.linspace(0, 180, 361)
    curve_data = ColumnDataSource(dict(angle=angles, diffuse=np.maximum(np.cos(np.deg2rad(angles)), 0), specular=np.zeros_like(angles)))
    marks = ColumnDataSource(dict(angle=[0., 0.], response=[0., 0.], color=[GREEN, ORANGE]))
    curve = figure(height=275, sizing_mode="stretch_width", x_range=(0, 180), y_range=(-.03, 1.05),
                   tools="", toolbar_location=None, background_fill_color="#fbfcf8", border_fill_color="#fbfcf8",
                   outline_line_color=None, name="lighting_response")
    curve.line("angle", "diffuse", source=curve_data, color=GREEN, line_width=2.5, legend_label="漫反射：max(0, cos θ)")
    curve.line("angle", "specular", source=curve_data, color=ORANGE, line_width=2.5, legend_label="高光：max(0, cos α)ˢ")
    curve.scatter("angle", "response", source=marks, size=11, fill_color="color", line_color="white", line_width=2)
    curve.xaxis.axis_label = "θ = ∠(n, ℓ)；α = ∠(n, h)（°）"
    curve.yaxis.axis_label = "角度响应"
    curve.axis.major_label_text_font_size = "14px"
    curve.axis.axis_label_text_font_size = "14px"
    curve.legend.label_text_font_size = "14px"
    curve.legend.location = "top_right"
    curve.legend.background_fill_alpha = .7
    curve.legend.border_line_color = None
    curve.grid.grid_line_color = "#e2e8dc"
    updating = False

    def refresh(event=None):
        if updating:
            return
        start = perf_counter()
        scale = np.array([sx.value, sy.value, sz.value])
        linear = np.diag(scale)
        is_point = light_type.value == "点光源"
        direction_controls.visible, point_controls.visible = not is_point, is_point
        phi, elevation_r = np.deg2rad([azimuth.value, elevation.value])
        source = np.array([lx.value, ly.value, lz.value]) if is_point else np.array([np.cos(elevation_r)*np.cos(phi), np.cos(elevation_r)*np.sin(phi), np.sin(elevation_r)])
        points, local_normals, mask = ellipsoid_surface(SIZE, scale, EXTENT)
        light, intensity = light_at(points, source, point_light=is_point, power=power.value)
        params = dict(kd=BASE_COLOR*diffuse.value, ks=specular.value, exponent=exponent.value, ambient=ambient.value)
        theta, phi = np.deg2rad([probe_theta.value, probe_phi.value])
        probe_local = np.array([np.sin(theta)*np.cos(phi), np.sin(theta)*np.sin(phi), np.cos(theta)])
        probe_world = probe_local*scale
        probe_light, probe_intensity = light_at(probe_world, source, point_light=is_point, power=power.value)
        probe_view = np.array([0., 0., 1.])  # 正交相机，所有可见点的视线方向相同。
        probe_normals, probe_values, scene_values = [], [], []
        for index, correct in enumerate([True, False]):
            normals = transform_normals(local_normals, linear, correct=correct)
            values = shade(normals, light, probe_view, irradiance=intensity, **params)
            images[index].data = dict(image=[display_rgba(values[component.value], mask)])
            normal = transform_normals(probe_local, linear, correct=correct)
            probe_normals.append(normal)
            probe_values.append(shade(normal, probe_light, probe_view, irradiance=probe_intensity, **params))
            scene_values.append(values[component.value])
            probes[index].data = dict(x=[probe_world[0]], y=[probe_world[1]])
            arrows[index].x_start, arrows[index].y_start = probe_world[:2]
            arrows[index].x_end, arrows[index].y_end = probe_world[:2]+.55*normal[:2]
        n, wrong = probe_normals
        h = normalize(probe_light+probe_view)
        ndotl, ndoth = float(n@probe_light), float(n@h)
        theta_light = np.degrees(np.arccos(np.clip(ndotl, -1, 1)))
        theta_half = np.degrees(np.arccos(np.clip(ndoth, -1, 1)))
        response = np.maximum(np.cos(np.deg2rad(angles)), 0)
        curve_data.data = dict(angle=angles, diffuse=response, specular=response**exponent.value)
        marks.data = dict(angle=[theta_light, theta_half], response=[max(ndotl, 0), max(ndoth, 0)**exponent.value], color=[GREEN, ORANGE])
        tangent = normalize(linear @ normalize(np.cross([0, 1, 0], probe_local)))
        normal_error = np.degrees(np.arccos(np.clip(n@wrong, -1, 1)))
        fmt = lambda a: "("+", ".join(f"{v:.3f}" for v in a)+")"
        values = probe_values[0]
        readout.object = f'''<div style="font:14px/1.9 system-ui;color:#314637;overflow-wrap:anywhere">
<b>同一个表面点 · 世界空间</b><br>p = {fmt(probe_world)}<br>n = {fmt(n)}<br>ℓ = {fmt(probe_light)}，v = (0, 0, 1)<br>
θ = {theta_light:.1f}°，n·ℓ = {ndotl:.3f}<br>α = {theta_half:.1f}°，n·h = {ndoth:.3f}<br>
入射比例 {'I / r²' if is_point else 'I'} = {float(probe_intensity):.3f}<br>
<span style="color:{GREEN}">漫反射 RGB = {fmt(values['diffuse'])}</span><br>
<span style="color:{ORANGE}">高光 RGB = {fmt(values['specular'])}</span><br>
环境常量 RGB = {fmt(values['ambient'])}<br>
<b>法线检查</b> · 正确 / 错误<br>与切线的点积：{n@tangent:.3f} / {wrong@tangent:.3f}<br>两种法线夹角：{normal_error:.1f}°</div>'''
        difference = np.mean(np.abs(scene_values[0][mask]-scene_values[1][mask]))
        clipped = np.mean(np.any(scene_values[0][mask] > 1, axis=-1))*100
        note.object = f'<p style="font:14px/1.8 system-ui;color:#65745f">Python / NumPy · 每幅 {SIZE} × {SIZE} 样本 · 本次计算 {(perf_counter()-start)*1000:.1f} ms（不含浏览器显示）<br>当前分量的线性 RGB 平均绝对差 {difference:.4f}；左图 {clipped:.1f}% 的物体样本超出显示范围并被裁到 1。两图固定同一曝光，最后编码 sRGB。箭头为三维法线在画面上的投影，投影长度不能用来判断归一化。</p>'

    def pick(event):
        nonlocal updating
        # 点击给出的是 y 向上的几何坐标，直接反求表面参数，不再翻转。
        u, v = event.x/sx.value, event.y/sy.value
        radius = np.hypot(u, v)
        if radius >= 1:
            return
        updating = True
        probe_theta.value = min(89., np.degrees(np.arcsin(radius)))
        probe_phi.value = np.degrees(np.arctan2(v, u))
        updating = False
        refresh()

    for column in scene_columns:
        column[1].object.on_event(Tap, pick)
    widgets = [component, light_type, exponent, azimuth, elevation, lx, ly, lz, power, sx, sy, sz, diffuse, specular, ambient, probe_theta, probe_phi]
    for widget in widgets:
        widget.param.watch(refresh, "value")

    def preset(name):
        nonlocal updating
        updating = True
        sx.value, sy.value, sz.value = (1., 1., 1.) if name == "球面：错误被掩盖" else (1.5, .8, .55)
        component.value, light_type.value, power.value = "total", "方向光", 1.
        azimuth.value, elevation.value, exponent.value = 135., 45., 32
        diffuse.value, specular.value, ambient.value = .8, .3, .025
        if name == "掠射光":
            elevation.value, ambient.value = 5., 0.
        elif name == "点光与距离":
            light_type.value, power.value = "点光源", 8.
        elif name == "只看高光":
            component.value, exponent.value = "specular", 96
        updating = False
        refresh()

    buttons = []
    for name in ["非均匀缩放", "球面：错误被掩盖", "掠射光", "点光与距离", "只看高光"]:
        button = pn.widgets.Button(name=name, width=150, height=38)
        button.on_click(lambda event, name=name: preset(name))
        buttons.append(button)
    geometry = pn.Column(pn.FlexBox(sx, sy, sz, flex_wrap="wrap", sizing_mode="stretch_width"), pn.FlexBox(diffuse, specular, ambient, flex_wrap="wrap", sizing_mode="stretch_width"), sizing_mode="stretch_width")
    details = pn.Accordion(("形状与材质参数", geometry), ("精确移动表面探针", pn.FlexBox(probe_theta, probe_phi, flex_wrap="wrap", sizing_mode="stretch_width")), active=[], sizing_mode="stretch_width")
    refresh()
    return pn.Column(pn.FlexBox(*buttons, flex_wrap="wrap"),
                     pn.FlexBox(component, light_type, flex_wrap="wrap"), direction_controls, point_controls,
                     pn.FlexBox(exponent, power, flex_wrap="wrap", sizing_mode="stretch_width"), details,
                     pn.FlexBox(*scene_columns, flex_wrap="wrap", sizing_mode="stretch_width"), note,
                     pn.FlexBox(pn.Column(pn.pane.Markdown("**角度响应与当前探针** · 曲线尚未乘材质和光强；背光时高光另设为 0。"), pn.pane.Bokeh(curve, sizing_mode="stretch_width"), sizing_mode="stretch_width", styles={"flex": "2 1 470px", "min-width": "260px"}),
                                pn.Column(readout, sizing_mode="stretch_width", styles={"flex": "1 1 310px", "min-width": "260px", "padding": "10px"}),
                                flex_wrap="wrap", align_items="flex-start", sizing_mode="stretch_width"),
                     pn.pane.Markdown("**先猜再试**：球面上两幅图为何相同？把 az 压到 0.3 后，错误图的高光为何跑偏？增大高光指数时，观察曲线宽度和实际亮斑一起收缩。"),
                     sizing_mode="stretch_width")
