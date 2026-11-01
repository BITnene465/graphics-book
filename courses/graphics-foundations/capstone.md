# 综合实践：构建可逐像素检查的渲染器

完成[全书十五章](README.md)后，把几何、可见性和颜色连成一幅图。目标场景是一块棋盘地面、一根柱子和一个椭球：透视相机看场景，方向光投下阴影，材质在线性 RGB 中着色，最后才编码显示。选择任意表面像素，都应能追到它的三角形、世界位置、法线、光深度和颜色分量。

本实践综合运用全书的空间、采样、光照与几何知识，集中实现光栅化和阴影这条成像路线。配套入口直接复用各章核心，保存图像与中间量；后续实验再改变条件并验证结果。光线追踪的对照单列在第 5 节，以避免混用不同场景的结果。

## 1. 实践目标

- 生成 96×96 的基准图，并保存线性 RGB、深度、法线、世界位置和物体编号；背景值有明确含义。
- 可分别改变相机、椭球比例、光方向和阴影参数，说明画面为什么变化。
- 为一个选中的像素打印计算过程，能手工核对至少一次深度比较与一次光照点积。
- 完成一次透视/法线错误对照和一次固定输出尺寸的采样对照；保留参数与误差指标。
- 区分三角网格近似、离散采样误差、浮点误差以及着色模型的限制。

图像计算使用 NumPy 与标准库，结果可通过书内演示接口检查；核心函数保持独立的 Python 调用。相关公式见[数学补充](../../resources/math/bridge.md)，术语与坐标约定见[术语索引](../../resources/reading/glossary.md)。

## 2. 算法组合与接口约定

| 输入 → 输出 | 直接复用的函数 | 接口要点 |
| --- | --- | --- |
| 基础场景 → 世界三角形、材质 | [09](modules/04-shadows-and-geometry/09-shadows/core.py) `scene_geometry()` | 地面占三角形编号 0、1，后面 12 面构成柱子；返回线性材质色。 |
| 椭球 → 顶点、面索引 | [10](modules/04-shadows-and-geometry/10-geometry/core.py) `make_mesh(axes=(1,1,1), latitude=8, longitude=16)` | `vertices[faces]` 得到 `(T,3,3)` 三角形；返回的是局部坐标。 |
| 观察参数 → 变换矩阵 | [03](modules/01-images-and-space/03-camera/core.py) `look_at(eye, target, up=(0,1,0))`、`perspective(fov_y_degrees, aspect, near, far)` | `projection @ view` 是世界到 clip 的矩阵。 |
| 世界三角形 → 可见表面数组 | [09](modules/04-shadows-and-geometry/09-shadows/core.py) `rasterize_world(triangles, view_projection, size)` | 返回 `depth/world/normal/owner`；世界点已透视正确插值，法线是面法线。内部复用 04 的裁剪与光栅化。 |
| 世界点 → 光方向、入射比例 | [06](modules/03-surface-and-sampling/06-lighting/core.py) `light_at(points, light, point_light=False, power=1.0)` | `point_light` 和 `power` 是关键字参数；方向光的 `light` 表示方向。 |
| 法线、光、视线 → 光照分量 | [06](modules/03-surface-and-sampling/06-lighting/core.py) `shade(normals, light, view, kd=..., ks=..., exponent=..., ambient=..., irradiance=...)` | `kd` 等参数用关键字传递；返回 `ambient/diffuse/specular/total` 字典，所有向量放在同一空间。 |
| 世界点 → 阴影可见率 | [09](modules/04-shadows-and-geometry/09-shadows/core.py) `shadow_query(points, light_vp, shadow_depth, bias=.004, radius=0)` | `radius=1` 是 3×3 PCF；返回 `visibility` 及 UV、深度、tap 等中间量。 |
| 平面坐标 → 线性纹理色 | [07](modules/03-surface-and-sampling/07-textures/core.py) `sample_texture(texture, uv, filtering="bilinear")` | UV 原点左下，纹理数组行向下。地面可直接由已恢复的世界 XZ 构造平面 UV。 |
| 线性 RGB → 显示编码 | [01](modules/01-images-and-space/01-pixels/core.py) `linear_to_srgb(linear)` | 最后执行一次；保存原始线性数组以便后续平均与比较。 |

