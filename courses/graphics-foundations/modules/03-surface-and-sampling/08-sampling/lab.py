"""固定输出像素的采样实验；全部图像与曲线数值在 Python 中计算。"""
from time import perf_counter
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource
from bokeh.plotting import figure
from .core import (alias_frequency, average_color, exact_coverage, linear_to_srgb,
                   sample_coverage, sample_offsets, scene_values)


SIZE, COUNTS = 40, [1, 4, 16, 64]
GREEN, ORANGE = "#27664e", "#b57532"


def rgba(linear):
    """显示适配：编码一次、翻转一次，把首行在顶部的数组交给 Bokeh。"""
    rgb = np.rint(linear_to_srgb(linear)*255).astype(np.uint8)
    result = np.full(rgb.shape[:-1]+(4,), 255, np.uint8)
    result[..., :3] = rgb
    return np.flipud(result.view(np.uint32).reshape(rgb.shape[:-1])).copy()


def build():
    def slider(name, start, end, value, step=.05):
        return pn.widgets.FloatSlider(name=name, start=start, end=end, value=value, step=step,
                                      sizing_mode="stretch_width", styles={"flex": "1 1 210px", "min-width": "160px"})
    scene = pn.widgets.Select(name="连续场景", options={"细斜线": "line", "斜边": "edge", "旋转棋盘": "checker"}, value="line", width=165)
    strategy = pn.widgets.Select(name="样本位置策略", options={"规则网格中心": "grid", "分层抖动（固定种子）": "jitter"}, value="grid", width=220)
    inspect_count = pn.widgets.Select(name="放大检查样本数", options=COUNTS, value=16, width=160)
    phase = slider("平移相位（输出像素单位）", -.5, .5, 0, .005)
    angle = slider("场景旋转角（°）", 0, 90, 35, 1)
    line_width = slider("细线宽度（像素）", .1, 2, .6, .05)
    cell_width = slider("棋盘格宽度（像素）", .2, 4, 1.4, .05)
    wrong_space = pn.widgets.Checkbox(name="错误对照：先编码 sRGB，再平均", value=False)
    play = pn.widgets.Toggle(name="播放约 8 秒平移", value=False, width=175, height=38)
    pixel_i = pn.widgets.IntInput(name="像素列 i", start=0, end=SIZE-1, value=SIZE//2-1, width=120)
    pixel_j = pn.widgets.IntInput(name="数组行 j ↓", start=0, end=SIZE-1, value=SIZE//2-1, width=145)
    readout, performance = pn.pane.HTML(sizing_mode="stretch_width", name="sampling_readout"), pn.pane.HTML(sizing_mode="stretch_width")
    image_sources, selections, panels, plots = [], [], [], []
    for count in COUNTS:
        plot = figure(width=300, height=300, sizing_mode="scale_width", x_range=(0, SIZE), y_range=(0, SIZE),
                      tools="", toolbar_location=None, min_border=0, outline_line_color=None, name=f"sampling_image_{count}")
        plot.axis.visible = plot.grid.visible = False
        source = ColumnDataSource(dict(image=[np.zeros((SIZE, SIZE), np.uint32)]))
        plot.image_rgba(image="image", x=0, y=0, dw=SIZE, dh=SIZE, source=source)
        selection = ColumnDataSource(dict(x=[pixel_i.value+.5], y=[SIZE-pixel_j.value-.5]))
        plot.rect("x", "y", width=1, height=1, source=selection, fill_alpha=0, line_color=ORANGE, line_width=2)
        image_sources.append(source)
        selections.append(selection)
        plots.append(plot)
        n = int(np.sqrt(count))
        panels.append(pn.Column(pn.pane.Markdown(f"**{n} × {n} = {count} 个样本 / 像素**"), pn.pane.Bokeh(plot, sizing_mode="stretch_width"),
                                sizing_mode="stretch_width", styles={"flex": "1 1 250px", "min-width": "250px", "max-width": "340px"}))
    inset = figure(width=310, height=310, sizing_mode="scale_width", x_range=(0, 1), y_range=(0, 1), tools="", toolbar_location=None,
                   min_border=28, background_fill_color="#fbfcf8", border_fill_color="#fbfcf8", name="sampling_pixel")
    inset.axis.major_label_text_font_size = "14px"
    inset.grid.grid_line_color = "#dfe7db"
    inset_image = ColumnDataSource(dict(image=[np.zeros((100, 100), np.uint32)]))
    inset.image_rgba(image="image", x=0, y=0, dw=1, dh=1, source=inset_image, global_alpha=.42)
    dots = ColumnDataSource(dict(x=[], y=[], color=[]))
    inset.scatter("x", "y", source=dots, size=10, fill_color="color", line_color="white", line_width=1.5)
    inset.xaxis.axis_label = "像素内部 x"
    inset.yaxis.axis_label = "像素内部 y"
    updating = False

    def refresh(event=None):
        if updating or pixel_i.value is None or pixel_j.value is None:
            return
        start = perf_counter()
        parameters = dict(scene=scene.value, phase=phase.value, angle=angle.value, width=line_width.value, cell=cell_width.value)
        truth = None if scene.value == "checker" else exact_coverage(SIZE, **{k:v for k,v in parameters.items() if k != "cell"})
        coverages = []
        for count, source, selection in zip(COUNTS, image_sources, selections):
            coverage = sample_coverage(SIZE, count, strategy.value, **parameters)
            source.data = dict(image=[rgba(average_color(coverage, wrong_space=wrong_space.value))])
            selection.data = dict(x=[pixel_i.value+.5], y=[SIZE-pixel_j.value-.5])
            coverages.append(coverage)
        offsets = sample_offsets(inspect_count.value, strategy.value)
        lower_left = np.array([pixel_i.value, SIZE-1-pixel_j.value])-SIZE/2
        hits = scene_values(lower_left+offsets, **parameters)
        dots.data = dict(x=offsets[:, 0], y=offsets[:, 1], color=[GREEN if value else "#929b8e" for value in hits])
        preview = (np.arange(100)+.5)/100
        x, y = np.meshgrid(preview, preview[::-1])
        detail = scene_values(lower_left+np.stack([x, y], axis=-1), **parameters)
        inset_image.data = dict(image=[rgba(average_color(detail))])
        coverage = float(hits.mean())
        correct = average_color(coverage)
        wrong = average_color(coverage, wrong_space=True)
        formatted = lambda values: "("+", ".join(f"{v:.3f}" for v in values)+")"
        rows = []
        for count, values in zip(COUNTS, coverages):
            error = "无解析参考" if truth is None else f"{np.mean(np.abs(values-truth)):.5f}"
            rows.append(f"<tr><td>{count}</td><td>{values[pixel_j.value,pixel_i.value]:.4f}</td><td>{error}</td></tr>")
        reference = "棋盘未提供解析真值；放大底图也不是积分真值。" if truth is None else f"这个像素的解析覆盖率 = {truth[pixel_j.value,pixel_i.value]:.6f}。"
        hit_indices = ", ".join(str(index+1) for index,value in enumerate(hits) if value)
        encoded = linear_to_srgb(correct)
        encoded_wrong = linear_to_srgb(wrong)
        chip = lambda color: '<span style="display:inline-block;width:27px;height:17px;border:1px solid #98a38e;vertical-align:middle;background:rgb('+','.join(str(round(v*255)) for v in color)+')"></span>'
        readout.object = f'''<div style="font:14px/1.9 system-ui;color:#314637;overflow-wrap:anywhere">
<b>数组 coverage[{pixel_j.value}, {pixel_i.value}] · 每个圆点就是一次 Python 求值</b><br>
场景中心 {formatted(lower_left+.5)}；数组行向下，场景 y 向上，场景原点在图像中心。<br>
Σ f(xₖ, yₖ) / N = {int(hits.sum())} / {len(hits)} = <b>{coverage:.4f}</b><br>
命中的样本编号：{hit_indices or '无'}<br>{reference}<br>
<table style="width:100%;text-align:left;margin:10px 0"><tr><th>样本数</th><th>本像素覆盖</th><th>全图覆盖 MAE</th></tr>{''.join(rows)}</table>
线性平均 RGB = {formatted(correct)}<br>
正确显示 {chip(encoded)} sRGB = {formatted(encoded)}<br>
错误显示 {chip(encoded_wrong)} sRGB = {formatted(encoded_wrong)}<br>
灰色点未命中，绿色点命中。放大底图仅解释连续场景，只有圆点进入平均。</div>'''
        performance.object = f'<p style="font:14px/1.8 system-ui;color:#65745f">四幅输出始终是 {SIZE} × {SIZE}；页面放大未增加采样。共 {SIZE*SIZE*sum(COUNTS):,} 次场景求值；本次 Python 计算 {(perf_counter()-start)*1000:.1f} ms，不含浏览器显示。抖动使用固定种子，同一组位置在所有像素重复，避免每帧重新随机化引入额外噪声。</p>'

    def pick(event):
        nonlocal updating
        if not 0 <= event.x < SIZE or not 0 <= event.y < SIZE:
            return
        updating = True
        pixel_i.value, pixel_j.value = int(event.x), SIZE-1-int(event.y)
        updating = False
        refresh()

    for plot in plots:
        plot.on_event(Tap, pick)
    for widget in [scene, strategy, inspect_count, phase, angle, line_width, cell_width, wrong_space, pixel_i, pixel_j]:
        widget.param.watch(refresh, "value")
    frame, initial_angle = 0, 0.

    def tick():
        nonlocal frame
        frame += 1
        phase.value = .5*np.sin(initial_angle+2*np.pi*frame/64)
        if frame >= 64:
            play.value = False

    periodic = pn.state.add_periodic_callback(tick, period=125, start=False)

    def toggle(event):
        nonlocal frame, initial_angle
        if event.new:
            frame, initial_angle = 0, np.arcsin(np.clip(phase.value/.5, -1, 1))
            play.name = "暂停平移"
            periodic.start()
        else:
            play.name = "播放约 8 秒平移"
            periodic.stop()

    play.param.watch(toggle, "value")
    if pn.state.curdoc is not None:
        pn.state.on_session_destroyed(lambda context: periodic.stop())

    # 第二个实验独立控制：高频与低频连续曲线在同一组样本处完全相同。
    frequency = slider("真实频率 f（周期 / 单位）", 0, 30, 9, .25)
    sample_rate = pn.widgets.IntSlider(name="采样率 fs（样本 / 单位）", start=4, end=40, value=8, sizing_mode="stretch_width", styles={"flex": "1 1 210px", "min-width": "160px"})
    signal_phase = slider("正弦相位 φ（°）", 0, 180, 0, 1)
    signal_source = ColumnDataSource(dict(x=[], real=[], alias=[]))
    signal_samples = ColumnDataSource(dict(x=[], value=[]))
    signal_plot = figure(height=290, sizing_mode="stretch_width", x_range=(0, 1), y_range=(-1.15, 1.15), tools="", toolbar_location=None,
                         background_fill_color="#fbfcf8", border_fill_color="#fbfcf8", name="sampling_signal")
    signal_plot.line("x", "real", source=signal_source, color=GREEN, line_alpha=.6, line_width=2, legend_label="真实连续信号")
    signal_plot.line("x", "alias", source=signal_source, color=ORANGE, line_width=2.5, line_dash="dashed", legend_label="同样本的低频候选")
    signal_plot.scatter("x", "value", source=signal_samples, size=9, fill_color="#253f32", line_color="white")
    signal_plot.legend.label_text_font_size = "14px"
    signal_plot.legend.location = "top_right"
    signal_plot.legend.background_fill_alpha = .75
    signal_plot.axis.major_label_text_font_size = "14px"
    signal_plot.xaxis.axis_label = "连续位置 x（一个单位区间）"
    signal_plot.grid.grid_line_color = "#e1e7dd"
    signal_note = pn.pane.HTML(sizing_mode="stretch_width", name="sampling_signal_note")

    def refresh_signal(event=None):
        f, fs, phi = frequency.value, sample_rate.value, np.deg2rad(signal_phase.value)
        alias = alias_frequency(f, fs)
        x, samples = np.linspace(0, 1, 2401), np.arange(fs+1)/fs
        signal_source.data = dict(x=x, real=np.sin(2*np.pi*f*x+phi), alias=np.sin(2*np.pi*alias*x+phi))
        signal_samples.data = dict(x=samples, value=np.sin(2*np.pi*f*samples+phi))
        error = np.max(np.abs(signal_samples.data['value']-np.sin(2*np.pi*alias*samples+phi)))
        state = "低于 Nyquist 频率" if f < fs/2 else "位于 Nyquist 边界，相位可能使样本全为零" if f == fs/2 else "超过 Nyquist 频率，出现低频混叠"
        signal_note.object = f'<p style="font:14px/1.9 system-ui;color:#314637">f = {f:g}，fs = {fs}，Nyquist 频率 fs / 2 = {fs/2:g}。<b>{state}。</b><br>等价的带符号频率 f_alias = {alias:g}；候选曲线每单位有 {abs(alias):g} 个周期。两曲线在采样点上的最大差 {error:.1e}。负号保留相位方向；这条候选曲线用于证明歧义，不声称有限样本自动完成了理想 sinc 重建。</p>'

    for widget in [frequency, sample_rate, signal_phase]:
        widget.param.watch(refresh_signal, "value")
    signal_presets = []
    for name, value in [("9 伪装成 1", 9), ("Nyquist 边界", 4), ("高频完全消失", 16)]:
        button = pn.widgets.Button(name=name, width=150, height=36)
        def set_signal(event, value=value):
            sample_rate.value, frequency.value, signal_phase.value = 8, value, 0
        button.on_click(set_signal)
        signal_presets.append(button)
    refresh()
    refresh_signal()
    layout = pn.Column(pn.FlexBox(scene, strategy, inspect_count, play, flex_wrap="wrap"),
                       pn.FlexBox(phase, angle, flex_wrap="wrap", sizing_mode="stretch_width"),
                       pn.Accordion(("图案尺度与颜色平均", pn.Column(pn.FlexBox(line_width, cell_width, flex_wrap="wrap", sizing_mode="stretch_width"), wrong_space)), active=[], sizing_mode="stretch_width"),
                       pn.FlexBox(*panels, flex_wrap="wrap", sizing_mode="stretch_width"), performance,
                       pn.pane.Markdown("**点击任一图选像素** · 查看真实采样位置与积分近似"),
                       pn.FlexBox(pn.Column(pn.pane.Bokeh(inset, sizing_mode="stretch_width"), pn.Row(pixel_i, pixel_j), sizing_mode="stretch_width", styles={"flex": "1 1 300px", "max-width": "390px"}),
                                  pn.Column(readout, sizing_mode="stretch_width", styles={"flex": "2 1 420px", "min-width": "260px", "padding": "10px"}), flex_wrap="wrap", sizing_mode="stretch_width"),
                       pn.pane.Markdown("### 一个正弦波，为什么会变成另一个？\n先看圆点，试着判断绿色还是橙色曲线才是真实信号。"),
                       pn.FlexBox(*signal_presets, flex_wrap="wrap"),
                       pn.FlexBox(frequency, sample_rate, signal_phase, flex_wrap="wrap", sizing_mode="stretch_width"),
                       pn.pane.Bokeh(signal_plot, sizing_mode="stretch_width"), signal_note, sizing_mode="stretch_width")
    layout.param.watch(lambda event: setattr(play, "value", False) if not event.new else None, "visible")
    return layout
