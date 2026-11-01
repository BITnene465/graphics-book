"""两条 UV 插值路径共享覆盖；点击任一结果，同步检查 Python 中间量。"""
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource, CustomJS, FixedTicker
from bokeh.plotting import figure
from .core import render, bilinear_taps, pixel_footprint


def build():
    tilt = pn.widgets.FloatSlider(name="绕 X 倾角（度）", start=0, end=75, step=1, value=55, width=250)
    rotation = pn.widgets.FloatSlider(name="画面内旋转（度）", start=-45, end=45, step=1, value=0, width=250)
    frequency = pn.widgets.Select(name="每轴棋盘格数", options=[2, 4, 8, 16, 32], value=8, width=150)
    filtering = pn.widgets.Select(name="纹理重建", options={"双线性 · 四邻居": "bilinear", "最近邻 · 一个纹素": "nearest"}, width=190)
    diagonal = pn.widgets.Checkbox(name="换一条三角形对角线", value=False, width=220)
    front = pn.widgets.Button(name="正面 · 两图应一致", width=165)
    oblique = pn.widgets.Button(name="恢复倾斜", width=125)
    largest = pn.widgets.Button(name="检查 UV 差异最大处", width=185)
    row_input = pn.widgets.IntInput(name="屏幕数组行 ↓", value=70, start=0, end=127, width=135)
    col_input = pn.widgets.IntInput(name="屏幕数组列 →", value=64, start=0, end=127, width=135)
    texture_view = pn.widgets.RadioButtonGroup(name="源纹理视图", options=["局部 8×8 纹素", "整张纹理"], value="局部 8×8 纹素")
    marker = ColumnDataSource(dict(x=[], y=[]), name="texture_probe")
    source_marker = ColumnDataSource(dict(x=[], y=[], color=[]), name="texture_uv_points")
    neighbors = ColumnDataSource(dict(x=[], y=[]), name="texture_neighbors")
    footprint = ColumnDataSource(dict(x=[], y=[]), name="texture_footprint")
    view = ColumnDataSource(dict(cx=[32.], cy=[32.], span=[8.]))
    output_sources, plots = [], []
    for name, title in [("texture_correct", "透视正确 · 插值 UV/w 与 1/w"), ("texture_affine", "错误对照 · 直接插值屏幕 UV")]:
        source = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name=name+"_image")
        plot = figure(title=title, height=360, sizing_mode="stretch_width", x_range=(-4,132), y_range=(-4,132),
                      tools="", toolbar_location=None, background_fill_color="#fbfcf8", border_fill_color="#fbfcf8",
                      outline_line_color=None, min_border=32, name=name)
        plot.image_rgba(image="image", x="x", y="y", dw="dw", dh="dh", source=source, origin="bottom_left")
        plot.rect("x", "y", width=2, height=2, source=marker, fill_alpha=0, line_color="#17392b", line_width=4)
        plot.rect("x", "y", width=2, height=2, source=marker, fill_alpha=0, line_color="white", line_width=2)
        output_sources.append(source); plots.append(plot)
    source_image = ColumnDataSource(dict(image=[], x=[], y=[], dw=[], dh=[]), name="texture_source_image")
    source_plot = figure(title="源纹理 · UV 原点在左下", height=355, sizing_mode="stretch_width",
                         x_range=(28,36), y_range=(28,36), tools="", toolbar_location=None,
                         background_fill_color="#eef2e9", border_fill_color="#fbfcf8", outline_line_color=None, min_border=38, name="texture_source")
    source_plot.image_rgba(image="image", x="x", y="y", dw="dw", dh="dh", source=source_image, origin="bottom_left")
    source_plot.rect("x", "y", width=1, height=1, fill_alpha=0, line_color="#f2aa36", line_width=3, source=neighbors)
    source_plot.line("x", "y", line_color="#72e9ec", line_width=3, source=footprint)
    source_plot.scatter("x", "y", size=11, color="color", line_color="white", line_width=2, source=source_marker)
    source_plot.xaxis.axis_label, source_plot.yaxis.axis_label = "u × 64", "v × 64"
    for plot in [*plots, source_plot]:
        plot.title.text_font_size = "15px"; plot.title.text_font_style = "normal"
        plot.axis.major_label_text_font_size = "14px"; plot.axis.axis_label_text_font_size = "14px"
        plot.axis.axis_label_text_font_style = "normal"; plot.grid.visible = False
        viewport = view if plot is source_plot else ColumnDataSource(dict(cx=[64.], cy=[64.], span=[136.]))
        equal = CustomJS(args=dict(plot=plot, viewport=viewport), code="""
const w=plot.inner_width,h=plot.inner_height,d=viewport.data;
if(w>0&&h>0){const sx=d.span[0]*Math.max(1,w/h),sy=d.span[0]*Math.max(1,h/w);
plot.x_range.setv({start:d.cx[0]-sx/2,end:d.cx[0]+sx/2});
plot.y_range.setv({start:d.cy[0]-sy/2,end:d.cy[0]+sy/2});}
""")
        plot.js_on_change("inner_width", equal); plot.js_on_change("inner_height", equal)
        viewport.js_on_change("data", equal)
    for plot in plots:
        plot.axis.ticker = FixedTicker(ticks=[0,32,64,96,128])
    facts = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px", "line-height": "1.7"})
    tap_details = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px"})
    summary = pn.pane.Markdown(sizing_mode="stretch_width", styles={"font-size": "15px"})
    state = dict(result=None, updating=False, uv=np.array([.5,.5]))

    def pack(linear):
        c = np.clip(linear, 0, 1)
        encoded = np.where(c <= .0031308, 12.92*c, 1.055*c**(1/2.4)-.055)
        rgb = np.rint(encoded*255).astype(np.uint32)
        return np.flipud(rgb[...,0] | (rgb[...,1]<<8) | (rgb[...,2]<<16) | (255<<24)).copy()

    def update_source_view(event=None):
        center, span = (state["uv"]*64, 8) if texture_view.value.startswith("局部") else (np.array([32.,32.]), 66)
        view.data = dict(cx=[center[0]], cy=[center[1]], span=[span])

    def inspect(event=None):
        if state["updating"] or state["result"] is None:
            return
        result = state["result"]
        row, col = np.clip([row_input.value or 0, col_input.value or 0], 0, 127).astype(int)
        state["updating"] = True
        row_input.value, col_input.value = int(row), int(col)
        state["updating"] = False
        x, y = col+.5, 127.5-row
        marker.data = dict(x=[x], y=[y])
        index = result["owner"][row,col]
        if index < 0:
            source_marker.data = dict(x=[],y=[],color=[]); neighbors.data=dict(x=[],y=[]); footprint.data=dict(x=[],y=[])
            facts.object = f"**`image[{row},{col}]` 是背景。** 点击任一图中的棋盘格，或选择「检查 UV 差异最大处」。"
            tap_details.object = "背景没有 UV，也没有纹理采样。"
            return
        piece, weights = result["pieces"][index], result["weights"][row,col]
        good, bad = result["uv_correct"][row,col], result["uv_affine"][row,col]
        state["uv"] = good
        source_marker.data = dict(x=[64*good[0],64*bad[0]], y=[64*good[1],64*bad[1]], color=["#176e48","#d46541"])
        fp = pixel_footprint(piece, x, y)*64; fp=np.vstack([fp,fp[0]])
        footprint.data = dict(x=fp[:,0], y=fp[:,1])
        rows, cols, blend = bilinear_taps(good, 64, 64)
        if filtering.value == "nearest":
            rows=np.array([np.clip(int(np.floor((1-good[1])*64)),0,63)])
            cols=np.array([np.clip(int(np.floor(good[0]*64)),0,63)])
            blend=np.array([1.])
        neighbors.data = dict(x=cols+.5, y=63.5-rows)
        fmt = lambda a: "("+", ".join(f"{v:.5f}" for v in a)+")"
        denominator = weights @ piece["inv_w"]
        numerator = weights @ (piece["uv"] * piece["inv_w"][:,None])
        vertex_lines = "\n".join(f"| {name} | {w:.4f} | {1/iw:.4f} | {fmt(uv)} |" for name,w,iw,uv in zip("ABC",weights,piece["inv_w"],piece["uv"]))
        facts.object = f"""**P=({x:.1f},{y:.1f}) · `image[{row},{col}]` · 裁剪后面 {index+1}**

| 顶点 | 屏幕权重 λ | w | 顶点 UV |
| --- | ---: | ---: | --- |
{vertex_lines}

分子 `Σ λ UV/w = {fmt(numerator)}`  
分母 `Σ λ/w = {denominator:.5f}`

**正确 UV：{fmt(good)}**  
直接屏幕插值：{fmt(bad)}  
UV 差异长度：**{np.linalg.norm(good-bad):.5f}**

两个结果查看的是同一个屏幕像素；绿色点为正确 UV，橙色点为错误 UV。"""
        table = "\n".join(f"| [{r},{c}] | {w:.4f} | {fmt(result['texture'][r,c])} |" for r,c,w in zip(rows,cols,blend))
        tap_details.object = f"""**当前过滤：{'双线性四邻居' if filtering.value=='bilinear' else '最近邻一个纹素'}**

| 源纹理 [row,col] | 权重 | 线性 RGB |
| --- | ---: | --- |
{table}

采样结果：`{fmt(result['correct'][row,col])}`（线性 RGB）。

金框是重建使用的纹素，青色轮廓是一个屏幕像素在表面平面上的 UV 足迹。**四邻居不等于整个像素足迹**；本节尚未对足迹做预滤波。边缘采用 clamp，相同纹素可因边界重复参与。"""
        update_source_view()

    def rerender(event=None):
        state["result"] = render(tilt.value, rotation.value, frequency.value, filtering.value, diagonal=int(diagonal.value))
        result = state["result"]
        for source, key in zip(output_sources,["correct","affine"]):
            source.data = dict(image=[pack(result[key])],x=[0],y=[0],dw=[128],dh=[128])
        source_image.data = dict(image=[pack(result["texture"])],x=[0],y=[0],dw=[64],dh=[64])
        mask = result["owner"] >= 0
        error = np.linalg.norm(result["uv_correct"][mask]-result["uv_affine"][mask],axis=-1)
        summary.object = f"**Python · 128×128 输出 / 64×64 纹理** · {mask.sum():,} 个表面像素 · 两种 UV 的平均差 {error.mean():.5f}，最大差 {error.max():.5f}。同一几何、纹理与颜色范围；仅改变插值公式。"
        inspect()

    def pick(event):
        if event.x is not None and event.y is not None and 0 <= event.x < 128 and 0 <= event.y < 128:
            state["updating"] = True
            row_input.value, col_input.value = 127-int(event.y), int(event.x)
            state["updating"] = False
            inspect()

    def pick_largest(event):
        result=state["result"]
        error=np.linalg.norm(result["uv_correct"]-result["uv_affine"],axis=-1)
        row,col=np.unravel_index(np.nanargmax(error),error.shape)
        state["updating"]=True; row_input.value,col_input.value=int(row),int(col); state["updating"]=False
        inspect()

    for plot in plots: plot.on_event(Tap,pick)
    for control in (tilt,rotation,frequency,filtering,diagonal): control.param.watch(rerender,"value")
    for control in (row_input,col_input): control.param.watch(inspect,"value")
    texture_view.param.watch(update_source_view,"value")
    largest.on_click(pick_largest)
    front.on_click(lambda event: (setattr(tilt,"value",0),setattr(rotation,"value",0)))
    oblique.on_click(lambda event: (setattr(tilt,"value",55),setattr(rotation,"value",0)))
    rerender()
    return pn.Column(
        pn.FlexBox(tilt,rotation,frequency,filtering,flex_wrap="wrap"),
        pn.FlexBox(front,oblique,diagonal,largest,flex_wrap="wrap",align_items="center"),
        pn.FlexBox(*[pn.Column(pn.pane.Bokeh(p,sizing_mode="stretch_width"),sizing_mode="stretch_width",styles={"flex":"1 1 400px","min-width":"280px"}) for p in plots],flex_wrap="wrap",sizing_mode="stretch_width"),
        summary,pn.FlexBox(row_input,col_input,flex_wrap="wrap"),facts,
        pn.FlexBox(pn.Column(texture_view,pn.pane.Bokeh(source_plot,sizing_mode="stretch_width"),sizing_mode="stretch_width",styles={"flex":"1 1 390px","min-width":"280px"}),
                   pn.Column(tap_details,sizing_mode="stretch_width",styles={"flex":"1 1 360px","min-width":"280px"}),flex_wrap="wrap",sizing_mode="stretch_width"),
        pn.pane.Markdown("**先做反例**：正面时两图一致；倾斜后错误 UV 才暴露。切换对角线，正确映射应基本不变，错误映射随拆面方式扭曲。最后提高格子数：双线性仍可能闪烁或产生摩尔纹，这将引出下一章的采样与过滤。"),
        sizing_mode="stretch_width")