这里 `rasterize_world()` 已经组合了 [04 的 `clip_triangle()`、`clip_to_screen()`、`rasterize_triangle()`](modules/02-rasterization/04-barycentric/raster.py)，以及 [05 的深度插值原则](modules/02-rasterization/05-depth/core.py)。读这段循环，确认裁剪、覆盖、深度获胜和世界点恢复的先后关系，再运行下面的入口。

## 3. 运行完整示例，检查第一张图

[完整入口 main.py](../../projects/foundation-renderer/main.py)已随书提供，无需拼接代码。从项目根目录运行：

```bash
uv run --locked python projects/foundation-renderer/main.py
```

默认输出到 `outputs/capstone/`：

| 文件 | 保存内容 |
| --- | --- |
| `frame.png` | 一次 sRGB 编码后的 96×96 显示图像 |
| `frame.npz` | 线性 RGB、深度、世界位置、法线、三角形编号、阴影可见率、三种颜色分量和两个投影矩阵 |
| `pixel.json` | 一个表面像素的计算结果、重投影深度与屏幕坐标 |

图像与阴影图分辨率可以单独改变，也可以指定待检查的像素。行号从顶部开始，列号从左侧开始：

```bash
uv run --locked python projects/foundation-renderer/main.py --size 256 --shadow-size 512 --pixel 128 128
```

背景像素使用 `owner=-1`、`depth=+∞`、零法线和无定义的世界位置；NPZ 中的无定义位置为 `NaN`，JSON 则用 `surface=null` 表示没有命中。可见表面的数据必须有限。默认命令会选取一个确实命中的表面像素，便于立即进行数值核对。

入口的 `render_frame()` 按四步排列：构造世界三角形；分别从光源与相机渲染；查询表面材质与光方向；组合线性颜色分量。`inspect_pixel()` 从保存的数据重新投影世界点，`write_png()` 最后执行颜色编码。独立读取浮点结果可以使用：

```python
import numpy as np

frame = np.load("outputs/capstone/frame.npz")
row, col = 48, 48
print(frame["owner"][row, col])
print(frame["linear_rgb"][row, col])
```

场景采用平行光、面法线、Blinn–Phong 经验高光和 PCF。背景、环境常量与镜面系数都是教学设定；环境项没有计算间接光，PCF 也没有模拟面积光源。先解释这些条件下的图像，再考虑更复杂的模型。

## 4. 分步实验与验证

### A. 追踪一个像素，先确认可见性

从 `np.argwhere(valid)` 中选择一行一列，打印 `owner/depth/world/normal`。将世界点重新乘主相机矩阵并除以 w，检查投影深度与缓冲值一致；其屏幕位置应接近该像素中心。04 的 1/256 像素顶点量化会产生微小重投影偏差，不应要求所有屏幕坐标逐位相等。

把三角形顺序倒过来再次渲染。**排除相同存储深度的平局**后，深度和几何可见性应一致；`owner` 是提交编号，比较前须用原始索引映射回来。严格 `<` 对平局保留先到者，这是已有约定。用 [05](modules/02-rasterization/05-depth/lesson.md) 的重叠三角形与量化实验解释差异。

### B. 验证相机变换与法线变换

用 [03 的 `look_at()` 与 `perspective()`](modules/01-images-and-space/03-camera/core.py) 替换起步脚本的主相机矩阵，保留光矩阵。记录 `eye/target/fov/near/far`，并让 `view_dir` 使用同一个 `eye`。让一个三角形穿越近平面，应逐步被裁剪而不是整面突然消失。

对网格施加 $A=\operatorname{diag}(2,1,0.5)$，从变换后的顶点叉积得到面法线，再与 [06 的 `transform_normals(original_normals, A)`](modules/03-surface-and-sampling/06-lighting/core.py) 比较；对正行列式且绕序一致的这次变换，方向应一致。错误版本 `correct=False` 会破坏与新切线的正交性。若加上负缩放，还要讨论反射导致的绕序翻转，不能沿用这个方向判断。

### C. 检查纹理、直接光与阴影的中间量

