"""阴影实验的控件和显示；投影、两遍渲染、查询与 PCF 均在 Python。"""

import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, Range1d
from bokeh.plotting import figure

from .core import render_scene, shadow_query


DEFAULT_LIGHT = (-4, 3, -2)


def _rgba(image, color=False):
    image = np.clip(image, 0, 1)
    if color:
        image = np.where(image <= .0031308, 12.92*image, 1.055*image**(1/2.4)-.055)
    rgba = np.empty((*image.shape[:2], 4), np.uint8)
    rgba[..., :3], rgba[..., 3] = np.rint(image*255).astype(np.uint8), 255
    return np.ascontiguousarray(rgba.view(np.uint32).reshape(image.shape[:2])[::-1])


def _format(values):
    return '(' + ', '.join(f'{x:.4f}' for x in values) + ')'


def build():
    image_size = pn.widgets.Select(name="相机分辨率", options=[64, 96, 128], value=96, width=145)
    shadow_size = pn.widgets.Select(name="阴影图分辨率", options=[32, 64, 96, 128, 256], value=96, width=150)
    pcf = pn.widgets.Select(name="比较核", options={"硬阴影 · 1 次": 0, "PCF 3×3 · 9 次": 1, "PCF 5×5 · 25 次": 2}, value=0, width=185)
    compare = pn.widgets.Checkbox(name="主图暂时显示硬阴影对照", value=False, width=240)
    light_x = pn.widgets.FloatSlider(name="光源观察位置 x", start=-4, end=4, value=DEFAULT_LIGHT[0], step=.1, width=245)
    light_z = pn.widgets.FloatSlider(name="光源观察位置 z", start=-4, end=4, value=DEFAULT_LIGHT[2], step=.1, width=245)
    light_y = pn.widgets.FloatSlider(name="光源观察高度 y", start=2, end=8, value=DEFAULT_LIGHT[1], step=.1, width=245)
    bias = pn.widgets.FloatSlider(name="接收端 bias（归一化光深度）", start=0, end=.08, value=.004, step=.001, width=280)
    extent = pn.widgets.FloatSlider(name="光空间正交窗口高度", start=4, end=12, value=8, step=.5, width=270)
    row = pn.widgets.IntInput(name="相机数组行 row ↓", value=55, start=0, end=95, width=165)
    col = pn.widgets.IntInput(name="相机数组列 col →", value=51, start=0, end=95, width=165)
    acne = pn.widgets.Button(name="反例：bias 太小", width=165)
    detached = pn.widgets.Button(name="反例：bias 太大", width=165)
    reset = pn.widgets.Button(name="恢复默认", width=115)
    description, probe = pn.pane.Markdown(), pn.pane.Markdown()
    description.sizing_mode = probe.sizing_mode = 'stretch_width'
    marker = ColumnDataSource(dict(x=[col.value+.5], y=[image_size.value-row.value-.5]), name='shadow_camera_probe')
    light_marker = ColumnDataSource(dict(x=[], y=[]), name='shadow_light_probe')
    sources, plots = [], []
    for index, title in enumerate(['主相机 · 阴影颜色', '第一遍 · 光源深度 D', '第二遍 · 光的可见率 V']):
        source = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name=f'shadow_image_{index}')
        plot = figure(width=320, height=345, sizing_mode='scale_width', min_width=250,
                      x_range=Range1d(0, 96), y_range=Range1d(0, 96), tools='', toolbar_location=None,
                      title=title, min_border=5, name=f'shadow_canvas_{index}')
        plot.image_rgba(source=source, image='image', x='x', y='y', dw='dw', dh='dh', origin='bottom_left')
        source_marker = light_marker if index == 1 else marker
        plot.scatter('x', 'y', source=source_marker, marker='cross', size=15, line_color='white', line_width=4)
        plot.scatter('x', 'y', source=source_marker, marker='cross', size=15, line_color='#ac5827', line_width=2)
        plot.axis.visible = plot.grid.visible = False
        plot.background_fill_color = plot.border_fill_color = '#fbfcf8'
        plot.outline_line_color = '#d1dacd'
        plot.title.text_font_style = 'normal'
        plot.title.text_font_size = '13px'
        sources.append(source)
        plots.append(plot)
    state = dict(result=None, updating=False, size=96)

    def inspect_pixel(event=None):
        if state['updating'] or state['result'] is None:
            return
        n = image_size.value
        r, c = np.clip([row.value or 0, col.value or 0], 0, n-1).astype(int)
        state['updating'] = True
        row.value, col.value = int(r), int(c)
        state['updating'] = False
        marker.data = dict(x=[c+.5], y=[n-r-.5])
        result = state['result']
        if result['camera']['owner'][r, c] < 0:
            light_marker.data = dict(x=[], y=[])
            probe.object = f"**相机像素 [{r}, {c}] 是背景。** 点击柱子或地面，才有世界位置可以变换到光空间。"
            return
        point = result['camera']['world'][r, c]
        query = shadow_query(point[None, :], result['light_vp'], result['shadow_depth'], bias.value, pcf.value)
        uv, current, stored = query['uv'][0], query['current'][0], query['stored'][0]
        if query['inside'][0]:
            light_marker.data = dict(x=[uv[0]*shadow_size.value], y=[(1-uv[1])*shadow_size.value])
            status = f"阴影纹理行列 [{query['rows'][0]}, {query['cols'][0]}]；中心样本 D = {stored:.6f}" if np.isfinite(stored) else "中心样本为空（+∞），没有记录到遮挡物。"
        else:
            light_marker.data = dict(x=[], y=[])
            status = "该点在光的裁剪体外：按本章的显式边界策略视为受光，不夹到边缘 texel。"
        lines = []
        samples = query['samples'][0].reshape(2*pcf.value+1, -1)
        for values in samples:
            lines.append('  '.join((f'{value:.4f}' if np.isfinite(value) else '∞') + (' ✓' if current-bias.value <= value else ' ×') for value in values))
        probe.object = (f"**相机像素 [{r}, {c}] → 光空间检查**\n\n"
                        f"| 阶段 | 数值 |\n|---|---|\n| 世界位置 P | `{_format(point)}` |\n"
                        f"| light clip = P_L V_L P | `{_format(query['clip'][0])}` |\n"
                        f"| light UV（左上原点） | `{_format(uv)}` |\n"
                        f"| 当前 D / bias / D−bias | `{current:.6f} / {bias.value:.4f} / {current-bias.value:.6f}` |\n"
                        f"| 比较核可见率 V | **{query['visibility'][0]:.4f}** |\n\n{status}\n\n"
                        "每个 ✓ 表示该次 `D−bias ≤ stored`，最后平均这些 0/1 结果：\n\n```text\n" + '\n'.join(lines) + '\n```')

    def update(event=None):
        n, size = image_size.value, shadow_size.value
        result = render_scene(n, size, [light_x.value, light_y.value, light_z.value], bias.value, pcf.value, extent.value)
        state['result'] = result
        valid = result['camera']['owner'] >= 0
        visibility = result['visibility']
        mask_rgb = np.repeat(np.nan_to_num(visibility, nan=.95)[..., None], 3, axis=2)
        mask_rgb[~valid] = [.9, .94, .88]
        mask_rgb[valid & ~result['light_inside']] = [.87, .68, .34]
        depth_rgb = np.repeat(np.where(np.isfinite(result['shadow_depth']), result['shadow_depth'], .95)[..., None], 3, axis=2)
        depth_rgb[~np.isfinite(result['shadow_depth'])] = [.9, .94, .88]
        main_color = result['hard_color'] if compare.value else result['color']
        for index, (pixels, dimension) in enumerate([(main_color, n), (depth_rgb, size), (mask_rgb, n)]):
            sources[index].data = dict(image=[_rgba(pixels, color=index == 0)], x=[0], y=[0], dw=[dimension], dh=[dimension])
            plots[index].x_range.end = plots[index].y_range.end = dimension
        plots[0].title.text = '主相机 · 硬阴影对照' if compare.value else '主相机 · 当前比较核'
        old = state['size']
        state['updating'] = True
        row.end = col.end = n-1
        row.value, col.value = min(n-1, int((row.value+.5)/old*n)), min(n-1, int((col.value+.5)/old*n))
        state['size'], state['updating'] = n, False
        fractional = np.sum(valid & (visibility > 0) & (visibility < 1))
        pcf_hint = ("\n\n**PCF 坡度提示：** 核越大，邻居在斜向光空间中的深度差越大；"
                    "用同一个接收点深度比较它们，可能让本应受光的地面出现自阴影条纹。"
                    "比较核大小时保持 bias 不变；随后固定核、光位与分辨率，再手动增大 bias 观察权衡"
                    "（默认场景的 5×5 可试 0.020），同时检查柱脚是否出现阴影脱离。" if pcf.value else "")
        description.object = (f"两遍都是 Python 栅格化：主相机 **{n}²** 像素，阴影图 **{size}²** texel；"
                              f"当前核每个表面点比较 **{(2*pcf.value+1)**2}** 次，**{fractional}** 个相机像素得到 0 与 1 之间的可见率。\n\n"
                              "点击左图或右图，同一世界点会在中间光深度图中标出位置。右图黑色表示被遮挡，白色表示受光；"
                              "金色表示光空间未覆盖而按策略受光。阴影深度固定 [0,1] 灰度，淡绿为背景。" + pcf_hint)
        inspect_pixel()

    def pick(event):
        n = image_size.value
        if 0 <= event.x < n and 0 <= event.y < n:
            state['updating'] = True
            row.value, col.value = n-1-int(event.y), int(event.x)
            state['updating'] = False
            inspect_pixel()

    def defaults(event=None):
        for control, value in [(image_size, 96), (shadow_size, 96), (pcf, 0), (compare, False),
                               (light_x, DEFAULT_LIGHT[0]), (light_y, DEFAULT_LIGHT[1]),
                               (light_z, DEFAULT_LIGHT[2]), (bias, .004), (extent, 8), (row, 55), (col, 51)]:
            control.value = value

    def acne_example(event):
        defaults()
        shadow_size.value, bias.value = 32, 0

    def detached_example(event):
        defaults()
        bias.value = .08

    plots[0].on_event(Tap, pick)
    plots[2].on_event(Tap, pick)
    for control in (image_size, shadow_size, pcf, compare, light_x, light_y, light_z, bias, extent):
        control.param.watch(update, 'value')
    row.param.watch(inspect_pixel, 'value')
    col.param.watch(inspect_pixel, 'value')
    reset.on_click(defaults)
    acne.on_click(acne_example)
    detached.on_click(detached_example)
    update()
    return pn.Column(pn.pane.Markdown("阴影问题可以换一个观察者：相机看见这个点，光是否也看得见？"
                                     "默认光位 (−4, 3, −2) 把阴影投到可见地面；十字选中柱脚附近。"
                                     "先看它与柱子的接触，再点击「bias 太大」，观察同一位置如何从阴影变为受光。"),
                     pn.FlexBox(image_size, shadow_size, pcf, compare, flex_wrap='wrap', gap='12px'),
                     pn.FlexBox(*[pn.Column(plot, min_width=250, sizing_mode='stretch_width', styles={'flex': '1 1 280px'}) for plot in plots], flex_wrap='wrap', gap='16px', sizing_mode='stretch_width'),
                     description, pn.FlexBox(row, col, flex_wrap='wrap', gap='12px'), probe,
                     pn.FlexBox(light_x, light_y, light_z, bias, extent, flex_wrap='wrap', gap='20px'),
                     pn.FlexBox(acne, detached, reset, flex_wrap='wrap', gap='12px'),
                     pn.pane.Markdown("本实验是平行光＋正交阴影图。光源观察位置朝向世界原点以定义平行光方向；光照没有点光源距离衰减。PCF 只是过滤比较结果，边缘变软不代表模拟了面积光源。"),
                     sizing_mode='stretch_width')
