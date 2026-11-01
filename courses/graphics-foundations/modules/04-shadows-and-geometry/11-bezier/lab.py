"""曲线实验的界面装配。核心数学在 core.py；JS 只做拖动短预览。"""
import numpy as np
import panel as pn
from bokeh.events import DocumentReady
from bokeh.models import Arrow, ColumnDataSource, CustomJS, Div, LabelSet, PointDrawTool, Slider, VeeHead
from bokeh.plotting import figure
from .core import arc_length_parameters, bernstein, de_casteljau, derivative, evaluate, split


COLORS = ["#bd594d", "#3d8964", "#507db0", "#956da7"]
PRESETS = {
    "拱形 · 手算": [[0, 0], [0, 2], [3, 2], [3, 0]],
    "直线也会不匀速": [[0, 0], [.05, 0], [.1, 0], [3, 0]],
    "尖点 · 零导数": [[1, -1], [-1/3, 1], [-1/3, -1], [1, 1]],
    "四点重合": [[1, 1]]*4,
}


def convex_hull(points):
    """四个控制点的小凸包，仅用于解释图；不依赖额外几何库。"""
    vertices = sorted(set(map(tuple, points)))
    if len(vertices) <= 1:
        return np.array(vertices)
    cross = lambda a,b,c: (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower, upper = [], []
    for chain, sequence in [(lower, vertices), (upper, vertices[::-1])]:
        for point in sequence:
            while len(chain) >= 2 and cross(chain[-2], chain[-1], point) <= 0:
                chain.pop()
            chain.append(point)
    return np.array(lower[:-1]+upper[:-1])


def build():
    def point_data(values):
        values = np.asarray(values)
        return dict(x=values[:,0].tolist(), y=values[:,1].tolist(), label=[f"P{i}" for i in range(4)], color=COLORS)
    parameter = Slider(title="参数 t", start=0, end=1, value=.5, step=.005, sizing_mode="stretch_width", name="bezier_t")
    control = ColumnDataSource(point_data(PRESETS["拱形 · 手算"]), name="bezier_control")
    curve = ColumnDataSource(dict(x=[], y=[]))
    level1, level2, current = [ColumnDataSource(dict(x=[], y=[])) for _ in range(3)]
    hull = ColumnDataSource(dict(x=[], y=[]))
    regular, arc = [ColumnDataSource(dict(x=[], y=[])) for _ in range(2)]
    committed = ColumnDataSource(dict(x=[control.data['x']], y=[control.data['y']], spacing=[False]))
    viewport = ColumnDataSource(dict(x=[1.5], y=[.7], span=[4.5]))
    preview_text = Div(text="", sizing_mode="stretch_width", name="bezier_preview")
    verified = pn.pane.HTML(sizing_mode="stretch_width", name="bezier_verified")
    spacing = pn.widgets.Checkbox(name="比较 11 个等 t 圆点与近似等弧长菱形", value=False)
    selected = pn.widgets.Select(name="控制点", options=[f"P{i}" for i in range(4)], value="P1", width=95)
    x_input, y_input = pn.widgets.FloatInput(name="x", value=0., step=.1, width=110), pn.widgets.FloatInput(name="y", value=2., step=.1, width=110)
    play = pn.widgets.Toggle(name="播放约 6 秒", value=False, width=150, height=38)
    motion = pn.widgets.Select(name="动画推进方式", options=["参数 t 匀速", "近似弧长匀速"], value="参数 t 匀速", width=190)
    plot = figure(height=480, sizing_mode="stretch_width", x_range=(-.75,3.75), y_range=(-1.55,2.95), tools="", toolbar_location=None,
                  min_border=30, background_fill_color="#fbfcf8", border_fill_color="#fbfcf8", outline_line_color=None, name="bezier_canvas")
    plot.axis.major_label_text_font_size = "14px"
    plot.axis.axis_line_color = "#b6c4b2"
    plot.grid.grid_line_color = "#e1e8dd"
    hull_view = plot.patch('x','y',source=hull,fill_color="#668c73",fill_alpha=.08,line_color="#a6b59d",line_dash="dotted")
    plot.line('x','y',source=control,line_color="#97a38f",line_dash="dashed",line_width=1.5)
    plot.line('x','y',source=curve,line_color="#27664e",line_width=3)
    plot.line('x','y',source=level1,line_color="#c18d44",line_width=2)
    plot.scatter('x','y',source=level1,size=9,fill_color="#c18d44",line_color="white")
    plot.line('x','y',source=level2,line_color="#5b86b1",line_width=2.5)
    plot.scatter('x','y',source=level2,size=11,fill_color="#5b86b1",line_color="white")
    regular_view = plot.scatter('x','y',source=regular,size=9,fill_color="#27664e",line_color="white",visible=False)
    arc_view = plot.scatter('x','y',source=arc,size=12,marker="diamond",fill_alpha=0,line_color="#b57831",line_width=2,visible=False)
    plot.scatter('x','y',source=current,size=17,fill_color="#243e2f",line_color="white",line_width=2.5)
    tangent = Arrow(end=VeeHead(size=13,fill_color="#243e2f",line_color="#243e2f"),line_color="#243e2f",line_width=2.5)
    plot.add_layout(tangent)
    handles = plot.scatter('x','y',source=control,size=17,fill_color='color',line_color="white",line_width=2.5,nonselection_alpha=1,selection_fill_color='color')
    plot.add_layout(LabelSet(x='x',y='y',source=control,text='label',x_offset=10,y_offset=8,text_color='color',text_font_size="14px"))
    draw = PointDrawTool(renderers=[handles],add=False,drag=True)
    plot.add_tools(draw)
    plot.toolbar.active_drag = draw
    sample_t = np.linspace(0,1,201)
    basis = bernstein(sample_t)
    basis_plot = figure(height=265,sizing_mode="stretch_width",x_range=(0,1),y_range=(-.03,1.03),tools="",toolbar_location=None,
                        background_fill_color="#fbfcf8",border_fill_color="#fbfcf8",name="bezier_basis")
    for i,color in enumerate(COLORS):
        basis_plot.line(sample_t,basis[:,i],line_color=color,line_width=2,legend_label=f"b{i}")
    weights_marker = ColumnDataSource(dict(x=[.5]*4,y=bernstein(.5),color=COLORS))
    basis_plot.scatter('x','y',source=weights_marker,fill_color='color',line_color="white",size=10)
    basis_plot.legend.label_text_font_size = "14px"
    basis_plot.legend.location = "top_center"
    basis_plot.legend.orientation = "horizontal"
    basis_plot.legend.background_fill_alpha = .75
    basis_plot.legend.glyph_width = 12
    basis_plot.legend.spacing = 6
    basis_plot.axis.major_label_text_font_size = "14px"
    basis_plot.xaxis.axis_label = "参数 t"
    basis_plot.yaxis.axis_label = "Bernstein 权重"
    # 即时预览明确只更新当前曲线/插值层；凸包和弧长只在 Python 核对后显示。
    preview = CustomJS(args=dict(control=control,parameter=parameter,curve=curve,level1=level1,level2=level2,current=current,
                                 tangent=tangent,weights=weights_marker,text=preview_text,committed=committed,hull_view=hull_view,
                                 regular_view=regular_view,arc_view=arc_view),code="""
const d=control.data,t=parameter.value;
if(d.x.length!==4 || d.y.length!==4 || !d.x.every(Number.isFinite) || !d.y.every(Number.isFinite)) return;
const p=d.x.map((x,i)=>[x,d.y[i]]),levels=[p];
for(let k=0;k<3;k++){const a=levels.at(-1);levels.push(a.slice(0,-1).map((v,i)=>v.map((c,j)=>(1-t)*c+t*a[i+1][j])));}
const set=(source,a)=>source.data={x:a.map(p=>p[0]),y:a.map(p=>p[1])};
set(level1,levels[1]);set(level2,levels[2]);set(current,levels[3]);
const b=u=>[(1-u)**3,3*u*(1-u)**2,3*u*u*(1-u),u**3];
const value=u=>{const w=b(u);return [0,1].map(j=>w.reduce((v,w,i)=>v+w*p[i][j],0));};
set(curve,Array.from({length:201},(_,i)=>value(i/200)));
const w=b(t),c=levels[3][0],v=levels[2][1].map((x,j)=>3*(x-levels[2][0][j])),speed=Math.hypot(...v);
weights.data={...weights.data,x:[t,t,t,t],y:w};
tangent.visible=speed>1e-10;tangent.setv({x_start:c[0],y_start:c[1],x_end:c[0]+(speed > 1e-10 ? .55*v[0]/speed : 0),y_end:c[1]+(speed > 1e-10 ? .55*v[1]/speed : 0)});
const checked=d.x.every((x,i)=>x===committed.data.x[0][i] && d.y[i]===committed.data.y[0][i]);
hull_view.visible=checked;regular_view.visible=arc_view.visible=checked&&committed.data.spacing[0];
const f=v=>(Math.abs(v)<.0005?0:v).toFixed(3),pair=p=>`(${f(p[0])}, ${f(p[1])})`;
text.text=`<div style="font:14px/1.85 system-ui;color:#314637;overflow-wrap:anywhere"><b>t = ${f(t)} · ${checked?'当前构造':'拖动预览'}</b><br>
第一层 Q：${levels[1].map(pair).join('，')}<br>第二层 R：${levels[2].map(pair).join('，')}<br><b>C(t) = ${pair(c)}</b><br>
权重 (${w.map(f).join(', ')})，总和 = ${f(w.reduce((a,b)=>a+b,0))}<br>C′(t) = ${pair(v)}，速率 |C′| = ${f(speed)}<br>
${speed>1e-10?'箭头仅表示切线方向，显示长度固定。':'导数为零或低于 1e-10：不做单位化，不画伪切线。'}<br>
${checked?'':'松手后 Python 核对，并恢复凸包与弧长对照。'}</div>`;
""")
    control.js_on_change('change',preview)
    parameter.js_on_change('value',preview)
    committed.js_on_change('data',preview)
    equal_units = CustomJS(args=dict(plot=plot,viewport=viewport),code="""
const w=plot.inner_width,h=plot.inner_height,d=viewport.data;
if(w>0&&h>0){const xs=d.span[0]*Math.max(1,w/h),ys=d.span[0]*Math.max(1,h/w);plot.x_range.setv({start:d.x[0]-xs/2,end:d.x[0]+xs/2});plot.y_range.setv({start:d.y[0]-ys/2,end:d.y[0]+ys/2});}
""")
    for attribute in ['inner_width','inner_height']:
        plot.js_on_change(attribute,equal_units)
    viewport.js_on_change('data',equal_units)
    if pn.state.curdoc is not None:
        pn.state.curdoc.js_on_event(DocumentReady,preview)
        pn.state.curdoc.js_on_event(DocumentReady,equal_units)
        pn.state.curdoc.js_on_event(DocumentReady,CustomJS(args=dict(selection=control.selected),code="selection.properties.indices.change.connect(()=>{if(selection.indices.length>1) selection.indices=selection.indices.slice(-1);});"))
    updating = False
    last_good = point_data(PRESETS['拱形 · 手算'])

    def refresh(event=None):
        nonlocal updating,last_good
        if updating:
            return
        p = np.column_stack([control.data['x'],control.data['y']])
        if p.shape!=(4,2) or not np.isfinite(p).all() or np.max(np.abs(p))>1e4:
            control.data=last_good.copy()
            return
        last_good=point_data(p)
        updating=True
        index=int(selected.value[-1])
        x_input.value,y_input.value=map(float,p[index])
        updating=False
        t=parameter.value
        levels=de_casteljau(p,t)
        for source,values in [(curve,evaluate(p,sample_t)),(level1,levels[1]),(level2,levels[2]),(current,levels[3]),(hull,convex_hull(p))]:
            source.data=dict(x=values[:,0],y=values[:,1])
        c=levels[-1][0]
        v=derivative(p,t)
        speed=np.linalg.norm(v)
        tangent.visible=bool(speed>1e-10)
        tangent.x_start,tangent.y_start=c
        tangent.x_end,tangent.y_end=c+.55*v/speed if speed>1e-10 else c
        weights_marker.data=dict(x=[t]*4,y=bernstein(t),color=COLORS)
        fractions=np.linspace(0,1,11)
        uniform=evaluate(p,fractions)
        regular.data=dict(x=uniform[:,0],y=uniform[:,1])
        try:
            arc_t=arc_length_parameters(p,fractions)
            equal=evaluate(p,arc_t)
            arc.data=dict(x=equal[:,0],y=equal[:,1])
            arc_note="菱形来自 800 段折线长度查表，是近似等弧长。"
        except ValueError:
            arc.data=dict(x=[],y=[])
            arc_note="曲线长度为零，近似弧长反函数未定义。"
        regular_view.visible=arc_view.visible=spacing.value
        left,right=split(p,t)
        error=np.max(np.abs(c-evaluate(p,t)))
        fmt=lambda values:'('+', '.join(f'{v:.3f}' for v in values)+')'
        verified.object=f'<p style="font:14px/1.85 system-ui;color:#65745f">Python 核对：C = {fmt(c)}；de Casteljau / Bernstein 差 {error:.1e}。<br>分割连接点：左段终点 {fmt(left[-1])} = 右段起点 {fmt(right[0])}。<br>{arc_note}</p>'
        committed.data=dict(x=[p[:,0].tolist()],y=[p[:,1].tolist()],spacing=[spacing.value])

    def edit_point(event):
        if updating or x_input.value is None or y_input.value is None:
            return
        p=np.column_stack([control.data['x'],control.data['y']])
        p[int(selected.value[-1])]=[x_input.value,y_input.value]
        control.data=point_data(p)

    control.on_change('data',lambda attr,old,new:refresh())
    control.selected.on_change('indices',lambda attr,old,new:setattr(selected,'value',f'P{new[-1]}') if new else None)
    parameter.on_change('value',lambda attr,old,new:refresh())
    selected.param.watch(refresh,'value')
    x_input.param.watch(edit_point,'value')
    y_input.param.watch(edit_point,'value')
    spacing.param.watch(refresh,'value')

    def set_preset(name):
        play.value=False
        control.data=point_data(PRESETS[name])
        parameter.value=.5
        spacing.value=name=='直线也会不匀速'
        refresh()
    buttons=[]
    for name in PRESETS:
        button=pn.widgets.Button(name=name,width=160,height=38)
        button.on_click(lambda event,name=name:set_preset(name))
        buttons.append(button)
    fit=pn.widgets.Button(name="适配视野",width=110,height=38)
    def fit_view(event):
        p=np.column_stack([control.data['x'],control.data['y']])
        center=(p.min(axis=0)+p.max(axis=0))/2
        viewport.data=dict(x=[center[0]],y=[center[1]],span=[max(3.,np.ptp(p,axis=0).max()*1.5)])
    fit.on_click(fit_view)
    frame=0
    def tick():
        nonlocal frame
        frame+=1
        fraction=min(frame/60,1)
        p=np.column_stack([control.data['x'],control.data['y']])
        try:
            parameter.value=float(arc_length_parameters(p,fraction)) if motion.value=='近似弧长匀速' else fraction
        except ValueError:
            play.value=False
        if frame>=60:
            play.value=False
    periodic=pn.state.add_periodic_callback(tick,period=100,start=False)
    def toggle(event):
        nonlocal frame
        if event.new:
            frame=0
            parameter.value=0
            play.name="暂停动画"
            periodic.start()
        else:
            play.name="播放约 6 秒"
            periodic.stop()
    play.param.watch(toggle,'value')
    if pn.state.curdoc is not None:
        pn.state.on_session_destroyed(lambda context:periodic.stop())
    refresh()
    layout=pn.Column(pn.FlexBox(*buttons,fit,flex_wrap="wrap"),
                     pn.FlexBox(play,motion,spacing,flex_wrap="wrap"),pn.pane.Bokeh(parameter,sizing_mode="stretch_width"),
                     pn.pane.Markdown("**拖动 P0–P3** · 橙色：第一层　蓝色：第二层　深色：C(t) · 浅色区域：控制点凸包"),
                     pn.FlexBox(pn.Column(pn.pane.Bokeh(plot,sizing_mode="stretch_width"),sizing_mode="stretch_width",styles={"flex":"2 1 580px","min-width":"270px"}),
                                pn.Column(pn.pane.Bokeh(preview_text,sizing_mode="stretch_width"),pn.FlexBox(selected,x_input,y_input,flex_wrap="wrap"),verified,sizing_mode="stretch_width",styles={"flex":"1 1 340px","min-width":"260px","padding":"12px"}),
                                flex_wrap="wrap",align_items="flex-start",sizing_mode="stretch_width"),
                     pn.pane.Markdown("**同一参数的四个权重** · 控制点和权重曲线使用相同颜色；移动控制点改变位置，不改变这些基函数。"),
                     pn.pane.Bokeh(basis_plot,sizing_mode="stretch_width"),sizing_mode="stretch_width")
    layout.param.watch(lambda event:setattr(play,'value',False) if not event.new else None,'visible')
    return layout
