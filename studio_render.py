"""书中内嵌演示的 Python 渲染桥：章节数学仍在各自 core.py 中。

这里仅负责参数、组装小场景、PNG 编码与可检查的结果。坐标约定：
世界 y 向上；PNG 数组第 0 行在顶部；geometry.positions 是展开的世界三角形。
所有正式像素均由 Python/NumPy 生成。浏览器可用同一份几何做即时空间预览。
"""
from __future__ import annotations

import base64
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
import struct
import time
import zlib

import numpy as np

ROOT = Path(__file__).resolve().parent
MODULES = ROOT / "courses/graphics-foundations/modules"
PATHS = [
    "01-images-and-space/01-pixels", "01-images-and-space/02-transforms",
    "01-images-and-space/03-camera", "02-rasterization/04-barycentric",
    "02-rasterization/05-depth", "03-surface-and-sampling/06-lighting",
    "03-surface-and-sampling/07-textures", "03-surface-and-sampling/08-sampling",
    "04-shadows-and-geometry/09-shadows", "04-shadows-and-geometry/10-geometry",
    "04-shadows-and-geometry/11-bezier", "05-raytracing/12-rays",
    "03-surface-and-sampling/13-pipeline",
    "03-surface-and-sampling/14-texture-functions",
    "04-shadows-and-geometry/15-surfaces",
]
TITLES = ["像素与颜色", "变换与坐标", "相机与投影", "三角形与重心坐标", "深度与可见性", "法线与光照",
          "纹理与透视插值", "采样与抗锯齿", "阴影映射", "几何的三种表达", "曲线与样条", "光线追踪", "一条完整的光栅管线", "纹理作为函数", "从曲线到曲面"]
PARTS = ["图像与空间"]*3 + ["光栅化"]*2 + ["表面与着色"]*2 + ["光栅化"] + ["表面与着色"] + ["几何"]*2 + ["光线追踪", "表面与着色", "表面与着色", "几何"]
# URL 与文件编号稳定，阅读顺序按先修关系安排。
READING_ORDER = ("01", "02", "03", "04", "08", "05", "06", "07", "14", "09", "13", "10", "11", "15", "12")
SUMMARIES = ["从连续场景到离散像素，亲手检查采样与颜色。", "拖动点与变换工具，理解矩阵如何改变空间。",
             "在三维空间中摆放相机，检查投影与裁剪。", "拖动三个顶点，观察覆盖、权重与颜色插值。",
             "让两个斜面相交，逐像素决定谁挡住谁。", "移动光源，比较正确法线与错误法线的光照。",
             "旋转纹理平面，理解透视校正与纹素过滤。", "在连续场景中移动边缘，观察采样和混叠。",
             "从光源和相机各渲染一次，检查阴影比较。", "旋转椭球，连接隐式曲面、参数化与三角网格。",
             "从插值到分段样条，检查连续性、局部控制与有理权重。", "沿像素发出射线，跟踪求交、阴影与反射。", "把变换、裁剪、覆盖、插值、着色和深度连接为可追溯的一帧。", "按方向查询环境，按位置生成纹理；把坐标、函数和成像连接起来。", "编辑三维控制网，沿两个参数求值，用切向与曲率检查接缝。"]


def _number(key, label, default, minimum, maximum, step=1):
    return dict(key=key, label=label, type="number", default=default, min=minimum, max=maximum, step=step)


def _choice(key, label, default, options):
    return dict(key=key, label=label, type="choice", default=default,
                options=[dict(label=str(label), value=value) for label, value in options])


# 底色均为线性 RGB；显示输出在 _png 中只编码一次 sRGB。
RAY_PALETTE = {"blue": [.16,.34,.43], "copper": [.65,.20,.08],
               "jade": [.06,.5,.28], "ivory": [.78,.76,.64]}
SHAPE_LABELS = {"cube": "立方体", "sphere": "球面网格", "tetrahedron": "四面体"}


