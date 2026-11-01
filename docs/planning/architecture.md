> 产品约束：书页是唯一主线。讲解中内嵌运行中的程序，源码在对应演示下展开；章节栏可收起。不设置独立实验台、顶部练习模式或经典资料导航。

# Python 图形学交互教材与长期目录

当前阶段维护已有 15 章的本地稳定版，暂停扩章。完整课程和进阶内容保留在 [TODO](../../ROADMAP.md)；下述长期目标不构成本次稳定版的交付条件。

课程目标为完整覆盖 GAMES101 并增加进阶内容；目标与缺口见 [逐讲覆盖表](games101-coverage.md)和 [新编排](book-sequence.md)。当前已实现部分为 5 篇、15 章正文、函数实现与 35 道 TODO 练习，不能将这一批内容视为全书完成。书内配置 54 个聚焦数学问题的演示及 15 个综合演示，共 69 个。`studio.py` 提供 HTTP 服务，`teaching_figures.py` 计算数学构造，`studio_render.py` 调用章节渲染算法；浏览器负责阅读、操作和预览。第 15 章新增独立的曲面数学核心 `core.py`、正式成像 `render.py` 与聚焦图构造 `figures.py`；第 11 章保留 `splines.py` 数学核心、`spline_figures.py` 图形构造与 `spline-lesson.md` 正文；第 14 章保留环境方向查询与程序位置函数，先修与范围见 [章节正文](../../courses/graphics-foundations/modules/03-surface-and-sampling/14-texture-functions/lesson.md)。旧 `app.py` 与前 12 章 `lab.py` 仍可单独运行。[坐标、表面与时间扩展记录](../verification/foundations-gap-expansion.md)及 [管线扩展记录](../verification/pipeline-expansion.md)保留为历史快照，不代表本次整书测试或整体界面验收。

## 目录与职责

本批整书测试 470 项通过；新增曲面的数学、Python 成像与交互检查范围见 [曲面记录](../verification/surfaces.md)。此前样条、主图尺寸、控件和模拟触屏检查保留在 [样条与界面记录](../verification/splines-and-instruments.md)。记录明确保留实际设备、视觉设计与完整课程验收的边界。

```text
graphic/
├── studio.py                        # 标准库 HTTP；教材、源码、ZIP 下载与渲染接口
├── studio_render.py                 # 目录/参数数据、章节函数调用、探针与图像输出
├── teaching_figures.py              # 54 个聚焦演示注册；构造函数按主题留在章节内
├── web/
│   ├── index.html / studio.css      # 交互教材结构与排版
│   ├── studio.js                    # 页面状态、接口请求、阅读与源码显示
│   ├── teaching-figures.js           # SVG 呈现、播放进度、操作与 Python 请求
│   ├── viewport2d.js                # Canvas 2D 操作、网格、点与曲线预览
│   ├── viewport3d.js                # Three.js 观察和变换预览
│   └── vendor/                     # 固定版本脚本、字体、来源与许可证
├── app.py / book.css / book.js       # 保留的 Panel 教学界面
├── start.command                    # macOS 双击入口
├── tools/
│   ├── serve.py                     # 检查端口、启动 studio.py、打开浏览器
│   ├── check.py                     # 逐章运行 unittest
│   └── draw_diagrams.py             # 标准库生成原创 SVG
├── pyproject.toml / uv.lock / .python-version
├── docs/                            # 架构、教学、约定与验收
├── resources/                       # 数学补给、术语与经典导读
├── courses/graphics-foundations/
│   ├── README.md / capstone.md
│   └── modules/
│       ├── 01-images-and-space/     # 01–03
│       ├── 02-rasterization/        # 04–05
│       ├── 03-surface-and-sampling/ # 06–08、13、14
│       ├── 04-shadows-and-geometry/ # 09–11、15
│       └── 05-raytracing/           # 12
└── outputs/                         # 实验输出与历史记录
```

目录按“用途 → 课程 → 模块 → 章节”组织。每章保留 `lesson.md`、`core.py`、`exercises.py` 和 `test_core.py`；前 12 章另保留旧 Panel 的 `lab.py`，新增章节无需实现旧界面；04 另有 `raster.py`、`raster_lab.py`、`raster-lesson.md`。章节核心是普通 NumPy 函数，不导入界面框架。`lab.build()` 继续为旧 Panel 界面构建每次会话的交互状态；新交互教材直接调用核心函数。

## 从操作到像素

1. 浏览器视口响应拖动、拾取、缩放与平移，用少量 JavaScript 计算即时操作预览。
2. 页面把章节编号与参数作为 JSON 发送到 `/api/render`。`studio_render.py` 检查参数，调用章节函数，返回图像、数学中间量、探针、路径和操作柄。
3. 正式图像由 Python/NumPy 生成，编码为 PNG 后交给浏览器显示。颜色运算保持线性 RGB，显示输出按渲染桥约定编码一次；图像数组第 0 行是画面顶部。

