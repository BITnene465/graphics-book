"""同一椭球的网格、水平切片与参数域。观察变换和所有几何在 Python。"""
import numpy as np
import panel as pn
from bokeh.events import Tap
from bokeh.models import ColumnDataSource,CustomJS,FixedTicker
from bokeh.plotting import figure
from .core import (parametric,tangents,implicit,analytic_normal,make_mesh,face_geometry,
                   mesh_statistics,analytic_slice,mesh_slice,radial_mesh_point,project,silhouette,pick_surface)


def build():
    a=pn.widgets.FloatSlider(name="半轴 a · X",start=.5,end=2,step=.05,value=1.5,width=205)
    b=pn.widgets.FloatSlider(name="半轴 b · Y",start=.5,end=2,step=.05,value=1.,width=205)
    c=pn.widgets.FloatSlider(name="半轴 c · Z",start=.5,end=2,step=.05,value=.8,width=205)
    detail=pn.widgets.Select(name="纬向分段 · 经向为两倍",options=[4,8,12,20],value=8,width=210)
    longitude=pn.widgets.FloatSlider(name="采样经度 u（度）",start=0,end=360,step=1,value=40,width=260)
    polar=pn.widgets.FloatSlider(name="采样极角 v / 切片（度）",start=0,end=180,step=1,value=65,width=260)
    azimuth=pn.widgets.FloatSlider(name="观察方位角",start=0,end=360,step=1,value=35,width=230)
    elevation=pn.widgets.FloatSlider(name="观察仰角",start=-70,end=70,step=1,value=25,width=230)
    edges=pn.widgets.Checkbox(name="显示三角形边",value=True,width=175)
    sphere=pn.widgets.Button(name="单位球",width=100)
    ellipsoid=pn.widgets.Button(name="恢复椭球",width=120)
    mesh=ColumnDataSource(dict(xs=[],ys=[],color=[]),name="geometry_mesh")
    outline=ColumnDataSource(dict(x=[],y=[]));slice3d=ColumnDataSource(dict(x=[],y=[]))
    samples3d=ColumnDataSource(dict(x=[],y=[],color=[]),name="geometry_points")
    normals=ColumnDataSource(dict(xs=[],ys=[],color=[]),name="geometry_normals")
    analytic=ColumnDataSource(dict(x=[],y=[]),name="geometry_analytic_slice")
    discrete=ColumnDataSource(dict(xs=[],ys=[]),name="geometry_mesh_slice")
    slice_point=ColumnDataSource(dict(x=[],y=[]));uv_point=ColumnDataSource(dict(x=[],y=[]),name="geometry_uv")
    uv_samples=ColumnDataSource(dict(x=[],y=[]));uv_lines=ColumnDataSource(dict(xs=[],ys=[]))
    extent=ColumnDataSource(dict(radius=[1.5]))
    model=figure(title="① 显式网格 · 点击表面放置采样点",height=410,sizing_mode="stretch_width",
                 x_range=(-2,2),y_range=(-2,2),tools="",toolbar_location=None,background_fill_color="#fbfcf8",border_fill_color="#fbfcf8",outline_line_color=None,name="geometry_view")
    patches=model.patches("xs","ys",source=mesh,fill_color="color",line_color="#254d39",line_alpha=.35,line_width=.7)
    model.line("x","y",source=outline,line_color="#789c77",line_width=2,line_dash="dashed")
    model.line("x","y",source=slice3d,line_color="#d68b39",line_width=3)
    model.multi_line("xs","ys",source=normals,line_color="color",line_width=3)
    model.scatter("x","y",source=samples3d,color="color",size=10,line_color="white",line_width=2)
    section=figure(title="② 隐式切片 · 光滑椭圆与网格截线",height=410,sizing_mode="stretch_width",
                   x_range=(-2,2),y_range=(-2,2),tools="",toolbar_location=None,background_fill_color="#fbfcf8",border_fill_color="#fbfcf8",outline_line_color=None,name="geometry_slice")
    section.patch("x","y",source=analytic,fill_color="#dce9d7",fill_alpha=.5,line_color="#d68b39",line_width=3)
    section.multi_line("xs","ys",source=discrete,line_color="#294e38",line_width=2)
    section.scatter("x","y",source=slice_point,color="#bc5747",size=11,line_color="white",line_width=2)
    section.xaxis.axis_label,section.yaxis.axis_label="x","y"
    domain=figure(title="③ 参数域 · 点击改变 (u,v)，三图联动",height=285,sizing_mode="stretch_width",
                  x_range=(-6,366),y_range=(186,-6),tools="",toolbar_location=None,background_fill_color="#fbfcf8",border_fill_color="#fbfcf8",outline_line_color=None,name="geometry_parameter")
    domain.multi_line("xs","ys",source=uv_lines,line_color="#cbd5c5",line_width=1)
    domain.scatter("x","y",source=uv_samples,color="#527a56",size=4)
    domain.line([0,0],[0,180],color="#ba6554",line_width=2,line_dash="dashed")
    domain.line([360,360],[0,180],color="#ba6554",line_width=2,line_dash="dashed")
    domain.scatter("x","y",source=uv_point,color="#bc5747",size=13,line_color="white",line_width=2)
    domain.xaxis.axis_label,domain.yaxis.axis_label="经度 u（度）· 两端接合","极角 v（度）· 上北下南"
    domain.xaxis.ticker=FixedTicker(ticks=[0,90,180,270,360]);domain.yaxis.ticker=FixedTicker(ticks=[0,45,90,135,180])
    for plot in (model,section,domain):
        plot.title.text_font_size="15px";plot.title.text_font_style="normal"
        plot.axis.major_label_text_font_size="14px";plot.axis.axis_label_text_font_size="14px"
        plot.axis.axis_label_text_font_style="normal";plot.grid.visible=False
    model.axis.visible=False
    for plot in (model,section):
        equal=CustomJS(args=dict(plot=plot,extent=extent),code="""
const w=plot.inner_width,h=plot.inner_height,r=extent.data.radius[0]*1.4;
if(w>0&&h>0){const sx=r*Math.max(1,w/h),sy=r*Math.max(1,h/w);
plot.x_range.setv({start:-sx,end:sx});plot.y_range.setv({start:-sy,end:sy});}
""")
        plot.js_on_change("inner_width",equal);plot.js_on_change("inner_height",equal);extent.js_on_change("data",equal)
    stats=pn.pane.Markdown(sizing_mode="stretch_width",styles={"font-size":"15px"})
    facts=pn.pane.Markdown(sizing_mode="stretch_width",styles={"font-size":"15px","line-height":"1.7"})
    state=dict(updating=False,vertices=None,faces=None)

    def color_hex(linear):
        rgb=np.clip(linear,0,1);rgb=np.where(rgb<=.0031308,12.92*rgb,1.055*rgb**(1/2.4)-.055)
        return ["#"+"".join(f"{n:02x}" for n in pixel) for pixel in np.rint(rgb*255).astype(int)]

    def refresh(event=None):
        if state["updating"]:return
        axes=np.array([a.value,b.value,c.value]);lat=detail.value;lon=2*lat
        vertices,faces=make_mesh(axes,lat,lon);state.update(vertices=vertices,faces=faces)
        centers,face_normals,_=face_geometry(vertices,faces)
        xy,depth=project(vertices,azimuth.value,elevation.value)
        order=np.argsort(depth[faces].mean(axis=1))
        light=np.array([-.4,-.5,1.]);light/=np.linalg.norm(light)
        brightness=.24+.76*np.maximum(0,face_normals@light)
        colors=color_hex(brightness[:,None]*np.array([.13,.47,.28]))
        mesh.data=dict(xs=[xy[f,0] for f in faces[order]],ys=[xy[f,1] for f in faces[order]],color=[colors[i] for i in order])
        smooth,_=project(silhouette(axes,azimuth.value,elevation.value),azimuth.value,elevation.value)
        outline.data=dict(x=smooth[:,0],y=smooth[:,1])
        u,v=np.deg2rad([longitude.value,polar.value]);p=parametric(u,v,axes)
        q,face,weights=radial_mesh_point(p,vertices,faces);normal=analytic_normal(p,axes);flat=face_normals[face]
        projected,_=project(np.array([p,q]),azimuth.value,elevation.value)
        samples3d.data=dict(x=projected[:,0],y=projected[:,1],color=["#bb5647","#416ca0"])
        lines=[]
        for origin,direction in [(p,normal),(q,flat)]:
            line,_=project(np.array([origin,origin+.35*axes.max()*direction]),azimuth.value,elevation.value);lines.append(line)
        normals.data=dict(xs=[line[:,0] for line in lines],ys=[line[:,1] for line in lines],color=["#38a565","#416ca0"])
        curve=analytic_slice(float(p[2]),axes)
        analytic.data=dict(x=curve[:,0],y=curve[:,1]);section.title.text=f"② 隐式切片 · z = {p[2]:.4f}"
        projected,_=project(curve,azimuth.value,elevation.value);slice3d.data=dict(x=projected[:,0],y=projected[:,1])
        segments=mesh_slice(vertices,faces,float(p[2]))
        discrete.data=dict(xs=[line[:,0] for line in segments],ys=[line[:,1] for line in segments])
        slice_point.data=dict(x=[p[0]],y=[p[1]]);uv_point.data=dict(x=[longitude.value],y=[polar.value])
        su,sv=np.meshgrid(np.arange(lon)*360/lon,np.arange(1,lat)*180/lat)
        uv_samples.data=dict(x=su.ravel(),y=sv.ravel())
        uv_lines.data=dict(xs=[[x,x] for x in np.arange(lon+1)*360/lon]+[[0,360] for _ in range(lat+1)],
                           ys=[[0,180] for _ in range(lon+1)]+[[y,y] for y in np.arange(lat+1)*180/lat])
        extent.data=dict(radius=[axes.max()])
        s=mesh_statistics(vertices,faces,axes)
        stats.object=f"**顶点 {s['vertices']} · 边 {s['edges']} · 三角形 {s['faces']} · V−E+F={s['euler']}**。每条边恰由两面使用：{'是' if s['closed_edges'] else '否'}。网格体积 {s['volume']:.5f}，解析体积 {s['exact_volume']:.5f}，相对误差 **{100*s['relative_volume_error']:.2f}%**；面心方向的最大采样径向误差 **{s['max_radial_sample_error']:.5f}**。"
        du,dv=tangents(u,v,axes);singular=np.linalg.norm(np.cross(du,dv))<1e-12
        angle=np.rad2deg(np.arccos(np.clip(normal@flat,-1,1)))
        fmt=lambda vec:"("+", ".join(f"{x:.5f}" for x in vec)+")"
        facts.object=f"""**同一个解析采样点 P={fmt(p)}** · `F(P)={implicit(p,axes):.2e}`

绿色解析法线：`{fmt(normal)}`  
蓝色网格面法线：`{fmt(flat)}` · 夹角 **{angle:.2f}°**

从中心沿 P 方向命中第 **{face}** 个三角形，网格点 Q={fmt(q)}。径向间隙 **{np.linalg.norm(p-q):.5f}**。P 在光滑表面，Q 在平面三角形上；它们不是同一个几何点。

`||∂p/∂u × ∂p/∂v|| = {np.linalg.norm(np.cross(du,dv)):.6f}`。{'当前位于参数极点：经度方向塌缩，但椭球表面的梯度法线仍然存在。' if singular else '参数映射在这里正则，两条偏导给出两个切向方向。'}

淡绿虚线是解析轮廓，橙线是完整解析切片。网格用逐面法线着色，便于观察分段；切片与法线作为教学叠加层完整显示。点击左图表面、右图切片方向或下方参数域，都可以移动 P。"""

    def set_angles(u,v):
        state["updating"]=True;longitude.value=float(np.clip(u,0,360));polar.value=float(np.clip(v,0,180));state["updating"]=False
        refresh()

    def pick_model(event):
        if event.x is None or event.y is None:return
        axes=np.array([a.value,b.value,c.value]);point=pick_surface(event.x,event.y,axes,azimuth.value,elevation.value)
        if point is not None:
            u=np.rad2deg(np.arctan2(point[1]/axes[1],point[0]/axes[0]))%360
            v=np.rad2deg(np.arccos(np.clip(point[2]/axes[2],-1,1)));set_angles(u,v)

    def pick_slice(event):
        if event.x is not None and event.y is not None and np.hypot(event.x,event.y)>1e-10:
            u=np.rad2deg(np.arctan2(event.y/b.value,event.x/a.value))%360;set_angles(u,polar.value)

    model.on_event(Tap,pick_model);section.on_event(Tap,pick_slice)
    domain.on_event(Tap,lambda event:set_angles(event.x,event.y) if event.x is not None and event.y is not None else None)
    for control in (a,b,c,detail,longitude,polar,azimuth,elevation):control.param.watch(refresh,"value")
    edges.param.watch(lambda event:setattr(patches.glyph,"line_alpha",.35 if event.new else 0),"value")
    def preset(values):
        state["updating"]=True;a.value,b.value,c.value=values;state["updating"]=False;refresh()
    sphere.on_click(lambda event:preset((1.,1.,1.)));ellipsoid.on_click(lambda event:preset((1.5,1.,.8)))
    refresh()
    return pn.Column(
        pn.FlexBox(a,b,c,detail,flex_wrap="wrap"),pn.FlexBox(sphere,ellipsoid,edges,flex_wrap="wrap",align_items="center"),
        pn.FlexBox(longitude,polar,azimuth,elevation,flex_wrap="wrap"),
        pn.FlexBox(*[pn.Column(pn.pane.Bokeh(p,sizing_mode="stretch_width"),sizing_mode="stretch_width",styles={"flex":"1 1 420px","min-width":"280px"}) for p in (model,section)],flex_wrap="wrap",sizing_mode="stretch_width"),
        stats,facts,pn.pane.Bokeh(domain,sizing_mode="stretch_width"),
        pn.pane.Markdown("**做受控比较**：保持半轴和采样点不变，把纬向分段从 4 提高到 20。比较轮廓、切片、体积误差与法线夹角。再把 v 调到 0°：参数域顶边上所有 u 都映到同一个北极；网格只保存一个北极索引。"),
        sizing_mode="stretch_width")