def catalog():
    """普通数据结构；前端据此生成滑杆、分段按钮与参数检查面板。"""
    n, c = _number, _choice
    controls = [
        [c("pattern", "连续场景", "disk", [("圆", "disk"), ("梯度", "gradient"), ("四角", "corners")]), n("samples", "每轴采样", 2, 1, 8)],
        [n("angle", "旋转角度", 25, -180, 180), n("tx", "平移 X", .6, -5, 5, .01), n("ty", "平移 Y", .4, -5, 5, .01), n("sx", "缩放 X", 1.2, -3, 3, .01), n("sy", "缩放 Y", .8, -3, 3, .01), n("shear", "错切", 0, -2, 2, .01), c("order", "变换顺序", "TRS", [(x, x) for x in ("TRS", "RTS", "SRT", "TSR")])],
        [n("yaw", "相机方位", 35, -180, 180, .1), n("pitch", "相机俯仰", 20, -85, 85, .1), n("distance", "相机距离", 6, 1, 20, .1), n("fov", "垂直视野", 48, 15, 110), n("near", "近平面", .1, .01, 3, .01), n("far", "远平面", 40, 4, 100), c("projection", "投影", "perspective", [("透视", "perspective"), ("正交", "orthographic")])],
        [c("mode", "显示通道", "color", [("颜色插值", "color"), ("重心权重", "weights"), ("像素覆盖", "coverage")])],
        [c("scene", "实验场景", "crossing", [("相交斜面", "crossing"), ("穿越近平面", "near"), ("同深度", "equal")]), c("bits", "深度精度", 0, [("Float64", 0), ("8-bit", 8), ("16-bit", 16), ("24-bit", 24)]), c("order", "提交顺序", "AB", [("A → B", "AB"), ("B → A", "BA")]), n("slope", "深度起伏", 2, 0, 3, .05)],
        [n("sx", "半轴 X", 1.3, .25, 2.5, .01), n("sy", "半轴 Y", .85, .25, 2.5, .01), n("sz", "半轴 Z", 1, .25, 2.5, .01), n("light_x", "光源 X", -3, -10, 10, .1), n("light_y", "光源 Y", 4, -10, 10, .1), n("light_z", "光源 Z", 5, 3, 12, .1), n("power", "光强", 40, 0, 200, 1), n("exponent", "高光指数", 48, 1, 512), n("ks", "高光系数", .35, 0, 1, .01), n("ambient", "环境常量", .06, 0, .5, .01)],
        [n("tilt", "平面倾角", 55, 0, 75), n("rotation", "平面旋转", 0, -180, 180), n("frequency", "棋盘格数", 8, 2, 64), c("filter", "纹理过滤", "bilinear", [("最近邻", "nearest"), ("双线性", "bilinear")])],
        [c("samples", "每像素样本", 16, [(str(x), x) for x in (1, 4, 16, 64)]), n("angle", "边缘角度", 35, -180, 180, .1), n("phase", "亚像素位移", 0, -8, 8, .01), c("scene", "连续场景", "line", [("细线", "line"), ("斜边", "edge"), ("棋盘", "checker")]), c("strategy", "采样布局", "grid", [("规则", "grid"), ("分层抖动", "jitter")]), n("width", "线宽 / px", .8, .05, 8, .05), n("cell", "格宽 / px", 3, .2, 12, .1)],
        [n("light_x", "光源 X", -3, -10, 10, .1), n("light_y", "光源高度", 6, 1, 12, .1), n("light_z", "光源 Z", -2, -10, 10, .1), n("bias", "深度偏移", .004, 0, .05, .0001), c("pcf", "阴影过滤", 1, [("硬阴影", 0), ("3 × 3 PCF", 1), ("5 × 5 PCF", 2)]), c("shadow_size", "阴影图分辨率", 512, [(str(x), x) for x in (64, 128, 256, 512, 1024, 2048)])],
        [n("a", "半轴 a", 1.4, .2, 3, .05), n("b", "半轴 b", 1, .2, 3, .05), n("c", "半轴 c", .75, .2, 3, .05), n("detail", "纬向分段", 16, 3, 48), n("u", "参数 u / °", 45, 0, 360), n("v", "参数 v / °", 65, 0, 180)],
        [n("t", "曲线参数 t", .4, 0, 1, .001)],
        [n("bounces", "反射次数", 2, 0, 3), n("epsilon", "起点偏移", .0001, 0, .05, .0001), n("light_x", "光源 X", -3, -10, 10, .1), n("light_y", "光源高度", 5, 2, 12, .1), n("light_z", "光源 Z", 4, -10, 10, .1)],
        [n("divisions", "网格分段", 8, 1, 24), n("wave", "顶点波幅", .2, -.8, .8, .01),
         c("fragment", "片元程序", "checker", [("光照棋盘", "checker"), ("纯色光照", "lit"), ("UV", "uv"), ("法线", "normal")]),
         c("depth_test", "深度测试", True, [("开", True), ("关", False)]),
         c("early_depth", "提前深度测试", True, [("开", True), ("关", False)]),
         c("cull", "背面剔除", False, [("关闭", False), ("开启", True)]),
         c("reverse", "提交顺序", False, [("前层先", False), ("后层先", True)]),
         n("near", "近平面", .1, .01, 6, .01),n("far", "远平面",40,8,100,1),
         n("light_x", "光源 X",-3,-10,10,.1),n("light_y", "光源 Y",4,-10,10,.1),n("light_z", "光源 Z",5,-10,10,.1)],
        [c("environment", "环境内容", "studio", [("柔光空间", "studio"), ("方向编码", "direction")]),
         c("mapping", "环境查询", "latlong", [("经纬图", "latlong"), ("立方体图", "cube"), ("连续函数", "analytic")]),
         c("map_size", "环境图尺度 N", 128, [(str(x), x) for x in (16, 32, 64, 128, 256, 512)]),
         n("env_angle", "环境方位 / °", 0, -180, 180, .1),
         n("radius", "镜面球半径", 1, .2, 2, .01)],
    ]
    controls.append([
        c("mode", "曲面数量", "single", [("单块", "single"), ("拼接", "pair")]),
        c("continuity", "接缝约束", "C0", [("自由", "free"), ("C0", "C0"), ("G1", "G1"), ("C1", "C1"), ("C2", "C2")]),
        n("left_span", "左侧参数跨度", 1, .5, 2, .05),
        n("right_span", "右侧参数跨度", 1, .5, 2, .05),
        n("tangent_scale", "G1 局部横向倍率", 1.5, .1, 3, .05),
        n("divisions", "每方向网格分段", 20, 2, 64),
        c("parameter_lines", "等参线", True, [("显示", True), ("隐藏", False)]),
        n("curvature_limit", "曲率色标 ±H", 1, .1, 5, .1),
        n("shininess", "高光指数", 96, 1, 512),
        n("light_x", "光源 X", -2, -10, 10, .1),
        n("light_y", "光源 Y", 5, -10, 10, .1),
        n("light_z", "光源 Z", 3, -10, 10, .1),
    ])
    extra = {"01": dict(point=[.5, .5]), "02": dict(point=[1, .5]), "04": dict(vertices=[[-1.5, -1], [1.6, -.7], [-.2, 1.6]], point=[.1, .1]), "08": dict(point=[0, 0]), "11": dict(points=[[-2, -1], [-1, 2], [1, 2], [2, -1]])}
    extra["15"] = dict(_core("15", "render.py").control_defaults(), camera_target=[-1.5,0,0], camera_rotation=[0,0,0])
    controls[5][:0] = [c("surface_model", "表面实验", "analytic", [("解析曲面法线", "analytic"), ("网格着色频率", "mesh")]),
                      n("mesh_latitude", "网格纬向分段", 8, 3, 32)]
    controls[6][-1] = c("filter", "纹理过滤", "bilinear", [("最近邻", "nearest"), ("双线性", "bilinear"), ("三线性", "trilinear"), ("各向异性", "anisotropic")])
    controls[6].extend([c("texture_size", "源纹理尺寸", 64, [(str(x),x) for x in (64,128,256,512,1024)]),
                        n("lod_bias", "LOD 偏移", 0, -2, 2, .05), c("max_anisotropy", "各向异性上限", 8, [(f"{x}×",x) for x in (1,2,4,8,16)])])
    extra.update({
        "03": dict(cube_a_position=[-.9,0,.5], cube_a_rotation=[0,0,0], cube_a_scale=[.6,.6,.6],
                   cube_b_position=[1.05,0,-1.1], cube_b_rotation=[0,0,0], cube_b_scale=[.6,.6,.6],
                   camera_target=[0,0,0], camera_rotation=[0,0,0]),
        "06": dict(surface_position=[0,0,0]),
        "07": dict(plane_position=[0,0,-2.8], plane_rotation=[0,0,0], plane_scale=[1,1,1]),
        "09": dict(pillar_position=[0,.8,0], pillar_rotation=[0,0,0], pillar_scale=[.55,.8,.55], light_target=[0,0,0]),
        "10": dict(surface_position=[0,0,0], surface_rotation=[0,0,0], camera_target=[0,0,0], camera_rotation=[0,0,0]),
        "12": dict(sphere_a_position=[-.95,.8,0], sphere_b_position=[1,.7,-.5], camera_target=[0,.65,0], camera_rotation=[0,0,0]),
        "13": dict(model_position=[0,0,0],model_rotation=[0,0,0],model_scale=[1,1,1],camera_target=[0,0,0],camera_rotation=[0,0,0]),
        "14": dict(sphere_position=[0,0,0],camera_target=[0,0,0],camera_rotation=[0,0,0]),
    })
    for chapter, eye, target, fov in (("10", [4,3,6], [0,0,0], 48), ("12", [4,2.5,6], [0,.65,0], 42), ("13",[3,2,5],[0,0,0],48), ("14",[3,1.4,4],[0,0,0],42), ("15",[2.5,3.5,5.5],[-1.5,0,0],42)):
        offset=np.asarray(eye)-target
        distance=float(np.linalg.norm(offset))
        controls[int(chapter)-1].extend([
            n("yaw","相机方位",float(np.rad2deg(np.arctan2(offset[0],offset[2]))),-180,180,.1),
            n("pitch","相机俯仰",float(np.rad2deg(np.arcsin(offset[1]/distance))),-85,85,.1),
            n("distance","相机距离",distance,1,30,.1), n("fov","垂直视野",fov,15,110,.1),
        ])
    for key in ("a", "b"):
        controls[2].append(c(f"cube_{key}_shape", f"物体 {key.upper()} 形状", "cube", [(label,value) for value,label in SHAPE_LABELS.items()]))
        controls[11].extend([
            c(f"sphere_{key}_color", f"球 {key.upper()} 线性底色", "blue" if key == "a" else "copper",
              [("蓝灰", "blue"), ("赤铜", "copper"), ("青绿", "jade"), ("象牙", "ivory")]),
            n(f"sphere_{key}_reflectivity", f"球 {key.upper()} 反射权重", .65 if key == "a" else .08, 0, .95, .01),
        ])
    controls[11].extend([n("sphere_a_radius","球 A 半径",.8,.15,2,.01),n("sphere_b_radius","球 B 半径",.7,.15,2,.01),
                         n("specular", "局部高光", 0, 0, 1, .01), n("shininess", "Phong 指数", 48, 1, 256, 1)])
    presets = {
        "03": [
            dict(label="前后遮挡", params=dict(cube_a_shape="cube", cube_b_shape="cube", cube_a_position=[-.25,0,.8], cube_b_position=[.35,0,-.8], yaw=0,pitch=0,distance=5,projection="perspective")),
            dict(label="近大远小", params=dict(cube_a_shape="sphere", cube_b_shape="sphere", cube_a_position=[-.65,0,1.2], cube_b_position=[.65,0,-1.5], yaw=0,pitch=8,distance=4.8,fov=60,projection="perspective")),
            dict(label="广角几何", params=dict(cube_a_shape="sphere", cube_b_shape="tetrahedron", cube_a_position=[-.7,0,.2], cube_b_position=[.8,0,-.4], yaw=15,pitch=10,distance=2.8,fov=88,projection="perspective")),
            dict(label="平行投影", params=dict(cube_a_shape="sphere", cube_b_shape="sphere", cube_a_position=[-.8,0,1.2], cube_b_position=[.8,0,-1.5], yaw=0,pitch=0,projection="orthographic")),
        ],
        "12": [
            dict(label="漫反射", params=dict(sphere_a_color="jade",sphere_b_color="copper",sphere_a_reflectivity=0,sphere_b_reflectivity=0,specular=0,bounces=0)),
            dict(label="镜面与陶土", params=dict(sphere_a_color="ivory",sphere_b_color="copper",sphere_a_reflectivity=.9,sphere_b_reflectivity=.05,specular=.3,shininess=96,bounces=3)),
            dict(label="相互映照", params=dict(sphere_a_color="blue",sphere_b_color="ivory",sphere_a_reflectivity=.88,sphere_b_reflectivity=.88,sphere_a_position=[-.72,.8,0],sphere_b_position=[.83,.7,-.15],specular=.35,shininess=64,bounces=3)),
            dict(label="宽高光", params=dict(sphere_a_color="jade",sphere_b_color="copper",sphere_a_reflectivity=.1,sphere_b_reflectivity=.1,specular=.8,shininess=8,bounces=2)),
        ],
    }
    presets["15"] = [
        dict(label="单块曲面", params=dict(mode="single", camera_target=[-1.5,0,0], distance=7.65)),
        dict(label="折痕接缝", params=dict(mode="pair", continuity="C0", camera_target=[0,0,0], distance=11)),
        dict(label="切向连续", params=dict(mode="pair", continuity="C1", left_span=1, right_span=1, camera_target=[0,0,0], distance=11)),
        dict(label="二阶连续", params=dict(mode="pair", continuity="C2", left_span=1, right_span=1, camera_target=[0,0,0], distance=11)),
    ]
    result = []
    for index, items in enumerate(controls):
        chapter = f"{index+1:02}"
        maximum = 2048 if chapter in ("01", "03", "06", "12") else 1024
        resolution = n("size", "渲染分辨率", 512, 64, maximum, 1)
        items = [resolution, *items]
        defaults = {control["key"]: control["default"] for control in items}
        defaults.update(extra.get(chapter, {}))
        result.append(dict(id=chapter, title=TITLES[index], part=PARTS[index], summary=SUMMARIES[index], controls=items, defaults=defaults,
                           dimension=2 if chapter in ("01", "02", "04", "08", "11") else 3, scenePresets=presets.get(chapter, []),
                           hint="拖动画布中的控制点；滚轮缩放，空格拖动平移。" if chapter in ("01", "02", "04", "08", "11") else "拖动旋转空间，滚轮缩放；参数修改后由 Python 生成正式图像。"))
    return sorted(result, key=lambda item: READING_ORDER.index(item["id"]))


