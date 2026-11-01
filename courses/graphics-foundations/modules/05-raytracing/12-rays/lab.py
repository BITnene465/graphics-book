"""低预算同步交互；不启动后台任务，也不显示不存在的取消按钮。"""

from time import perf_counter

import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, CustomJS, HoverTool, Range1d
from bokeh.plotting import figure

from .core import (CENTERS, RADII, EYE, raster_comparison, render_image, trace_pixel)


def _rgba(image, encode=False):
    image = np.clip(image, 0, 1)
    if encode:
        image = np.where(image <= .0031308, 12.92*image, 1.055*image**(1/2.4)-.055)
    rgba = np.empty((*image.shape[:2], 4), np.uint8)
    rgba[..., :3], rgba[..., 3] = np.rint(image*255).astype(np.uint8), 255
    return np.ascontiguousarray(rgba.view(np.uint32).reshape(image.shape[:2])[::-1])


def _image_plot(name, title, height=440):
    source = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name=name)
    plot = figure(width=420, height=height, sizing_mode='scale_width', min_width=280,
                  x_range=Range1d(0, 64), y_range=Range1d(0, 64), title=title,
                  toolbar_location=None, tools='', min_border=5)
    plot.image_rgba(source=source, image='image', x='x', y='y', dw='dw', dh='dh', origin='bottom_left')
    plot.axis.visible = plot.grid.visible = False
    plot.background_fill_color = plot.border_fill_color = '#fbfcf8'
    plot.title.text_font_size, plot.title.text_font_style = '14px', 'normal'
    return plot, source