二维预览使用 Canvas 2D；三维预览使用 Three.js 0.180.0。浏览器的三维渲染用于操作反馈，正式图像与教学数值仍以 Python 结果为准。画布缩放不会增加像素、样本数或算法精度。视口像素探针采用左下角为原点的归一化坐标，桥负责映射到首行在顶部的数组索引；教材中各算法的世界/屏幕坐标仍遵守 [数学与渲染约定](../conventions/rendering.md)。

HTTP 层使用 Python 标准库 `ThreadingHTTPServer`；Markdown 使用现有环境中的 `markdown-it-py` 与 `mdit-py-plugins` 保留公式，浏览器用 KaTeX 排版。通信是普通 HTTP/JSON，不需要 Panel WebSocket 或 `--origin` 设置。完整实验需要正在运行的 Python 服务。

聚焦数学问题的演示走独立的小接口：`GET /api/figures` 返回 54 个定义，`POST /api/figure` 接收 `id`、`params` 与 `[0,1]` 范围的 `progress`。每个 Python 函数计算线段、多边形、圆、文字、操作柄、公式和数值；前端将这些图元画成 SVG，负责播放节奏、坐标映射和拖动事件。前端不重新实现向量构造和数学结论。`Drawing` 只是一组可读的图元辅助函数，复用 NumPy 与已有章节函数，不引入动画框架或新依赖。一般变基、父子 FK、时间快门与纹理函数演示使用静态参数接口，真实时间、坐标或尺度由画内手柄控制；没有把统一 progress 参数当作场景物理时间。14 的噪声切片与球面颜色同样由 Python 逐像素求值，浏览器只显示生成的图像。

## 可编辑对象与数学约束

综合演示返回真实世界几何、相机、光源及 `geometry.objects`。对象包含世界变换、参数绑定和 `edit` 能力；禁用工具附有 `reason`。选中对象即附着有效手柄，W/E/R 选择移动/旋转/缩放，F 聚焦。拖动更新同一组 Python 参数，释放后正式渲染；二维与三维的 Esc 均恢复本次手势开始时的值，并发送取消信号，供页面历史记录丢弃该次编辑。

| 章节 / 对象 | 可编辑范围与约束 |
| --- | --- |
| 03 两个物体 | 可选择立方体、球面网格或四面体，各自支持平移、XYZ 旋转和缩放，Python 投影与世界几何同步变化。 |
| 03、10、12、13、14、15 场景相机 | 平移与镜头转向；相机不作模型缩放，透视范围由 FOV 控制。「成像视角」直接操纵场景相机并更新 Python 图像，「空间剖解」从外部观察场景。 |
| 05 两个三角形 | 保留固定屏幕轮廓，隔离深度比较；不开放任意物体变换。 |
| 06 椭球与光源 | 椭球可平移及修改三个半轴，光源可平移。当前解析表面与法线对照以轴对齐椭球为前提，因此不开放椭球旋转。 |
| 07 纹理平面 | 平移、旋转及面内缩放；平面厚度为零，局部 Z 缩放禁用。 |
| 09 遮挡物与光观察 | 遮挡物支持完整变换；光源位置与朝向改变阴影相机和 Python 阴影比较。地面保持固定。 |
| 10 曲面 | 平移、旋转及三个半轴缩放，几何与法线一起变换。 |
| 12 两个球体 | 球心平移与半径统一缩放。理想球旋转不改变结果；非等比缩放将改变射线求交模型，故均禁用。地面保持固定。 |
| 13 两层网格与点光 | 模型整体平移、XYZ 旋转和正缩放；波幅与网格分段改变 Python 顶点；点光可平移。片元程序、深度时机、提交顺序与剔除作为实验设置。 |
| 14 镜面球与环境 | 球心平移、半径统一缩放及渲染相机操作；均匀理想球不开放无可辨识的旋转。环境旋转改变查询方向，解析球求交决定正式成像；空间网格只作操作预览。 |
| 15 曲面控制网 | 单块 16 点、拼接两块 32 点，使用 `kind="control"` 的位置绑定；控制点只能移动。约束决定右曲面的锁定行，锁定点给出原因；相机和光源可操作，等参线可关闭。控制网操作仍在章节综合演示中，不增设独立工作台。 |

`params` 中旋转数组使用角度；`geometry.objects.rotation` 使用前端 Euler XYZ 所需的弧度。相机的 `camera_target` 是轨道参考点，平移它会平移整台相机；`camera_rotation` 是相对当前轨道观察方向的转向。第 09 章光源的 `light_target` 是世界目标点而非 Euler 角。后端检查数组形状、有限值、缩放及位置范围，避免前端操作制造无效模型。