@lru_cache(maxsize=16)
def _core(chapter, filename="core.py"):
    path = MODULES / PATHS[int(chapter)-1] / filename
    spec = importlib.util.spec_from_file_location(f"studio_{chapter}_{filename[:-3]}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parameters(chapter, supplied):
    entry = next((item for item in catalog() if item["id"] == chapter), None)
    if entry is None or not isinstance(supplied, dict):
        raise ValueError("未知章节或参数格式错误")
    params = dict(entry["defaults"])
    allowed = set(params) | {"preview", "probe"}
    if set(supplied)-allowed:
        raise ValueError("未知参数：" + ", ".join(sorted(set(supplied)-allowed)))
    params.update(supplied)
    for control in entry["controls"]:
        key, value = control["key"], params[control["key"]]
        if control["type"] == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value) or not control["min"] <= value <= control["max"]:
                raise ValueError(f"{key} 必须位于 [{control['min']}, {control['max']}]")
            if control["step"] == 1:
                if int(value) != value:
                    raise ValueError(f"{key} 必须为整数")
                params[key] = int(value)
        elif value not in [option["value"] for option in control["options"]]:
            raise ValueError(f"{key} 的选项无效")
    for key, shape in (("point", (2,)), ("vertices", (3, 2)), ("points", (4, 2))):
        if key in params:
            array = np.asarray(params[key], float)
            limit = params["size"]/2 if chapter == "08" and key == "point" else 20
            if array.shape != shape or not np.isfinite(array).all() or np.any(np.abs(array) > limit):
                raise ValueError(f"{key} 的形状必须为 {shape}，坐标有限且绝对值不超过 20")
            if chapter == "01" and key == "point" and np.any((array < 0) | (array > 1)):
                raise ValueError("第 01 章探针须位于 [0,1]²")
            params[key] = array.tolist()
    for key in entry["defaults"]:
        if isinstance(entry["defaults"][key], list) and (key.startswith("point_") or key.endswith(("_position", "_rotation", "_scale")) or key in ("camera_target", "light_target")):
            array=np.asarray(params[key],float)
            if array.shape != (3,) or not np.isfinite(array).all():
                raise ValueError(f"{key} 必须是三个有限数值")
            lower,upper=(.1,3) if key.endswith("_scale") else ((-180,180) if key.endswith("_rotation") else (-10,10))
            if np.any((array<lower)|(array>upper)):
                raise ValueError(f"{key} 各分量需位于 [{lower},{upper}]")
            if key=="light_target" and array[1]>0:
                raise ValueError("平行光观察目标需位于地面或地面下方")
            if chapter=="06" and key=="surface_position" and abs(array[2])>2:
                raise ValueError("本章正交表面中心 Z 限于 [-2,2]，确保位于拍摄相机前方")
            if chapter=="07" and key=="plane_scale" and array[2]!=1:
                raise ValueError("零厚度平面没有 Z 缩放；plane_scale[2] 保持 1")
            params[key]=array.tolist()
    if "preview" in params and not isinstance(params["preview"], bool):
        raise ValueError("preview 必须为布尔值")
    if params.get("preview"):
        if chapter == "08":
            # 本章一个世界单位就是一个输出像素。缩小 size 会改变场景范围、
            # 线宽与探针位置；预览只减少像素内部求值，保持同一像素域。
            params["samples"] = min(params["samples"], 4)
        else:
            params["size"] = min(params["size"], 160)
        if chapter == "15":
            params["divisions"] = min(params["divisions"], 12)
        if "shadow_size" in params:
            params["shadow_size"] = min(params["shadow_size"], 256)
    if "probe" in params:
        probe = np.asarray(params["probe"], float)
        if probe.shape != (2,) or not np.isfinite(probe).all() or np.any((probe < 0) | (probe > 1)):
            raise ValueError("probe 为归一化 [u,v]，原点左下，每分量位于 [0,1]")
        params["probe"] = probe.tolist()
    return params


def _png(image, *, linear=True):
    """标准库 PNG 编码；不添加 Pillow，不做图片上下翻转。"""
    rgb = np.asarray(image, float)
    if rgb.ndim == 2:
        rgb = np.repeat(rgb[..., None], 3, axis=-1)
    if rgb.ndim != 3 or rgb.shape[2] != 3 or not np.isfinite(rgb).all():
        raise ValueError("PNG 图像必须是有限 RGB 数组")
    rgb = np.clip(rgb, 0, 1)
    if linear:
        rgb = _core("01").linear_to_srgb(rgb)
    pixels = np.rint(rgb*255).astype(np.uint8)
    height, width = pixels.shape[:2]
    raw = np.concatenate([np.zeros((height, 1), np.uint8), pixels.reshape(height, -1)], axis=1).tobytes()
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind+payload))
    encoded = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 3)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(encoded).decode()


def _image(identifier, label, array, linear=True):
    return dict(id=identifier, label=label, url=_png(array, linear=linear), width=array.shape[1], height=array.shape[0])


def _geometry(triangles, colors=(.14, .47, .32), eye=(4, 3, 6), target=(0, 0, 0), fov=48, **extra):
    triangles = np.asarray(triangles, float)
    colors = np.asarray(colors, float)
    if colors.shape == (3,):
        colors = np.broadcast_to(colors, triangles.shape)
    elif colors.shape == (len(triangles), 3):
        colors = np.repeat(colors[:, None, :], 3, axis=1)
    return dict(positions=triangles.ravel().tolist(), colors=colors.ravel().tolist(),
                camera=dict(eye=np.asarray(eye).tolist(), target=np.asarray(target).tolist(), up=[0, 1, 0], fov=float(fov)), **extra)


@lru_cache(maxsize=1)
def _cached_lighting_mesh(serialized):
    return _core("06", "mesh_shading.py").render_mesh(**json.loads(serialized))


def _lighting_mesh(p):
    # 探针只读取已有缓冲，不重复光栅化；只留最近一份完整网格帧。
    parameters = dict(size=p["size"], scale=[p["sx"],p["sy"],p["sz"]],
                      center=p["surface_position"], latitude=p["mesh_latitude"],
                      light=[p["light_x"],p["light_y"],p["light_z"]], power=p["power"],
                      ks=p["ks"], exponent=p["exponent"], ambient=p["ambient"])
    return _cached_lighting_mesh(json.dumps(parameters, sort_keys=True))


@lru_cache(maxsize=1)
def _cached_pipeline(serialized):
    return _core("13").render_frame(**json.loads(serialized))


def _pipeline_frame(p):
    camera=_camera_pose(p)
    args={key:p[key] for key in ("size","divisions","wave","near","far","depth_test","early_depth","cull","reverse")}
    args.update(position=p["model_position"],rotation=p["model_rotation"],scale=p["model_scale"],
                eye=camera["eye"],target=camera["target"],up=camera["up"],fov=camera["fov"],
                light=[p["light_x"],p["light_y"],p["light_z"]],mode=p["fragment"])
    return _cached_pipeline(json.dumps(args,sort_keys=True))


def _rotation(degrees):
    """XYZ Euler：与浏览器相同，列向量 R = Rx @ Ry @ Rz。"""
    x,y,z=np.deg2rad(degrees)
    cx,cy,cz=np.cos([x,y,z]);sx,sy,sz=np.sin([x,y,z])
    return np.array([[cy*cz,-cy*sz,sy], [cx*sz+sx*sy*cz,cx*cz-sx*sy*sz,-sx*cy], [sx*sz-cx*sy*cz,sx*cz+cx*sy*sz,cx*cy]])


def _euler(matrix):
    y=np.arcsin(np.clip(matrix[0,2],-1,1))
    if abs(matrix[0,2])<.9999999:
        x,z=np.arctan2(-matrix[1,2],matrix[2,2]),np.arctan2(-matrix[0,1],matrix[0,0])
    else:
        x,z=np.arctan2(matrix[2,1],matrix[1,1]),0.
    return [float(x),float(y),float(z)]


def _pose_points(points, position, rotation, scale=(1,1,1)):
    return (np.asarray(points)*scale)@_rotation(rotation).T+position