def build():
    size = pn.widgets.Select(name='图像分辨率', options=[32, 64, 96], value=64, width=150)
    mode = pn.widgets.Select(name='查看内容', options=['最终颜色', '表面法线', '射线距离'], width=150)
    bounces = pn.widgets.IntSlider(name='最多镜面反射次数', start=0, end=3, value=2, width=235)
    epsilon = pn.widgets.Select(name='起点偏移 epsilon', options={'0 · 自相交反例': 0, '0.0001 · 默认': 1e-4, '0.01': .01, '0.05 · 过大示例': .05}, value=1e-4, width=210)
    light_x = pn.widgets.FloatSlider(name='点光位置 x', start=-4, end=4, value=-3, step=.1, width=240)
    light_y = pn.widgets.FloatSlider(name='点光高度 y', start=3, end=7, value=5, step=.1, width=240)
    light_z = pn.widgets.FloatSlider(name='点光位置 z', start=-4, end=5, value=4, step=.1, width=240)
    plane = pn.widgets.RadioButtonGroup(name='解释图投影', options=['XZ · 俯视', 'XY · 侧视'], value='XZ · 俯视')
    row = pn.widgets.IntInput(name='数组行 row ↓', value=34, start=0, end=63, width=145)
    col = pn.widgets.IntInput(name='数组列 col →', value=22, start=0, end=63, width=145)
    mesh = pn.widgets.Select(name='光栅球经向分段', options=[8, 12, 20], value=12, width=175)
    reset = pn.widgets.Button(name='恢复默认', width=120)
    caption, details, compare_caption = pn.pane.Markdown(), pn.pane.Markdown(), pn.pane.Markdown()
    for pane in [caption, details, compare_caption]:
        pane.sizing_mode = 'stretch_width'
        pane.styles = {'font-size': '15px', 'line-height': '1.7'}
    image_plot, image_source = _image_plot('rays_image', '每个像素一条主射线')
    probe = ColumnDataSource(dict(x=[22.5], y=[29.5]), name='rays_pixel_probe')
    image_plot.scatter('x', 'y', source=probe, marker='cross', size=17, line_width=4, line_color='white')
    image_plot.scatter('x', 'y', source=probe, marker='cross', size=17, line_width=2, line_color='#bf693a')
    diagram = figure(height=440, sizing_mode='stretch_width', min_width=280, x_range=Range1d(-6, 6), y_range=Range1d(-6, 6),
                     toolbar_location=None, tools='', title='一个像素的完整射线链 · 正交解释图')
    diagram.title.text_font_size = '14px'
    diagram.title.text_font_style = 'normal'
    diagram.axis.major_label_text_font_size = diagram.axis.axis_label_text_font_size = '14px'
    diagram.axis.axis_label_text_font_style = 'normal'
    diagram.background_fill_color = diagram.border_fill_color = '#fbfcf8'
    objects = ColumnDataSource(dict(xs=[], ys=[]))
    segments = ColumnDataSource(dict(xs=[], ys=[], color=[], dash=[], label=[]), name='rays_segments')
    points = ColumnDataSource(dict(x=[], y=[], label=[]))
    framing = ColumnDataSource(dict(x=[0.], y=[0.], span=[12.]))
    diagram.multi_line('xs', 'ys', source=objects, line_color='#a5b5aa', line_width=1.5)
    renderer = diagram.multi_line('xs', 'ys', source=segments, line_color='color', line_dash='dash', line_width=2.5)
    diagram.scatter('x', 'y', source=points, size=8, color='#294d3e')
    diagram.text('x', 'y', text='label', source=points, x_offset=5, y_offset=5, text_font_size='14px')
    diagram.add_tools(HoverTool(renderers=[renderer], tooltips='<div style="font-size:14px">@label</div>'))
    equal = CustomJS(args=dict(plot=diagram, view=framing), code="""
const w=plot.inner_width,h=plot.inner_height,d=view.data;
if(w>0 && h>0){const sx=d.span[0]*Math.max(1,w/h),sy=d.span[0]*Math.max(1,h/w);
plot.x_range.setv({start:d.x[0]-sx/2,end:d.x[0]+sx/2});
plot.y_range.setv({start:d.y[0]-sy/2,end:d.y[0]+sy/2});}
""")
    for prop in ['inner_width', 'inner_height']:
        diagram.js_on_change(prop, equal)
    framing.js_on_change('data', equal)
    analytic_plot, analytic_source = _image_plot('rays_analytic_normal', '解析球 · 射线首命中法线', 330)
    raster_plot, raster_source = _image_plot('rays_raster_normal', '三角网格球 · 光栅化面法线', 330)
    state = dict(result=None, size=64, updating=False, comparison_key=None, comparison=None)

    def update_probe(event=None):
        if state['updating'] or state['result'] is None:
            return
        n = size.value
        r, c = np.clip([row.value or 0, col.value or 0], 0, n-1).astype(int)
        state['updating'] = True
        row.value, col.value = int(r), int(c)
        state['updating'] = False
        probe.data = dict(x=[c+.5], y=[n-r-.5])
        light = [light_x.value, light_y.value, light_z.value]
        steps = trace_pixel(n, int(r), int(c), light, bounces.value, epsilon.value)
        axes = [0, 2] if plane.value.startswith('XZ') else [0, 1]
        diagram.xaxis.axis_label, diagram.yaxis.axis_label = '世界 x', '世界 z' if axes[1] == 2 else '世界 y'
        outlines = []
        angle = np.linspace(0, 2*np.pi, 80)
        for center, radius in zip(CENTERS, RADII):
            outlines.append(center[axes] + radius*np.column_stack((np.cos(angle), np.sin(angle))))
        outlines.append(np.array([[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]) if axes[1] == 2 else np.array([[-5, 0], [5, 0]]))
        objects.data = dict(xs=[o[:, 0] for o in outlines], ys=[o[:, 1] for o in outlines])
        lines, colors, dashes, labels, locations, names, text_rows = [], [], [], [], [EYE[axes], np.array(light)[axes]], ['相机', '光'], []
        def add(a, b, color, dash, label):
            lines.append(np.array([a, b])[:, axes]);colors.append(color);dashes.append(dash);labels.append(label)
        for step in steps:
            bounce = step['bounce']
            add(step['origin'], step['end'], '#21513e' if bounce == 0 else '#cf793f', 'solid', f'{"主射线" if bounce == 0 else "反射"} {bounce}')
            if step['owner'] < 0:
                text_rows.append(f'**第 {bounce} 段：未命中，返回背景。** 解释图只画出 8 个世界单位的延长线。')
                continue
            locations.append(step['end'][axes]);names.append(f'P{bounce}')
            add(step['end'], step['end']+.55*step['normal'], '#6d8979', 'dashed', f'P{bounce} 的单位法线（显示长0.55）')
            add(step['shadow_start'], step['shadow_end'], '#4989ae', 'dotted', f'P{bounce} 的阴影射线')
            object_name = ['蓝球', '橙球', '地面'][step['owner']]
            shadow = '受光：到光源前没有遮挡' if step['shadow_owner'] < 0 else f"被 {['蓝球','橙球','地面'][step['shadow_owner']]} 遮挡，t={step['shadow_t']:.6f}"
            fmt = lambda v: '('+', '.join(f'{x:.5f}' for x in v)+')'
            text_rows.append(f"**第 {bounce} 段 → {object_name}，t = {step['t']:.6f}**\n\n"
                             f"- 起点 o：`{fmt(step['origin'])}`；方向 d：`{fmt(step['direction'])}`\n"
                             f"- 命中 P：`{fmt(step['end'])}`；法线 n：`{fmt(step['normal'])}`\n"
                             f"- 反射方向：`{fmt(step['reflected'])}`\n"
                             f"- 阴影线段最长 {step['light_distance']:.5f}；{shadow}。")
        segments.data = dict(xs=[line[:, 0] for line in lines], ys=[line[:, 1] for line in lines], color=colors, dash=dashes, label=labels)
        points.data = dict(x=[p[0] for p in locations], y=[p[1] for p in locations], label=names)
        all_points = np.vstack(outlines+lines+[np.array(locations)])
        low, high = all_points.min(axis=0), all_points.max(axis=0)
        center = (low+high)/2
        framing.data = dict(x=[center[0]], y=[center[1]], span=[max(high-low)*1.14])
        details.object = f"**像素 [{r}, {c}] 的步骤** · 绿色主射线，橙色反射，蓝色点线阴影，短虚线法线。\n\n" + '\n\n'.join(text_rows)

    def update(event=None):
        n, light = size.value, [light_x.value, light_y.value, light_z.value]
        start = perf_counter()
        result = render_image(n, light, bounces.value, epsilon.value)
        elapsed = (perf_counter()-start)*1000
        state['result'] = result
        pixels = result['color'] if mode.value == '最终颜色' else result['normal'] if mode.value == '表面法线' else np.repeat(result['distance'][..., None], 3, axis=2)
        image_source.data = dict(image=[_rgba(pixels, mode.value == '最终颜色')], x=[0], y=[0], dw=[n], dh=[n])
        image_plot.x_range.end = image_plot.y_range.end = n
        key = (n, mesh.value)
        if state['comparison_key'] != key:
            state['comparison'] = raster_comparison(n, mesh.value)
            state['comparison_key'] = key
        for source, plot, image in [(analytic_source, analytic_plot, result['normal']), (raster_source, raster_plot, state['comparison']['normal'])]:
            source.data = dict(image=[_rgba(image)], x=[0], y=[0], dw=[n], dh=[n])
            plot.x_range.end = plot.y_range.end = n
        compare_caption.object = (f"同一相机、球心、半径和地面范围；右图实际栅格化 **{state['comparison']['triangles']}** 个三角形。"
                                  "左图使用解析球面法线，右图使用三角形面法线，因此轮廓和面内颜色的差异包含几何近似与法线定义，不能归咎于可见性算法。此对照只比较首次命中的几何，不加入阴影或反射。")
        old = state['size']
        state['updating'] = True
        row.end = col.end = n-1
        row.value, col.value = min(n-1, int((row.value+.5)/old*n)), min(n-1, int((col.value+.5)/old*n))
        state['size'], state['updating'] = n, False
        caption.object = (f"**{n*n:,}** 条主射线，最多 **{bounces.value}** 次镜面延伸；本次 Python 光线计算 **{elapsed:.1f} ms**（不含浏览器显示和光栅对照）。\n\n"
                          "每个像素只采样中心，未做抗锯齿。距离图固定以 15 个世界单位映到白色；法线图显示 (n+1)/2。同步回调限制为96²像素和3次反射，没有后台取消操作。")
        update_probe()

    def pick(event):
        if 0 <= event.x < size.value and 0 <= event.y < size.value:
            state['updating'] = True
            row.value, col.value = size.value-1-int(event.y), int(event.x)
            state['updating'] = False
            update_probe()

    def defaults(event):
        for control, value in [(size, 64), (mode, '最终颜色'), (bounces, 2), (epsilon, 1e-4),
                               (light_x, -3), (light_y, 5), (light_z, 4), (plane, 'XZ · 俯视'), (mesh, 12)]:
            control.value = value

    image_plot.on_event(Tap, pick)
    for control in [size, mode, bounces, epsilon, light_x, light_y, light_z, mesh]:
        control.param.watch(update, 'value')
    for control in [row, col, plane]:
        control.param.watch(update_probe, 'value')
    reset.on_click(defaults)
    update()
    views = pn.FlexBox(pn.Column(image_plot, min_width=280, sizing_mode='stretch_width', styles={'flex': '1 1 390px'}),
                       pn.Column(plane, diagram, min_width=280, sizing_mode='stretch_width', styles={'flex': '1 1 390px'}), flex_wrap='wrap', gap='20px', sizing_mode='stretch_width')
    comparison = pn.Column(compare_caption, mesh, pn.FlexBox(pn.Column(analytic_plot, styles={'flex': '1 1 280px'}, min_width=280, sizing_mode='stretch_width'),
                                                            pn.Column(raster_plot, styles={'flex': '1 1 280px'}, min_width=280, sizing_mode='stretch_width'), flex_wrap='wrap', sizing_mode='stretch_width'))
    return pn.Column(pn.pane.Markdown('点击蓝球或地面上的像素，跟随同一条射线；把反射预算从0加到2，再把epsilon改成0，检查每次命中的t。', styles={'font-size':'15px'}),
                     pn.FlexBox(size, mode, bounces, epsilon, reset, flex_wrap='wrap', gap='12px'), views, caption,
                     pn.FlexBox(row, col, light_x, light_y, light_z, flex_wrap='wrap', gap='16px'), details,
                     pn.Accordion(('与光栅化做一次实际几何对照', comparison), active=[], sizing_mode='stretch_width'), sizing_mode='stretch_width')