## 正文、源码与练习

`lesson.md` 是教材正文来源，第 04 章顺接 `raster-lesson.md`。长章还可用独占一行的 `[[include:xxx-lesson.md]]` 引入同目录小节；当前只展开一层，仍保留来源路径以解析相对链接。14 用 `environment-lesson.md` 与 `procedural-lesson.md` 接续方向查询与位置函数；11 用 `spline-lesson.md` 接续分段曲线、局部基函数与有理权重。作者用独占一段的 `[[demo:id]]` 明确指定演示位置，例如 `[[demo:basis-transform]]`；`[[demo:main]]` 指定本章综合演示。服务将标记转换为插入槽，前端据 ID 装入对应演示，不再根据“观察”等标题推测位置。当前 15 章合计 54 个聚焦演示与 15 个综合演示，每章数量随教学问题确定。数学演示可按正文概念任意插入；目前综合场景 `main` 是页面单例，需要多个大型场景时再做有实际需求的局部扩展。

综合演示后接「展开本章完整源码」。数学演示的代码按钮定位到同一源码区中的实际构造函数，可能位于 `teaching_figures.py` 或章节 `*_figures.py`，以登记的文件和行号为准；章节源码链接指向实际文件。`/api/source-tree` 列出本章文件、可复用算法和前后端入口；`/api/source` 返回完整文本和行数，Prism 负责高亮。操作说明收在帮助入口，保持正文围绕数学关系展开。

`/api/download` 打包教材源码 ZIP，包含 Python、前端、正文、配置、锁文件、SVG、KaTeX 字体和 vendor 许可证，排除 `.venv`、`.git`、`__pycache__` 与 `outputs`。下载的是可阅读、可继续修改的工程文件。35 个 TODO 留在 15 份 `exercises.py`；未完成时自检给出练习提示，参考算法由各章说明指向 `core.py` 等文件。

早期静态 SVG 的 `tools/draw_diagrams.py` 与章节 `figures/` 文件保留，可用 `uv run --locked python tools/draw_diagrams.py` 重建；当前数学演示由 Python 实时构造、SVG 呈现。教材中外部经典资料均由对应章节注明出处。

阅读进度及前后章导航由已发布 `catalog` 的长度和顺序决定，不再写死 12 或对章节 ID 加减。目录 ID 是稳定引用，顺序是教学安排；当前 07 → 14 → 09 依次说明 UV/表面数据、方向与位置函数、光源深度比较；11 → 15 → 12 依次连接曲线、曲面和射线求交。后端按 ID 查找默认参数，避免调序后渲染错章。规划单元不会自动作为空壳章节发布，现有 URL、路径和本机参数键保持兼容。

页面层实现撤销/重做、演示最大化、参数区收纳和双视口比例调整；这些状态不进入核心算法。一次连续拖动作为一次历史编辑，取消手势不应新增历史。实现存在不等于整页行为已通过验收，当前浏览器覆盖及待验项目见本轮验收记录。

## 核心复用

- 03 的相机矩阵供后续观察与投影使用。
- 04 的 `raster.py` 提供齐次裁剪、屏幕映射、共享边覆盖规则与重心权重，供深度、纹理、阴影等章节使用。
- 09 的世界位置光栅化等函数供交互教材和 12 的同场景光栅对照使用。
- 14 的 `core.py` 复用 03 相机并计算经纬/立方体环境查询与解析镜面球；`procedural.py` 独立计算二维/三维 value noise 和有限归一化 octave 合成。环境在无限远，立方体查询只有面内双线性；没有 GI、粗糙度预过滤或跨面无缝过滤。程序噪声不是 Perlin，有限合成没有足迹过滤，不声称严格无限分形或带限。
- 15 的 `core.py` 独立计算张量积 Bézier、偏导、定向法线、正则判断和 H/K；`stitch_patches` 按参数跨度施加整边 C0/C1/C2 约束，G1 仅采用局部正比例的充分构造。`render.py` 复用 03 相机、04 光栅、06 光照和 07 透视属性恢复；有限三角网格决定覆盖与深度，恢复 UV 后解析求法线和曲率。像素探针分别返回真实网格插值点与精确曲面点，避免把网格近似称为解析求交。当前没有有理或裁剪曲面、自适应网格及完整 CAD。

复用通过 `importlib` 按明确路径导入，读者可沿函数调用直接追到实现。没有基类继承、设备后端抽象或插件注册层。渲染桥负责适配参数与输出，不在前端复制正式渲染管线。

## 环境与启动

Python 要求为 3.11 或更新，环境由 `uv.lock` 固定。现有依赖包括 NumPy、Panel、Bokeh 和 `mdit-py-plugins`；交互教材迁移不增加 Python 包。Panel/Bokeh 保留用于历史界面，测试仍用标准库 `unittest`。