def _camera_pose(p):
    yaw,pitch=np.deg2rad([p["yaw"],p["pitch"]])
    pivot=np.asarray(p["camera_target"],float)
    eye=pivot+p["distance"]*np.array([np.cos(pitch)*np.sin(yaw),np.sin(pitch),np.cos(pitch)*np.cos(yaw)])
    basis=_core("03").look_at(eye,pivot)[:3,:3].T
    rotation=basis@_rotation(p["camera_rotation"])
    target=eye-rotation[:,2]*p["distance"]
    return dict(eye=eye.tolist(),target=target.tolist(),up=rotation[:,1].tolist(),fov=p["fov"],orbitTarget=pivot.tolist(),rotation=_euler(rotation))


@lru_cache(maxsize=1)
def _cached_environment(serialized):
    return _core("14").render_sphere(**json.loads(serialized))


def _environment_frame(p):
    camera = _camera_pose(p)
    arguments = dict(
        size=p["size"], eye=camera["eye"], target=camera["target"],
        up=camera["up"], fov=camera["fov"], center=p["sphere_position"],
        radius=p["radius"], env_yaw=float(np.deg2rad(p["env_angle"])),
        mode=p["mapping"], map_size=p["map_size"], pattern=p["environment"],
    )
    return _cached_environment(json.dumps(arguments, sort_keys=True))


@lru_cache(maxsize=1)
def _cached_surface(serialized):
    p = json.loads(serialized)
    return _core("15", "render.py").render_frame(p, _camera_pose(p))


def _surface_frame(p):
    inputs = {key: value for key, value in p.items() if key not in {"probe", "preview"}}
    return _cached_surface(json.dumps(inputs, sort_keys=True))


def _object(identifier,label,start,count,position,rotation,scale,*,keys=None,edit=None,reason=None,**extra):
    extra.setdefault("kind","mesh")
    return dict(id=identifier,label=label,start=start,count=count,position=list(position),rotation=list(rotation),scale=list(scale),
                params=keys or {},edit=edit or dict(translate=False,rotate=False,scale=False),reason=reason or {},**extra)


def _camera_object(camera, editable=True):
    return _object("camera","渲染相机",0,0,camera["eye"],camera.get("rotation",[0,0,0]),[1,1,1],kind="camera",
                   keys=dict(position="camera_target",rotation="camera_rotation") if editable else {},
                   edit=dict(translate=editable,rotate=editable,scale=False),
                   reason={"scale":"相机不是实体网格；请用垂直视野调整镜头。",**({} if editable else {"translate":"本章固定拍摄相机，用于隔离当前数学变量。","rotate":"本章固定拍摄相机，用于隔离当前数学变量。"})})


def _shadow_geometry(p):
    triangles,colors=_core("09").scene_geometry()
    local=triangles[2:]-[0,.8,0]
    triangles[2:]=_pose_points(local,p["pillar_position"],p["pillar_rotation"],np.asarray(p["pillar_scale"])/[.55,.8,.55])
    return triangles,colors


def _ray_materials(p):
    colors = np.array([RAY_PALETTE[p["sphere_a_color"]], RAY_PALETTE[p["sphere_b_color"]], _core("12").MATERIALS[2]])
    mirrors = np.array([p["sphere_a_reflectivity"], p["sphere_b_reflectivity"], _core("12").MIRRORS[2]])
    return dict(materials=colors, mirrors=mirrors, specular=p["specular"], shininess=p["shininess"])


def _ray_spheres(p):
    return np.array([p["sphere_a_position"],p["sphere_b_position"]]),np.array([p["sphere_a_radius"],p["sphere_b_radius"]])


def _probe(params, size):
    point = params.get("point", [.5, .5])
    u, v = params.get("probe", point if params.get("_chapter") == "01" else [.5,.5])
    if "probe" not in params and params.get("_chapter") == "08":
        u, v = .5+point[0]/size, .5+point[1]/size
    return min(size-1, int((1-v)*size)), min(size-1, int(u*size))


def _handles(points, labels, key):
    return [dict(id=f"{key}:{i}", label=label, x=float(x), y=float(y), key=key, index=i) for i, ((x, y), label) in enumerate(zip(points, labels))]


def _draw_paths(size, paths, bounds=(-3, 3, -3, 3)):
    """用于二维章节的简单 Python 线段绘制；前端另用 paths 绘制交互覆层。"""
    image = np.full((size, size, 3), [.018, .025, .032])
    xmin, xmax, ymin, ymax = bounds
    for path in paths:
        points = np.asarray(path["points"], float)
        color = path.get("color", [.2, .72, .52])
        for a, b in zip(points[:-1], points[1:]):
            a, b = (np.array([(p[0]-xmin)/(xmax-xmin), (ymax-p[1])/(ymax-ymin)])*(size-1) for p in (a, b))
            length = max(2, min(8*size, int(np.linalg.norm(b-a)*2)+1))
            xy = np.rint(a+(b-a)*np.linspace(0, 1, length)[:, None]).astype(int)
            for dx, dy in ((0, 0), (1, 0), (0, 1)):
                x, y = xy[:, 0]+dx, xy[:, 1]+dy
                valid = (x >= 0) & (x < size) & (y >= 0) & (y < size)
                image[y[valid], x[valid]] = color
    return image


def _cube(center=(0, 0, 0), scale=1):
    vertices = np.array([[-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1], [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]], float)*scale+center
    faces = np.array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,4,7],[0,7,3],[1,2,6],[1,6,5],[3,7,6],[3,6,2],[0,1,5],[0,5,4]])
    return vertices[faces]