在地面选一点，手算 `uv=(world_xz+3)/6`，然后用 [07 的 `bilinear_taps(uv, width, height)`](modules/03-surface-and-sampling/07-textures/core.py) 打印四个纹素及权重；权重和应为 1。当前平面 UV 从已恢复的世界位置得到，不需要再做一次透视校正。若改为每顶点保存 UV，则要随裁剪一起插值，再调用 `perspective_interpolate(weights, attributes, inv_w)`。

打印单位 $n,\ell,v$、$\max(0,n\cdot\ell)$ 与各光照分量，分别只显示漫反射和高光。用 `shadow_query()` 的 `current/samples/visibility` 验证 $D-b\le S$ 的通过比例。固定点和阴影图后，增大非负 bias 不应降低可见率。比较硬阴影与 PCF 时，第一遍光深度应保持完全相同。

### D. 固定最终像素数，再增加求值次数

调用 `render_frame(size)["linear_rgb"]`，取得线性 `(size,size,3)` 图像；保持阴影图分辨率和场景不变。在 96、192、384 的内部网格渲染，然后分别以每轴 1、2、4 的块平均到同一个 96×96 输出。例如每轴 $k=2$：

```python
low = high.reshape(96, 2, 96, 2, 3).mean(axis=(1, 3))
```

平均发生在 sRGB 编码之前。这里的内部高分辨率渲染实际计算了更多场景样本，每轴 2 倍相当于每输出像素 4 个规则样本。`rasterize_world()` 支持每轴最高 2048；本实验先使用每轴 1、2、4 倍，以控制运行时间；它展示采样原理，但子像素量化也随内部网格变化，不应宣称与无限精度求积完全相同。

固定最终尺寸，让椭球平移 0.02 个世界单位，记录边缘差异与耗时。用 [08 的 `sample_coverage()` 和 `exact_coverage()`](modules/03-surface-and-sampling/08-sampling/core.py) 另做斜边参考，验证常量保持和覆盖误差；综合场景的高分辨率图只称“参考”，不能称解析真值。增加有限样本数不保证每个像素误差严格单调下降。

## 5. 拓展实验

**曲线驱动一个场景参数。** 调用 [11 的 `evaluate(control, t)`](modules/04-shadows-and-geometry/11-bezier/core.py) 得到三维位置，用它控制光源观察位置或物体平移。对光源保持 Y>0；固定 up 的相机还须避开视线与 up 平行的姿态。比较均匀 `t` 与 `arc_length_parameters(control, fractions)` 的移动速度，写明后者是折线近似。动画默认暂停，按一次推进一帧也能检查全部数学。

**把可见性换成射线求交。** 从 [12](modules/05-raytracing/12-rays/core.py) 的 `camera_rays(size)`、`nearest_hit(origins, directions, t_min, t_max)` 和 `trace_pixel(size, row, col, ...)` 开始，检查同一像素的起点、方向、最近合法根及有限阴影线段。12 当前场景是两个解析球和有限地面；它不能直接接收本任务的任意三角网格。先用 `raster_comparison(size, segments)` 与它自己的同相机场景对照，再决定是否练习编写射线—三角形求交。不要用两个不同场景的颜色差判断谁更正确。

12 的 `render_image(size=64, ..., bounces=2, epsilon=1e-4)` 返回颜色、法线、距离及命中信息，每轴上限 96。先用它验证 0–3 次确定性反射；随机路径追踪、复杂材质与 GPU 加速可以另立后续课题。

## 6. 实验报告与复现

配套入口和验证已在项目中提供；运行 `uv run --locked python -m unittest discover -s projects/foundation-renderer` 可检查重投影、颜色分解、背景约定和提交次序。完成实验时，保留修改后的入口、数值检查及一份短实验说明。说明中放场景参数、一个像素的数值链、两组错误对照、固定输出尺寸的样本数/耗时/误差表，以及仍然存在的限制。

验证不仅依赖图像外观，还应说明每个阶段的数值依据：哪个三角形通过深度测试、世界位置如何恢复、法线为何与切平面正交、纹理在哪些位置取值、光源是否可见，以及颜色何时编码。最后选择一种错误实现，依据中间量定位原因，并记录修正前后的结果。
