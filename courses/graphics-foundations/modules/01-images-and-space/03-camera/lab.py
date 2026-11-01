"""第 03 章交互。投影与裁剪全部调用 core.py；这里只有控件和画布。"""

import numpy as np
import panel as pn
from bokeh.models import ColumnDataSource, CustomJS, HoverTool, LabelSet, Range1d, TapTool
from bokeh.plotting import figure

from .core import (look_at, orthographic, perspective, perspective_divide,
                   project_wireframe, transform_points, viewport)


WIDTH, HEIGHT = 640, 480
BOX = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) * .55
EDGES = [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4),
         (0, 4), (1, 5), (2, 6), (3, 7)]


def _lines(segments):
    return {"xs": [s[:, 0].tolist() for s in segments],
            "ys": [s[:, 1].tolist() for s in segments]}


def _format(vector):
    return "(" + ", ".join(f"{value:.3f}" for value in vector) + ")"


def build():
    """主教材负责导航与正文；此函数可以独立创建多个互不干扰的实验。"""
    mode = pn.widgets.RadioButtonGroup(name="投影方式", options=["透视", "正交"], value="透视")
    focal = pn.widgets.FloatSlider(name="焦距 f / mm（传感器高 24 mm）", start=12, end=60, value=24, step=1)
    depth = pn.widgets.FloatSlider(name="近方块中心深度 / 世界单位", start=.2, end=9, value=4, step=.05)
    camera_x = pn.widgets.FloatSlider(name="相机横移 x", start=-2, end=2, value=0, step=.05)
    yaw = pn.widgets.FloatSlider(name="相机偏航 / °", start=-35, end=35, value=0, step=1)
    near = pn.widgets.FloatSlider(name="近平面距离 n", start=.2, end=3, value=1, step=.1)
    far = pn.widgets.FloatSlider(name="远平面距离 F", start=4, end=14, value=12, step=.5)
    ortho_height = pn.widgets.FloatSlider(name="正交窗口高度", start=2, end=8, value=4, step=.1)
    compare = pn.widgets.Checkbox(name="叠加另一种投影（虚线）", value=True)
    selected = pn.widgets.Select(name="跟踪顶点（也可点图中的圆点）",
                                 options={f"{'近' if i < 8 else '远'}方块 · {i % 8}": i for i in range(16)}, value=6)
    preset = pn.widgets.Button(name="实验：穿越近平面", button_type="primary", width=175)
    reset = pn.widgets.Button(name="恢复默认", width=115)
    readout = pn.pane.Markdown(sizing_mode="stretch_width", margin=(8, 0))
    summary = pn.pane.Markdown(sizing_mode="stretch_width", margin=(4, 0))

    side_lines = ColumnDataSource(dict(xs=[], ys=[]))
    frustum = ColumnDataSource(dict(x=[], y=[]))
    near_far = ColumnDataSource(dict(xs=[], ys=[]))
    rays = ColumnDataSource(dict(xs=[], ys=[]))
    side_points = ColumnDataSource(dict(x=[], y=[], id=[], label=[], color=[]), name="camera_side_points")
    side = figure(height=340, sizing_mode="stretch_width", min_width=290,
                  x_range=Range1d(-1, 14), y_range=Range1d(-4, 4),
                  toolbar_location=None, tools="", title="侧视图 · 相机坐标（不是成像结果）")
    side.xaxis.axis_label, side.yaxis.axis_label = "前方深度 d = −z_view", "相机高度 y_view"
    side_extent = ColumnDataSource(dict(cx=[6.5], sx=[15.], sy=[8.]))
    equal_units = CustomJS(args=dict(plot=side, extent=side_extent), code="""
const w=plot.inner_width,h=plot.inner_height,d=extent.data;
if(w>0&&h>0){
    const sx=Math.max(d.sx[0],d.sy[0]*w/h), sy=sx*h/w;
    plot.x_range.setv({start:d.cx[0]-sx/2,end:d.cx[0]+sx/2});
    plot.y_range.setv({start:-sy/2,end:sy/2});
}
""")
    side.js_on_change("inner_width", equal_units)
    side.js_on_change("inner_height", equal_units)
    side_extent.js_on_change("data", equal_units)
    side.patch("x", "y", source=frustum, fill_color="#dce9e0", fill_alpha=.65,
               line_color="#6a8e79", line_width=1.5)
    side.multi_line("xs", "ys", source=near_far, line_color="#789486", line_dash="dashed")
    side.multi_line("xs", "ys", source=side_lines, line_color="#66766d", line_width=2)
    side.multi_line("xs", "ys", source=rays, line_color="#c27c28", line_width=2, line_dash="dotted")
    side.scatter(x=[0], y=[0], marker="triangle", angle=-np.pi/2, size=16, color="#173f33")
    side.text(x=[.12], y=[.3], text=["相机"], text_font_size="11px", text_color="#173f33")
    side_renderer = side.scatter("x", "y", source=side_points, size=9, color="color",
                                 selection_color="#e8a43b", nonselection_alpha=.7)
    side.add_tools(TapTool(renderers=[side_renderer]),
                   HoverTool(renderers=[side_renderer], tooltips=[("顶点", "@label"), ("d / y", "@x{0.00} / @y{0.00}")]))

    image_lines = ColumnDataSource(dict(xs=[], ys=[]), name="camera_projected_edges")
    comparison = ColumnDataSource(dict(xs=[], ys=[]))
    image_points = ColumnDataSource(dict(x=[], y=[], id=[], label=[], color=[]), name="camera_screen_points")
    screen = figure(width=480, height=360, sizing_mode="scale_width", min_width=290,
                    x_range=(0, WIDTH), y_range=(HEIGHT, 0), toolbar_location=None,
                    tools="", min_border=1, name="camera_screen")
    screen.axis.visible = False
    screen.grid.visible = False
    screen.line([0, WIDTH], [HEIGHT/2, HEIGHT/2], line_color="#dedfd8", line_dash="dotted")
    screen.line([WIDTH/2, WIDTH/2], [0, HEIGHT], line_color="#dedfd8", line_dash="dotted")
    screen.multi_line("xs", "ys", source=comparison, line_color="#be995e", line_alpha=.6, line_dash="dashed")
    screen.multi_line("xs", "ys", source=image_lines, line_color="#234f40", line_width=2.5)
    image_renderer = screen.scatter("x", "y", source=image_points, size=9, color="color",
                                    selection_color="#e8a43b", nonselection_alpha=.75)
    screen.add_layout(LabelSet(x="x", y="y", text="label", source=image_points,
                               x_offset=7, y_offset=5, text_font_size="10px", text_color="#66766d"))
    screen.add_tools(TapTool(renderers=[image_renderer]),
                     HoverTool(renderers=[image_renderer], tooltips=[("顶点", "@label"), ("屏幕坐标", "@x{0.0}, @y{0.0}")]))
    for plot in (side, screen):
        plot.background_fill_color = "#fbfbf7"
        plot.border_fill_color = "#fbfbf7"
        plot.outline_line_color = "#ced8cf"
        plot.title.text_font_size = "13px"
        plot.title.text_font_style = "normal"

    def update(*events):
        eye = np.array([camera_x.value, 0, 0])
        angle = np.deg2rad(yaw.value)
        view = look_at(eye, eye + [np.sin(angle), 0, -np.cos(angle)])
        fov = np.rad2deg(2 * np.arctan(12 / focal.value))
        matrices = {"透视": perspective(fov, WIDTH/HEIGHT, near.value, far.value),
                    "正交": orthographic(ortho_height.value, WIDTH/HEIGHT, near.value, far.value)}
        projection = matrices[mode.value]
        other = "正交" if mode.value == "透视" else "透视"
        world = np.vstack((BOX + [-.55, 0, -depth.value], BOX + [1.25, 0, -depth.value-3]))
        edges = EDGES + [(a+8, b+8) for a, b in EDGES]
        view_points = transform_points(world, view)
        clip = view_points @ projection.T
        sides = np.column_stack((-view_points[:, 2], view_points[:, 1]))
        side_lines.data = _lines([sides[[a, b]] for a, b in edges])
        image_lines.data = _lines(project_wireframe(world, edges, view, projection, WIDTH, HEIGHT))
        comparison.data = _lines(project_wireframe(world, edges, view, matrices[other], WIDTH, HEIGHT)) if compare.value else dict(xs=[], ys=[])
        colors = ["#d79531" if i == selected.value else ("#234f40" if i < 8 else "#678393") for i in range(16)]
        labels = [f"{'A' if i < 8 else 'B'}{i % 8}" for i in range(16)]
        side_points.data = dict(x=sides[:, 0], y=sides[:, 1], id=list(range(16)), label=labels, color=colors)
        visible = (clip[:, 3] > 0) & np.all(np.abs(clip[:, :3]) <= clip[:, 3, None] + 1e-12, axis=1)
        ids = np.flatnonzero(visible)
        pixels = viewport(perspective_divide(clip[visible]), WIDTH, HEIGHT)
        image_points.data = dict(x=pixels[:, 0], y=pixels[:, 1], id=ids.tolist(),
                                 label=[labels[i] for i in ids], color=[colors[i] for i in ids])
        half_near, half_far = (near.value*12/focal.value, far.value*12/focal.value) if mode.value == "透视" else (ortho_height.value/2,)*2
        frustum.data = dict(x=[near.value, far.value, far.value, near.value],
                            y=[-half_near, -half_far, half_far, half_near])
        near_far.data = dict(xs=[[near.value]*2, [far.value]*2], ys=[[-half_near, half_near], [-half_far, half_far]])
        side_right = max(far.value+.5, float(sides[:, 0].max())+.5)
        side_extent.data = dict(cx=[(side_right-1)/2], sx=[side_right+1], sy=[2*max(2., half_far*1.1)])
        index = selected.value
        d, y = sides[index]
        ray_start = [0., 0.] if mode.value == "透视" else [0., y]
        rays.data = _lines([np.array([ray_start, [d, y]])])
        stages = [("world 世界", world[index]), ("view 相机", view_points[index]), ("clip 齐次", clip[index])]
        if clip[index, 3] > 0:
            ndc = perspective_divide(clip[[index]])
            stages += [("NDC 除以 w", ndc[0]), ("screen 连续坐标", viewport(ndc, WIDTH, HEIGHT)[0])]
        rows = "".join(f"<tr><td style='padding:5px 12px 5px 0'>{label}</td><td><code>{_format(value)}</code></td></tr>" for label, value in stages)
        state = "位于裁剪体内，可提交绘制。" if visible[index] else ("顶点在裁剪体外；相邻边的可见部分仍然保留。" if clip[index, 3] > 0 else "w ≤ 0：在相机平面或后方，停止除法；相邻边先裁剪。")
        readout.object = f"**跟踪 {labels[index]}** · {state}<div style='overflow-x:auto'><table>{rows}</table></div>" + ("\n\n越界顶点的 NDC / screen 仅供数值检查，不提交绘制。" if not visible[index] and clip[index, 3] > 0 else "")
        summary.object = (f"**{mode.value}投影** · 垂直 FOV **{fov:.1f}°** · f = {focal.value:.0f} mm · "
                          f"裁剪后保留 **{len(image_lines.data['xs'])} / 24** 条边的全部或部分。\n\n"
                          "实线为当前投影，虚线为另一种投影。两方块同样大；B 的世界 z 坐标比 A 小 3，转动相机后相机深度差会变化。"
                          "默认参数下，两种投影在深度 4 的平面上尺度相同。")

    def pick_source(source):
        def on_pick(attr, old, new):
            if new and new[-1] < len(source.data["id"]):
                selected.value = int(source.data["id"][new[-1]])
        return on_pick

    side_points.selected.on_change("indices", pick_source(side_points))
    image_points.selected.on_change("indices", pick_source(image_points))
    for control in (mode, focal, depth, camera_x, yaw, near, far, ortho_height, compare, selected):
        control.param.watch(update, "value")

    def defaults(event=None):
        for control, value in [(mode, "透视"), (focal, 24), (depth, 4), (camera_x, 0),
                               (yaw, 0), (near, 1), (far, 12), (ortho_height, 4), (selected, 6)]:
            control.value = value
        compare.value = True

    def cross_near(event):
        defaults()
        focal.value = 18
        depth.value = .9
        selected.value = 6

    preset.on_click(cross_near)
    reset.on_click(defaults)
    update()
    sliders = pn.FlexBox(*[pn.Column(control, width=270) for control in (focal, depth, camera_x, yaw, near, far, ortho_height)],
                        flex_wrap="wrap", gap="8px", sizing_mode="stretch_width")
    views = pn.FlexBox(pn.Column(side, min_width=290, sizing_mode="stretch_width", styles={"flex": "1 1 380px"}),
                       pn.Column(pn.pane.Markdown("**实际成像 · 640 × 480 连续屏幕坐标**", margin=(6, 0)),
                                 screen, min_width=290, sizing_mode="stretch_width", styles={"flex": "1 1 380px"}),
                       flex_wrap="wrap", gap="20px", sizing_mode="stretch_width")
    return pn.Column(pn.pane.Markdown("先把近方块推远，再切换正交。预测它会不会变小，然后用图和数值检查。"),
                     pn.FlexBox(mode, compare, preset, reset, flex_wrap="wrap", gap="12px"),
                     views, summary, sliders, selected, readout, sizing_mode="stretch_width")