def _shape_mesh(shape):
    """原点处的单位形状；物体 TRS 在组装时统一应用。"""
    if shape == "cube":
        return _cube()
    if shape == "sphere":
        vertices, faces = _core("10").make_mesh([1,1,1],12,24)
        return vertices[faces]
    if shape == "tetrahedron":
        vertices = np.array([[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],float)
        faces = np.array([[0,2,1],[0,1,3],[0,3,2],[1,2,3]])
        return vertices[faces]
    raise ValueError("未知几何形状")


def _normal_image(buffer):
    return np.where((buffer["owner"] >= 0)[..., None], (buffer["normal"]+1)/2, [.018, .025, .032])


def _mesh_render(triangles, camera, size, colors=None):
    """通用显示只复用第 09 章真正的深度栅格器；不引入第三套算法。"""
    core = _core("03")
    matrix = core.perspective(camera["fov"], 1, .05, 100) @ core.look_at(camera["eye"], camera["target"], camera.get("up",[0,1,0]))
    buffer = _core("09").rasterize_world(triangles, matrix, size)
    normal = buffer["normal"]
    direction = np.array([-.4, .7, .65]); direction /= np.linalg.norm(direction)
    brightness = .18 + .82*np.maximum(normal@direction, 0)
    material = np.broadcast_to([.11, .48, .31], (*buffer["owner"].shape, 3)).copy()
    valid = buffer["owner"] >= 0
    if colors is not None:
        material[valid] = np.asarray(colors)[buffer["owner"][valid]]
    result = material*brightness[..., None]
    result[~valid] = [.018, .025, .032]
    return result, buffer


def _render_scene(chapter, p):
    core, size = _core(chapter), p["size"]
    result = dict(images=[], metrics=[], probe={}, geometry=None, handles=[], paths=[], bounds=[-3, 3, -3, 3])
    def image(identifier, label, array, linear=True):
        result["images"].append(_image(identifier, label, array, linear))
    def metric(label, value):
        result["metrics"].append(dict(label=label, value=value))
    if chapter == "01":
        rgb = core.render_image(size, size, p["samples"], p["pattern"])
        image("color", "像素 / sRGB 显示", rgb)
        result.update(bounds=[0, 1, 0, 1], handles=_handles([p["point"]], ["采样探针"], "point"))
        metric("每像素样本", p["samples"]**2)
        metric("总求值次数", size*size*p["samples"]**2)
    elif chapter == "02":
        matrices = dict(T=core.translation(p["tx"], p["ty"]), R=core.rotation(np.deg2rad(p["angle"])), S=core.scaling(p["sx"], p["sy"]))
        shear = np.array([[1., p["shear"], 0], [0, 1, 0], [0, 0, 1]])
        matrix = core.compose(*(matrices[k] for k in p["order"]), shear)
        house = np.array([[-1,-1], [1,-1], [1,.4], [0,1.25], [-1,.4], [-1,-1]], float)
        transformed = core.apply(matrix, house)
        paths = [dict(points=house.tolist(), color=[.17,.23,.27]), dict(points=transformed.tolist(), color=[.2,.72,.52])]
        for axis, color in (([1,0],[.15,.5,.85]), ([0,1],[.2,.72,.52])):
            paths.append(dict(points=core.apply(matrix, [[0,0],axis]).tolist(), color=color))
        result.update(paths=paths, handles=_handles([p["point"]], ["原始点 p"], "point"),
                      probe=dict(matrix=matrix.tolist(), point=p["point"], transformed=core.apply(matrix,p["point"]).tolist()))
        image("transform", "仿射变换 · 原始与变换后", _draw_paths(size, paths))
        metric("det(A)", round(float(np.linalg.det(matrix[:2,:2])), 5))
        metric("作用顺序", " → ".join(reversed(p["order"])))
    elif chapter == "03":
        camera=_camera_pose(p)
        eye,target=camera["eye"],camera["target"]
        if p["near"] >= p["far"]:
            raise ValueError("近平面必须小于远平面")
        meshes, colors, objects, start = [], [], [], 0
        for key, color in zip(("a","b"), ([.12,.52,.34],[.7,.28,.085])):
            mesh = _shape_mesh(p[f"cube_{key}_shape"])
            meshes.append(_pose_points(mesh,p[f"cube_{key}_position"],p[f"cube_{key}_rotation"],p[f"cube_{key}_scale"]))
            colors.extend([color]*len(mesh))
            objects.append(_object(f"cube-{key}", f"{SHAPE_LABELS[p[f'cube_{key}_shape']]} {key.upper()}",start,len(mesh),
                                   p[f"cube_{key}_position"],np.deg2rad(p[f"cube_{key}_rotation"]).tolist(),p[f"cube_{key}_scale"],
                                   keys=dict(position=f"cube_{key}_position",rotation=f"cube_{key}_rotation",scale=f"cube_{key}_scale"),
                                   edit=dict(translate=True,rotate=True,scale=True),shape=p[f"cube_{key}_shape"]))
            start += len(mesh)
        triangles, colors = np.concatenate(meshes), np.array(colors)
        projection = core.perspective(p["fov"],1,p["near"],p["far"]) if p["projection"] == "perspective" else core.orthographic(4,1,p["near"],p["far"])
        matrix = projection@core.look_at(eye,target,camera["up"])
        buffer = _core("09").rasterize_world(triangles,matrix,size)
        valid = buffer["owner"] >= 0
        rgb = np.full((size,size,3), [.018,.025,.032])
        rgb[valid] = colors[buffer["owner"][valid]]*(.35+.65*np.abs(buffer["normal"][valid]@np.array([.4,.55,.73])))[:,None]
        image("projection", "Python 相机成像", rgb)
        image("depth", "深度缓冲 0—1", np.where(valid, buffer["depth"], 1), False)
        image("normal", "世界表面法线", _normal_image(buffer), False)
        result["geometry"] = _geometry(triangles,colors,eye,target,p["fov"],projection=p["projection"],near=p["near"],far=p["far"],orthoHeight=4)
        result["geometry"]["camera"]=camera
        result["geometry"]["objects"]=objects+[_camera_object(camera)]
        result["probe"] = dict(view=core.look_at(eye,target,camera["up"]).tolist(),projection=projection.tolist())
        metric("可见像素", int(valid.sum())); metric("投影类型", "透视" if p["projection"]=="perspective" else "正交"); metric("三角形",len(triangles))
    elif chapter == "04":
        vertices = np.asarray(p["vertices"])
        raster = _core("04", "raster.py")
        screen = (vertices+3)/6*size
        rows, cols, weights = raster.rasterize_triangle(screen,size,size)
        colors = np.array([[.95,.13,.065],[.035,.65,.23],[.065,.22,.95]])
        rgb = np.full((size,size,3), [.018,.025,.032])
        rgb[rows,cols] = weights@colors if p["mode"]=="color" else (weights if p["mode"]=="weights" else [.16,.66,.4])
        image("triangle", "Python 三角形栅格化",rgb)
        try:
            weights = core.barycentric(p["point"],vertices)
        except ValueError:  # 拖动时共线是有效的教学状态，空覆盖但无唯一重心坐标。
            weights = None
        result.update(handles=_handles(vertices,"ABC","vertices")+_handles([p["point"]],["P"],"point"),
                      paths=[dict(points=np.vstack([vertices,vertices[0]]).tolist(),color=[.7,.76,.8])],
                      probe=dict(weights=None if weights is None else weights.tolist(),inside=False if weights is None else bool(core.is_inside(weights))))
        metric("覆盖像素",len(rows)); metric("三角形面积",round(float(abs(core.cross2(vertices[1]-vertices[0],vertices[2]-vertices[0]))/2),4))
    elif chapter == "05":
        xy = np.array([[[-.88,-.72],[.82,-.6],[-.1,.9]],[[-.78,.65],[.83,.75],[.05,-.87]]])
        depths = np.array([[4-p["slope"],4+p["slope"],4],[4+p["slope"],4-p["slope"],4]])
        if p["scene"]=="equal": depths[:] = 4
        if p["scene"]=="near": depths[0,0] = .3
        clip = np.array([core.clip_vertices(xy[i],depths[i],1,10) for i in range(2)])
        colors=np.array([[.09,.52,.29],[.85,.22,.07]])
        order=[0,1] if p["order"]=="AB" else [1,0]
        good=core.render(clip,colors,size,size,order=order,bits=p["bits"] or None)
        bad=core.render(clip,colors,size,size,order=order,method="painter",bits=p["bits"] or None)
        image("depth","逐像素深度测试",good["color"]);image("painter","错误对照 · 整面排序",bad["color"])
        image("depth-buffer","深度缓冲 0—1",np.where(np.isfinite(good["depth"]),good["depth"],1),False)
        world=np.concatenate([xy*depths[...,None],-depths[...,None]],axis=-1)
        result["geometry"]=_geometry(world,colors,eye=(0,0,0),target=(0,0,-4),fov=90)
        result["geometry"]["objects"]=[_object(f"triangle-{key}",f"斜面 {key.upper()}",i,1,[0,0,0],[0,0,0],[1,1,1],reason={tool:"本节固定屏幕轮廓以隔离深度测试；请改变深度起伏或实验场景。" for tool in ("translate","rotate","scale")}) for i,key in enumerate(("a","b"))]
        metric("错误对照差异像素",int(np.count_nonzero(good["owner"]!=bad["owner"])))
        metric("深度精度",f"{p['bits']} bit" if p["bits"] else "Float64")
    elif chapter == "06":
        scale = np.array([p["sx"],p["sy"],p["sz"]])
        extent=max(1.9,float(scale[:2].max())*1.2)
        light=np.array([p["light_x"],p["light_y"],p["light_z"]])
        if p["surface_model"] == "mesh":
            frame = _lighting_mesh(p)
            for method,label in (("flat","Flat · 逐面"),("gouraud","Gouraud · 逐顶点"),("phong","Phong · 逐像素")):
                image(method,label,frame["images"][method])
                metric(label+"光照求值",frame["evaluations"][method])
            vertices,faces = frame["vertices"],frame["faces"]
            metric("相同三角形数",len(faces))
        else:
            points,local,mask=core.ellipsoid_surface(size,scale,extent,p["surface_position"])
            light_direction,power=core.light_at(points,light,point_light=True,power=p["power"])
            for correct in (True,False):
                normals=core.transform_normals(local,np.diag(scale),correct=correct)
                shaded=core.shade(normals,light_direction,[0,0,1],ks=p["ks"],exponent=p["exponent"],ambient=p["ambient"],irradiance=power)
                rgb=shaded["total"];rgb[~mask]=[.018,.025,.032]
                image("correct" if correct else "wrong","正确法线 A⁻ᵀn" if correct else "错误对照 An",rgb)
            vertices,faces=_core("10").make_mesh(scale.tolist(),32,64)
            vertices=vertices+p["surface_position"]
            metric("法线变换","inverse transpose");metric("高光指数",p["exponent"])
        result["geometry"]=_geometry(vertices[faces],eye=(0,0,6),light=dict(position=light.tolist()),projection="orthographic",orthoHeight=2*extent)
        result["geometry"]["objects"]=[_object("surface","三角网格" if p["surface_model"]=="mesh" else "解析椭球",0,len(faces),p["surface_position"],[0,0,0],scale.tolist(),keys=dict(position="surface_position",scale=["sx","sy","sz"]),edit=dict(translate=True,rotate=False,scale=True),reason=dict(rotate="本节固定轴向，只改变半轴、位置和光照，以隔离法线与着色频率。"))]
    elif chapter == "07":
        frame=core.render(p["tilt"],p["rotation"],p["frequency"],p["filter"],size,position=p["plane_position"],scale=p["plane_scale"],transform=_rotation(p["plane_rotation"]),texture_size=p["texture_size"],lod_bias=p["lod_bias"],max_anisotropy=p["max_anisotropy"])
        image("correct","透视正确 UV",frame["correct"]); image("affine","错误对照 · 屏幕线性 UV",frame["affine"])
        image("texture","原始纹理",frame["texture"])
        quad=frame["camera"]
        result["geometry"]=_geometry(quad[[[0,1,2],[0,2,3]]],eye=(0,0,0),target=(0,0,-3),fov=float(np.rad2deg(2*np.arctan(1/1.15))),uv=[0,0,1,0,1,1,0,0,1,1,0,1],texture=result["images"][-1]["url"])
        plane_rotation=_rotation(p["plane_rotation"])@_rotation([0,0,p["rotation"]])@_rotation([-p["tilt"],0,0])
        result["geometry"]["objects"]=[_object("surface","纹理平面",0,2,p["plane_position"],_euler(plane_rotation),p["plane_scale"],keys=dict(position="plane_position",rotation="plane_rotation",scale="plane_scale"),edit=dict(translate=True,rotate=True,scale=True),scaleAxes=[True,True,False],rotationOffset=True)]
        valid=frame["owner"]>=0
        error=np.linalg.norm(frame["uv_correct"][valid]-frame["uv_affine"][valid],axis=-1)
        metric("错误 UV 的平均偏差",round(float(error.mean()) if len(error) else 0,5));metric("过滤方式",p["filter"])
    elif chapter == "08":
        # 逐子样本累计，避免 size²×64×2 的巨大临时坐标数组。
        x,y=np.meshgrid(np.arange(size)-size/2,size-1-np.arange(size)-size/2)
        coverage=np.zeros((size,size))
        scene=dict(scene=p["scene"],phase=p["phase"],angle=p["angle"],width=p["width"],cell=p["cell"])
        for dx,dy in core.sample_offsets(p["samples"],p["strategy"]):
            coverage+=core.scene_values(np.stack([x+dx,y+dy],axis=-1),**scene)
        coverage/=p["samples"]
        image("sampling","线性空间采样平均",core.average_color(coverage))
        one=core.scene_values(np.stack([x+.5,y+.5],axis=-1),**scene)
        image("single","单样本对照",core.average_color(one))
        image("wrong-space","错误对照 · sRGB 平均",core.average_color(coverage,wrong_space=True))
        if p["scene"]!="checker":
            exact=core.exact_coverage(size,**{k:v for k,v in scene.items() if k!="cell"})
            metric("相对解析覆盖率 MAE",round(float(np.abs(exact-coverage).mean()),7))
        result.update(bounds=[-size/2,size/2,-size/2,size/2],handles=_handles([p["point"]],["采样探针"],"point"))
        result["probe"] = dict(offsets=core.sample_offsets(p["samples"],p["strategy"]).tolist())
        metric("每像素样本",p["samples"])
    elif chapter == "09":
        light=[p["light_x"],p["light_y"],p["light_z"]]
        triangles,colors=_shadow_geometry(p)
        frame=core.render_scene(size,p["shadow_size"],light,p["bias"],p["pcf"],triangles=triangles,materials=colors,light_target=p["light_target"])
        image("shadow","Python 阴影映射",frame["color"]);image("hard","硬阴影对照",frame["hard_color"])
        depth=frame["shadow_depth"]
        image("shadow-map","光源深度图",np.where(np.isfinite(depth),depth,1),False)
        result["geometry"]=_geometry(triangles,colors,eye=(6,5,7),target=(0,.55,0),light=dict(position=light,target=p["light_target"],up=[0,0,-1]))
        result["geometry"]["objects"]=[_object("ground","地面",0,2,[0,0,0],[0,0,0],[1,1,1],reason=dict(translate="地面固定为 y=0，供检查接触阴影。",rotate="地面固定为 y=0，供检查接触阴影。",scale="地面边界固定，供检查光裁剪体。")),_object("pillar","遮挡物",2,12,p["pillar_position"],np.deg2rad(p["pillar_rotation"]).tolist(),p["pillar_scale"],keys=dict(position="pillar_position",rotation="pillar_rotation",scale="pillar_scale"),edit=dict(translate=True,rotate=True,scale=True))]
        metric("每次 PCF 比较",(2*p["pcf"]+1)**2);metric("阴影图",f"{p['shadow_size']} × {p['shadow_size']}")
    elif chapter == "10":
        axes=[p["a"],p["b"],p["c"]]
        vertices,faces=core.make_mesh(axes,p["detail"],p["detail"]*2)
        triangles=_pose_points(vertices[faces],p["surface_position"],p["surface_rotation"])
        camera=_camera_pose(p)
        geometry=_geometry(triangles,eye=camera["eye"],target=camera["target"],fov=camera["fov"])
        geometry["camera"]=camera
        geometry["objects"]=[_object("surface","参数曲面",0,len(faces),p["surface_position"],np.deg2rad(p["surface_rotation"]).tolist(),axes,keys=dict(position="surface_position",rotation="surface_rotation",scale=["a","b","c"]),edit=dict(translate=True,rotate=True,scale=True)),_camera_object(camera)]
        rgb,buffer=_mesh_render(triangles,geometry["camera"],size)
        image("surface","Python 三角网格成像",rgb);image("normal","几何法线",_normal_image(buffer),False)
        point=core.parametric(*np.deg2rad([p["u"],p["v"]]),axes)
        normal=core.analytic_normal(point,axes)
        geometry.update(probe=_pose_points(point,p["surface_position"],p["surface_rotation"]).tolist(),normal=(_rotation(p["surface_rotation"])@normal).tolist())
        result["geometry"]=geometry
        statistics=core.mesh_statistics(vertices,faces,np.asarray(axes))
        result["probe"]=dict(point=point.tolist(),normal=normal.tolist(),implicit=float(core.implicit(point,axes)))
        metric("三角形",len(faces));metric("体积相对误差",f"{100*statistics['relative_volume_error']:.3f}%")
    elif chapter == "11":
        points=np.asarray(p["points"])
        curve=core.evaluate(points,np.linspace(0,1,400))
        levels=core.de_casteljau(points,p["t"])
        paths=[dict(points=points.tolist(),color=[.23,.3,.35]),dict(points=curve.tolist(),color=[.2,.72,.52])]
        for level,color in zip(levels[1:],[ [.75,.35,.08],[.22,.48,.85],[.9,.85,.5] ]):
            paths.append(dict(points=level.tolist(),color=color))
        image("curve","Bézier / de Casteljau",_draw_paths(size,paths))
        result.update(paths=paths,handles=_handles(points,["P₀","P₁","P₂","P₃"],"points"),probe=dict(point=core.evaluate(points,p["t"]).tolist(),derivative=core.derivative(points,p["t"]).tolist(),levels=[x.tolist() for x in levels]))
        metric("速度 ‖C′(t)‖",round(float(np.linalg.norm(core.derivative(points,p["t"]))),5));metric("参数 t",p["t"])
    elif chapter == "12":
        light=[p["light_x"],p["light_y"],p["light_z"]]
        centers,radii=_ray_spheres(p)
        shading=_ray_materials(p)
        camera=_camera_pose(p)
        rgb=np.empty((size,size,3));normal=np.empty_like(rgb)
        # 每块最多 32768 射线；2048² 输出不同时分配所有路径中间量。
        for start in range(0,size*size,32768):
            stop=min(size*size,start+32768)
            origins,directions=_ray_batch(size,np.arange(start,stop),camera)
            rgb.reshape(-1,3)[start:stop]=core.trace(origins,directions,light,p["bounces"],p["epsilon"],centers=centers,radii=radii,**shading)
            hit=core.nearest_hit(origins,directions,p["epsilon"],centers=centers,radii=radii)
            normal.reshape(-1,3)[start:stop]=np.where((hit["owner"]>=0)[:,None],(hit["normal"]+1)/2,[.018,.025,.032])
        image("rays","Python 光线追踪",rgb);image("normal","解析表面法线",normal,False)
        triangles=[np.array([[[-5,0,-5],[5,0,5],[5,0,-5]],[[-5,0,-5],[-5,0,5],[5,0,5]]])]
        materials=[np.array([shading["materials"][2]]*2)]
        for center,radius,color in zip(centers,radii,shading["materials"]):
            vertices,faces=_core("10").make_mesh([radius]*3,24,48)
            triangles.append(vertices[faces]+center);materials.append(np.repeat(color[None,:],len(faces),axis=0))
        result["geometry"]=_geometry(np.concatenate(triangles),np.concatenate(materials),camera["eye"],camera["target"],camera["fov"],light=dict(position=light))
        result["geometry"]["camera"]=camera
        count=len(faces)
        result["geometry"]["objects"]=[_object("ground","有限地面",0,2,[0,0,0],[0,0,0],[1,1,1],reason=dict(translate="解析求交的地面固定为 y=0。",rotate="本节地面解析方程固定。",scale="有限地面范围固定为 ±5。"))]+[_object(f"sphere-{key}",f"球体 {key.upper()}",2+i*count,count,centers[i].tolist(),[0,0,0],[radii[i]]*3,keys=dict(position=f"sphere_{key}_position",scale=f"sphere_{key}_radius"),edit=dict(translate=True,rotate=False,scale=True),reason=dict(rotate="理想球旋转后没有几何变化；非均匀缩放会变为椭球，超出球求交公式。"),scaleMode="uniform", material=dict(color=shading["materials"][i].tolist(),reflectivity=float(shading["mirrors"][i]),specular=p["specular"],shininess=p["shininess"])) for i,key in enumerate(("a","b"))]+[_camera_object(camera)]
        metric("主射线",size*size);metric("最大反射",p["bounces"])
    elif chapter == "13":
        frame=_pipeline_frame(p);valid=frame["owner"]>=0;camera=_camera_pose(p)
        image("frame","Python · 片元程序输出",frame["image"])
        image("depth","深度 0—1",np.where(valid,frame["depth"],1),False)
        image("overdraw","覆盖次数 · 黑0 / 白4以上",frame["overdraw"]/4,False)
        image("normal","世界法线",_normal_image(frame),False)
        faces=frame["scene"]["faces"]
        geometry=_geometry(frame["vertices"]["world"][faces],frame["vertices"]["tint"][faces],
                           camera["eye"],camera["target"],camera["fov"],near=p["near"],far=p["far"],
                           light=dict(position=[p["light_x"],p["light_y"],p["light_z"]]))
        geometry["camera"]=camera
        geometry["objects"]=[_object("model","两层网格",0,len(faces),p["model_position"],np.deg2rad(p["model_rotation"]).tolist(),p["model_scale"],
                                       keys=dict(position="model_position",rotation="model_rotation",scale="model_scale"),
                                       edit=dict(translate=True,rotate=True,scale=True)),_camera_object(camera)]
        result["geometry"]=geometry
        for key,label in (("vertices","输入顶点"),("clipped_triangles","裁剪后三角形"),("shaded_samples","片元求值"),("visible_pixels","可见像素")):
            metric(label,frame["stats"][key])
    elif chapter == "14":
        frame, camera = _environment_frame(p), _camera_pose(p)
        image("environment", "Python · 镜面环境查询", frame["image"])
        image("normal", "世界法线 · 背景黑", (frame["normals"] + frame["mask"][..., None]) / 2, False)
        query = np.where(frame["mask"][..., None], frame["reflected"], frame["incident"])
        image("direction", "世界查询方向 · XYZ→RGB", (query + 1) / 2, False)
        vertices, faces = _core("10").make_mesh([p["radius"]] * 3, 24, 48)
        geometry = _geometry(vertices[faces] + p["sphere_position"], [.45, .55, .62],
                             camera["eye"], camera["target"], camera["fov"])
        geometry["camera"] = camera
        geometry["objects"] = [
            _object("mirror-sphere", "镜面球", 0, len(faces), p["sphere_position"],
                    [0, 0, 0], [p["radius"]] * 3,
                    keys=dict(position="sphere_position", scale="radius"),
                    edit=dict(translate=True, rotate=False, scale=True),
                    reason=dict(rotate="均匀镜面球没有可辨认的旋转；请移动球体或相机。"),
                    scaleMode="uniform", shape="sphere"),
            _camera_object(camera),
        ]
        result["geometry"] = geometry
        texels = 0 if p["mapping"] == "analytic" else (2 if p["mapping"] == "latlong" else 6) * p["map_size"] ** 2
        metric("主射线", size * size)
        metric("镜面像素", int(frame["mask"].sum()))
        metric("环境纹素", texels)
    elif chapter == "15":
        frame = _surface_frame(p)
        camera = _camera_pose(p)
        image("surface", "Python · 解析法线光照", frame["image"])
        image("normal", "定向法线 · 红色为退化", frame["normal_image"], False)
        image("curvature", f"平均曲率 H · 蓝 −{p['curvature_limit']:g} / 灰 0 / 橙 +{p['curvature_limit']:g}", frame["curvature_image"], False)
        triangles = np.concatenate([mesh["vertices"][mesh["faces"]] for mesh in frame["meshes"]])
        normals = np.concatenate([mesh["normals"][mesh["faces"]] for mesh in frame["meshes"]])
        geometry = _geometry(triangles, [.095,.34,.43], camera["eye"], camera["target"], camera["fov"],
                             normals=np.nan_to_num(normals).ravel().tolist())
        geometry["camera"] = camera
        objects = [_object("surface", "Bézier 曲面", 0, len(triangles), [0,0,0], [0,0,0], [1,1,1],
                           reason=dict(translate="选择控制网中的点来编辑曲面。",rotate="控制点决定几何；相机可自由观察。",scale="直接移动控制点改变曲面形状。")), _camera_object(camera)]
        edges = []
        locked_rows = {"free":0,"C0":1,"G1":2,"C1":2,"C2":3}[p["continuity"]]
        for part, grid in enumerate(frame["grids"]):
            side = "ab"[part]
            for i in range(4):
                for j in range(4):
                    identifier = f"control-{side}-{i}-{j}"
                    editable = part == 0 or i >= locked_rows
                    objects.append(_object(identifier, f"{'P' if part == 0 else 'Q'}{i}{j}", 0, 0, grid[i,j], [0,0,0], [1,1,1],
                        kind="control", keys=dict(position=f"point_{side}_{i}_{j}"),
                        edit=dict(translate=editable,rotate=False,scale=False),
                        reason=dict(translate="该点由接缝约束计算；移动左侧控制点或解除约束。" if not editable else "",
                                    rotate="控制点只有位置。",scale="控制点没有尺寸。")))
                    if i < 3: edges.append([identifier, f"control-{side}-{i+1}-{j}"])
                    if j < 3: edges.append([identifier, f"control-{side}-{i}-{j+1}"])
        geometry.update(objects=objects, controlNet=dict(edges=edges),
                        light=dict(position=[p["light_x"],p["light_y"],p["light_z"]]))
        result["geometry"] = geometry
        metric("控制点", 16*len(frame["grids"]))
        metric("三角形", len(triangles))
        metric("网格分段", f"{p['divisions']} × {p['divisions']}")
        metric("退化可见像素", int(np.sum((frame["owner"]>=0)&~frame["regular"])))
    if result["geometry"] is not None:
        geometry=result["geometry"]
        objects=geometry.setdefault("objects",[])
        if not any(obj["id"]=="camera" for obj in objects): objects.append(_camera_object(geometry["camera"],False))
        if "light" in geometry:
            light=geometry["light"]
            rotation=_euler(_core("03").look_at(light["position"],light.get("target",[0,0,0]),light.get("up",[0,1,0]))[:3,:3].T) if chapter=="09" else [0,0,0]
            objects.append(_object("light","平行光相机" if chapter=="09" else "点光源",0,0,light["position"],rotation,[1,1,1],kind="light",keys=dict(position=["light_x","light_y","light_z"],rotation="light_target" if chapter=="09" else None),edit=dict(translate=True,rotate=chapter=="09",scale=False),reason=dict(rotate="理想点光的朝向不改变发光；请移动位置。",scale="光源没有几何大小；本节点光不是面积光。")))
    return result


def _ray_batch(size, indices, camera=None):
    core=_core("12")
    row,col=np.divmod(indices,size)
    camera=camera or dict(eye=core.EYE,target=core.TARGET,up=[0,1,0],fov=core.FOV)
    scale=np.tan(np.deg2rad(camera["fov"])/2)
    local=np.stack([(2*(col+.5)/size-1)*scale,(1-2*(row+.5)/size)*scale,-np.ones(len(indices))],axis=-1)
    rotation=_core("03").look_at(camera["eye"],camera["target"],camera["up"])[:3,:3]
    directions=core.normalize(local@rotation)
    return np.broadcast_to(camera["eye"],directions.shape),directions


def _pixel_pieces(clip, size, row, col, attributes=None):
    """对一个像素复用相同的裁剪、顶点量化与 top-left 规则。"""
    raster=_core("04","raster.py")
    pieces,attrs=raster.clip_triangle(clip,attributes)
    for index,piece in enumerate(pieces):
        xy,z_ndc,inv_w=raster.clip_to_screen(piece,size,size)
        covered,weights=raster.triangle_coverage(xy,[[col+.5,size-row-.5]])
        if covered[0]:
            yield weights[0],z_ndc,inv_w,None if attrs is None else attrs[index]


def _world_pixel(triangles, matrix, size, row, col):
    closest,point,owner=np.inf,None,-1
    for index,triangle in enumerate(triangles):
        clip=_core("03").transform_points(triangle,matrix)
        for weights,z_ndc,inv_w,positions in _pixel_pieces(clip,size,row,col,triangle):
            depth=float((weights@z_ndc+1)/2)
            if depth < closest:
                closest,owner=depth,index
                point=(weights@(positions*inv_w[:,None]))/(weights@inv_w)
    return closest,point,owner


@lru_cache(maxsize=8)
def _cached_scene(chapter, serialized):
    entry = next(item for item in catalog() if item["id"] == chapter)
    params = dict(entry["defaults"])
    params.update(json.loads(serialized))
    return _render_scene(chapter,params)


def render(chapter: str, params: dict):
    """参数校验 → Python 渲染 → 小型 JSON 响应。探针移动复用图像缓存。"""
    start=time.perf_counter()
    p=_parameters(chapter,params)
    excluded = {"probe", "preview"} | ({"point"} if chapter in ("01","08") else set())
    image_params={key:value for key,value in p.items() if key not in excluded}
    base=_cached_scene(chapter,json.dumps(image_params,sort_keys=True,allow_nan=False))
    result=dict(base)
    result["probe"]=dict(base["probe"])
    if chapter in ("01","08"):
        result["handles"] = _handles([p["point"]], ["采样探针"], "point")
    row,col=_probe({**p,"_chapter":chapter},p["size"])
    result["probe"].update(row=row,col=col,uv=[(col+.5)/p["size"],1-(row+.5)/p["size"]])
    if chapter=="01":
        core=_core("01")
        u,v=result["probe"]["uv"]
        values=[core.scene_color(u+(dx-.5)/p["size"],v+(dy-.5)/p["size"],p["pattern"]) for dx,dy in core.sample_offsets(p["samples"])]
        linear=np.mean(values,axis=0)
        result["probe"].update(linear=linear.tolist(),srgb=core.linear_to_srgb(linear).tolist())
    elif chapter=="05":
        triangles=np.asarray(base["geometry"]["positions"]).reshape(-1,3,3)
        clip=_core("03").transform_points(triangles.reshape(-1,3),_core("03").perspective(90,1,1,10)).reshape(-1,3,4)
        depths=[]
        for triangle in clip:
            values=[float(weights @ z_ndc) for weights,z_ndc,_,_ in _pixel_pieces(triangle,p["size"],row,col)]
            depths.append((min(values)+1)/2 if values else np.inf)
        depths=np.asarray(depths)
        stored=_core("05").quantize_depth(depths,p["bits"] or None)
        result["probe"].update(candidates=[float(x) if np.isfinite(x) else None for x in depths],stored=[float(x) if np.isfinite(x) else None for x in stored])
    elif chapter=="06" and p["surface_model"] == "mesh":
        probe = _core("06", "mesh_shading.py").sample_probe(_lighting_mesh(p), row, col)
        if probe["hit"]:
            result["probe"].update(hit=True,face=probe["face"],weights=probe["weights"],
                                  normal=probe["normal"],interpolated_length=probe["interpolated_length"],
                                  flat_rgb=probe["colors"]["flat"],gouraud_rgb=probe["colors"]["gouraud"],
                                  phong_rgb=probe["colors"]["phong"],vertex_normals=probe["vertex_normals"],
                                  vertex_colors=probe["vertex_colors"])
        else:
            result["probe"]["hit"] = False
    elif chapter=="07":
        core=_core("07")
        raster=_core("04","raster.py")
        clip,uv,_=core.make_quad(p["tilt"],p["rotation"],position=p["plane_position"],scale=p["plane_scale"],transform=_rotation(p["plane_rotation"]))
        for face in ([0,1,2],[0,2,3]):
            pieces,attrs = raster.clip_triangle(clip[face], uv[face])
            for piece,texcoords in zip(pieces,attrs):
                xy,_,inv_w = raster.clip_to_screen(piece,p["size"],p["size"])
                covered,weights = raster.triangle_coverage(xy,[[col+.5,p["size"]-row-.5]])
                if not covered[0]:
                    continue
                weights=weights[0]
                good=core.perspective_interpolate(weights,texcoords,inv_w)
                taps=core.bilinear_taps(good,p["texture_size"],p["texture_size"])
                jacobian=core.perspective_jacobian(weights,raster.snap_vertices(xy)/256,texcoords,inv_w)
                footprint=core.footprint_metrics(jacobian,(p["texture_size"],p["texture_size"]),lod_bias=p["lod_bias"],max_anisotropy=p["max_anisotropy"])
                level=footprint["lod_anisotropic"] if p["filter"]=="anisotropic" else footprint["lod_isotropic"]
                actual_lod=float(np.clip(level,0,np.log2(p["texture_size"]))) if p["filter"] in ("trilinear","anisotropic") else 0.
                result["probe"].update(uv_correct=good.tolist(),uv_affine=(weights@texcoords).tolist(),
                                      lod=actual_lod,footprint_major=float(footprint["major"]),footprint_minor=float(footprint["minor"]),
                                      tap_count=int(footprint["tap_count"]) if p["filter"]=="anisotropic" else 1,
                                      texel_rows=taps[0].tolist(),texel_cols=taps[1].tolist(),texel_weights=taps[2].tolist())
    elif chapter=="08":
        core=_core("08")
        center=np.array([col+.5-p["size"]/2,p["size"]/2-row-.5])
        positions=center-.5+core.sample_offsets(p["samples"],p["strategy"])
        values=core.scene_values(positions,scene=p["scene"],phase=p["phase"],angle=p["angle"],width=p["width"],cell=p["cell"])
        result["probe"].update(positions=positions.tolist(),samples=values.tolist(),coverage=float(values.mean()))
    elif chapter=="09":
        core=_core("09")
        light=[p["light_x"],p["light_y"],p["light_z"]]
        triangles,_=_shadow_geometry(p)
        camera_vp,light_vp=core.scene_matrices(light,light_target=p["light_target"])
        depth,point,owner=_world_pixel(triangles,camera_vp,p["size"],row,col)
        if owner>=0:
            clip=_core("03").transform_points(point[None,:],light_vp)[0]
            ndc=clip[:3]/clip[3]
            u,v=(ndc[0]+1)/2,(1-ndc[1])/2
            current=(ndc[2]+1)/2
            inside=bool(np.all(np.abs(ndc)<=1))
            samples=[]
            if inside:
                sr,sc=np.clip(np.floor(np.array([v,u])*p["shadow_size"]).astype(int),0,p["shadow_size"]-1)
                for dy in range(-p["pcf"],p["pcf"]+1):
                    for dx in range(-p["pcf"],p["pcf"]+1):
                        r,c=sr+dy,sc+dx
                        samples.append(_world_pixel(triangles,light_vp,p["shadow_size"],r,c)[0] if 0<=r<p["shadow_size"] and 0<=c<p["shadow_size"] else np.inf)
            visibility=float(core.pcf_visibility(current,samples,p["bias"])) if samples else 1.
            result["probe"].update(world=point.tolist(),light_uv=[float(u),float(v)],current=float(current),stored=[float(x) if np.isfinite(x) else None for x in samples],visibility=visibility,inside_light=inside)
    elif chapter=="13":
        probe=_core("13").inspect_pixel(_pipeline_frame(p),row,col)
        result["probe"]["hit"]=probe["hit"]
        if probe["hit"]:
            result["probe"].update(face=probe["face"],weights=probe["weights"],world=probe["world"],
                                  uv_correct=probe["uv"],depth=probe["depth"],linear=probe["linear"],
                                  candidates=[c["depth"] for c in probe["candidates"]],
                                  candidate_faces=[c["face"] for c in probe["candidates"]],
                                  depth_passes=[c["passed"] for c in probe["candidates"]],
                                  clip_vertices=probe["vertices"]["clip"])
    elif chapter=="15":
        result["probe"].update(_core("15", "render.py").inspect_pixel(_surface_frame(p), row, col))
    elif chapter=="14":
        frame = _environment_frame(p)
        hit = bool(frame["mask"][row, col])
        result["probe"].update(
            hit=hit, linear=frame["image"][row, col].tolist(),
            incident=frame["incident"][row, col].tolist(),
            lookup_direction=frame["lookup_direction"][row, col].tolist(),
            reflected=frame["reflected"][row, col].tolist() if hit else None,
            world=frame["points"][row, col].tolist() if hit else None,
            normal=frame["normals"][row, col].tolist() if hit else None,
            environment_uv=frame["uv"][row, col].tolist(),
            cube_face=["+X", "−X", "+Y", "−Y", "+Z", "−Z"][int(frame["face"][row, col])],
            cube_uv=frame["face_uv"][row, col].tolist(),
        )
    elif chapter=="12":
        core=_core("12")
        centers,radii=_ray_spheres(p)
        origins,directions=_ray_batch(p["size"],np.array([row*p["size"]+col]),_camera_pose(p))
        path=core.trace_path(origins[0],directions[0],[p["light_x"],p["light_y"],p["light_z"]],p["bounces"],p["epsilon"],
                             centers=centers,radii=radii,**_ray_materials(p))
        segments=[]
        for step in path:
            item={key:step[key].tolist() if isinstance(step[key],np.ndarray) else step[key]
                  for key in ("origin","end","owner","bounce","throughput","contribution")}
            item["t"]=float(step["t"]) if np.isfinite(step["t"]) else None
            if step["owner"]>=0:
                item.update(shadow=[step["shadow_start"].tolist(),step["shadow_end"].tolist()],
                            reflectivity=step["reflectivity"],continuation_weight=step["continuation_weight"],
                            local_color=step["local_color"].tolist())
            segments.append(item)
        result["probe"]["segments"]=segments
    result.update(chapter=chapter,params=p,ms=round((time.perf_counter()-start)*1000,2),engine="Python / NumPy")
    return result