前端是原生 HTML/CSS/JavaScript，无需 npm 或构建服务。`web/vendor/sources.json` 记录 Three.js **0.180.0**、Prism **1.30.0** 与 KaTeX **0.16.22** 的上游来源；对应许可证和字体均在本地，页面不依赖运行时 CDN。初次准备 Python 环境仍可能需要 `uv` 下载依赖。

在 `graphic/` 执行：

```bash
uv run --locked python tools/serve.py  # 默认交互教材；就绪后打开浏览器
uv run --locked python studio.py --host 127.0.0.1 --port 5006  # 直接运行服务
uv run --locked python tools/check.py  # 逐章隔离的数学测试

# 历史 Panel 教学界面
uv run --locked panel serve app.py --address 127.0.0.1 --port 5007 --show
```

macOS 可双击 `start.command`。启动器默认监听 `127.0.0.1:5006`，支持 `--host`、`--port` 和 `--no-browser`；端口占用时给出换端口提示。`Ctrl+C` 结束服务子进程。`check.py` 隔离各章同名 `core.py`，其通过不代表浏览器、触屏或远程部署已经验收。公网部署、HTTPS 与反向代理仍在 [后续路线](../../ROADMAP.md) 中。

## 分辨率与计算边界

参数目录中的正式图像分辨率一般为 64–1024；第 01、03、06、12 章为 64–2048。第 09 章输出最高 1024，shadow map 独立支持 64、128、256、512、1024、2048。分辨率、每像素采样数、显示缩放各自控制不同的量。

多数章节的 `preview` 请求把图像尺寸限制到最多 160，阴影图限制到最多 256；第 08 章保留原始像素域，只把预览采样数降至最多 4，以免细线和探针跳动。正式请求使用所选分辨率与采样数。第 12 章按批处理射线，避免同时构造全部高分辨率路径中间数组。这些是内存与计算预算措施，不保证所有机器上的交互帧率。高分辨率、更多样本或更多反射仍需要更长计算时间。

正式渲染使用 CPU/NumPy，MPS 非必需。已声明的 PyTorch/MPS `gpu` extra 默认不安装；若以后启用，保留 NumPy 参考实现，核对算子和精度后再测收益。浏览器三维预览的 WebGL 与 Python 的 MPS 计算彼此独立。

后续综合作品放 `projects/`，开放问题与论文复现放 `research/`，共享短文放 `resources/`；有实际内容时再创建。其他课程继续放在 `courses/`，不需要改变现有章节的函数结构。


### 主成像视口与操作输入（2026-09-23）

综合演示默认显示 Python 图像，同一位置切换空间观察，双视图按需打开。`Viewport3D.setImageSurface()` 把现有相机与表面拖动事务连接到实际图片元素：成像、空间共用相同参数和撤销记录，浏览器不重新计算正式颜色。布局与输入的实际范围、固定相机约束和剩余聚焦图适配见 [主视口验证](../verification/renderer-first-pass.md)。


### 聚焦数学图的响应式分幅

需要响应式分幅的演示使用 `with d.panel(key, bounds, columns=1)` 标记有独立意义的图组。浏览器根据实际容器宽度排列这些组，在同一组参数下映射图元与控制柄，不重复计算教学算法。首次坐标范围在编辑期间保持固定；F 重新适配，各子图独立平移与缩放。`columns` 仅供相邻小层级/色块并排，默认单列。数值可展开检查；普通滚轮属于书页，Ctrl/⌘+滚轮缩放数学图。触屏默认阅读、显式进入操作。此前验证与尚未验收的范围见 [分幅记录](../verification/responsive-figures.md)，不把旧记录自动扩展到第 14、15 章。


### 本批组件与曲线图调整（2026-09-24）

`editor-polish.css` 与 `figure-exploration.css` 调整既有组件：主图在 1440px 检查场景中由 443px 扩到 520px；主要控件 13px、辅助文字至少 12px，触屏命中区至少 44px；手机最大化修复布局挤压。实际场景和限制见 [样条与界面记录](../verification/splines-and-instruments.md)，不代表全书视觉终验。

样条批次的 22 个聚焦演示已声明 `Drawing.panel`，其中包括第 11 章的五个图组；其标注按实际宽度保持至少 12px。本批 15 的三个聚焦演示也声明独立分幅，合计 25 个；其余 29 个旧图仍待逐项适配。Python 的操作柄可附 `select` 元数据，使 B-spline 拖点同步选择所解释的基函数；撤销恢复参数与对应高亮。拼接图固定参数映射，编辑不移动视域，显式 F 根据后端更新的范围恢复极端构形。浏览器负责映射与呈现，曲线、速度、权重及齐次投影仍由 Python 计算。新增曲面的浏览器证据只以 [本批记录](../verification/surfaces.md) 为准，不沿用旧批次结论。
