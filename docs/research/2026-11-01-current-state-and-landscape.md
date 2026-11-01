# Graphic Lab：现状、技术栈与同类产品调研

调研日期：2026-11-01。范围为现有项目的代码核对、运行复查，以及公开教材、交互讲解和教学平台的定性比较。本轮不扩章、不迁移技术栈、不修改算法与界面。完整 GAMES101 覆盖继续保留在 [TODO](../../ROADMAP.md)。

## 判断

同类作品已经存在，“电子书内嵌可操作程序”本身不是空白。最接近整本教材形式的是 David Eck 的 *Introduction to Computer Graphics*；与原理实现路线接近的是 *Computer Graphics from Scratch* 和 Scratchapixel；视觉叙事值得重点研究的是 Bartosz Ciechanowski；书内修改代码并立即看到结果，可参考 *The Book of Shaders*。

现有项目的基础值得保留：Python 数学核心与界面分离，有实际光栅和射线算法，也有数值检查与测试。当前主要不足在交互体验的一致性、代码学习的完整流程，以及从本地运行转向公开在线阅读的交付方式。建议继续做“能够操作、检查和修改算法的中文图形学教材”，避免逐步演变为独立场景编辑器。

## 1. 当前实际状态

| 项目 | 本次核对结果 |
| --- | --- |
| 版本 | `graphic-lab 0.1.0` |
| 内容 | 15 章，27 份正文及附篇 |
| 演示 | 54 个聚焦演示 + 15 个综合演示，共 69 个 |
| 练习 | `exercises.py` 中保留 35 个待实现函数，属于教学任务 |
| 数学与接口测试 | 本次实际执行 `uv run --locked python tools/check.py`，470 项通过，失败章节为 0 |
| 运行抽查 | 临时启动本地服务，浏览器访问 01、15 章；两章 512² Python 图像加载成功，无 JavaScript 或 KaTeX 错误 |
| 已有功能 | 书内演示、可收纳目录、相机和可编辑对象操作、控制网、撤销/重做、像素探针、源码高亮与下载 |
| 尚未形成的能力 | 在书页中修改 Python 并执行练习、完整课程覆盖、已验证的公网部署与多人计算服务 |

测试通过说明现有测试覆盖的行为成立，不等于整书的教学效果、视觉设计或所有交互均已验收。本次浏览器只抽查两章，没有重新完成历史记录中的全部设备与操作检查。

既有内容以像素、空间、光栅化、采样、表面与纹理、阴影、曲线曲面和基础光追为主。完整光传输、路径追踪、真实镜头、动画与物理模拟仍有缺口；不能把已有基础光追等同于完整 GAMES101 光传输部分。参见 [覆盖表](../planning/games101-coverage.md)。

## 2. 实际技术栈

| 层次 | 当前实现 | 承担的职责 |
| --- | --- | --- |
| 环境 | uv、`pyproject.toml`、`uv.lock`，本机 Python 3.11.15 | 锁定依赖、本地启动与测试 |
| 数学与正式成像 | Python、NumPy；本次环境 NumPy 2.4.6 | 变换、裁剪、覆盖、采样、光照、求交、曲面与数值探针 |
| 教材正文 | Markdown、markdown-it-py、mdit-py-plugins | 正文与公式解析、章节包含、演示插槽 |
| HTTP 服务 | Python 标准库 `ThreadingHTTPServer` | 正文、源码、演示目录、渲染接口与工程下载 |
| 书页与控件 | 原生 HTML/CSS/JavaScript | 阅读状态、参数、历史、布局与输入，无前端构建步骤 |
| 数学图 | Python 返回图元，浏览器绘制 SVG | 公式与图元对应、拖点、分步构造与缩放 |
| 二维视口 | Canvas 2D | 二维操作和视图反馈 |
| 三维视口 | Three.js 0.180.0 / WebGL | 三维观察、拾取、变换手柄和即时预览 |
| 数学与源码排版 | KaTeX 0.16.22、Prism 1.30.0，本地保存 | 公式排版、源码高亮 |
| 历史界面 | Panel 1.9.4、Bokeh 3.9.2 | 旧 `app.py` 和 `lab.py`；不是当前书页的主体 |
| 可选 GPU | 声明了 PyTorch `gpu` extra | 当前核心没有接入 MPS 渲染路径，GPU 非运行前提 |

上表是本机锁定环境和项目资源中的版本，不是对这些库最新版本的声明。依据：[依赖声明](../../pyproject.toml)、[前端资源清单](../../web/vendor/sources.json)、[服务入口](../../studio.py)、[渲染桥](../../studio_render.py)。

实际的数据流程有三条：

```text
书内操作 → 参数 JSON → Python 核心 → PNG + 几何 + 探针 → 浏览器展示
数学图操作 → /api/figure → Python 构造 → 图元 JSON → SVG
三维拖动 → Three.js 即时预览；同一组参数继续交给 Python 生成正式结果
```

因此，Python 后端确实负责成像与算法，并非只提供网页数据。与此同时，浏览器也确实使用 WebGL 做三维预览；不能把整个产品简单归类为“纯 Python 渲染界面”或“纯 WebGL 渲染器”。

## 3. 技术上的优点与实际负担

**适合继续保留的部分。** 各章核心是普通函数，可以单独阅读与测试；NumPy 能明确表达数学关系；正式像素与数值探针可相互核对；书页直接展示实际源码；无需 Node 构建服务。第 15 章将数学、成像、教学图分别保存在 `core.py`、`render.py`、`figures.py`，是清楚的职责划分。

**网络往返会影响正式结果的交互反馈。** 主演示连续输入以 75 ms 节流，并串行处理实际渲染请求；聚焦图也需要调用 Python 接口。三维预览可以即时响应，但正式结果需要等待计算、PNG 编码、JSON 传输与绘制。本地效果不能直接外推到公网。MPS 即使加速部分计算，也不会消除这些环节。依据：[主渲染请求](../../web/studio.js)、[聚焦图请求](../../web/teaching-figures.js)。

**框架依赖少，不等于交互实现已经简单。** 当前作者代码的几个主要文件如下。行数包含空行与注释，仅用于定位维护集中点，不作为质量评分。

| 文件 | 行数 | 关注点 |
| --- | ---: | --- |
| `web/viewport3d.js` | 2429 | 三维输入、观察、对象与操作柄集中 |
| `web/studio.js` | 1895 | 页面、参数、历史、渲染与源码状态集中 |
| `teaching_figures.py` | 1780 | 公共图元、注册与较多既有教学构造 |
| `web/teaching-figures.js` | 1015 | 图元呈现、交互与布局 |
| `studio_render.py` | 935 | 多章参数、场景组装与渲染分支 |
| `web/studio.css` / `web/editor-polish.css` | 2391 / 1118 | 基础样式与后续调整分散在不同层 |

下一步应首先明确这些职责的边界、统一控件和图示协议，而不是立即换框架或增加注册系统。章节专用渲染逻辑可以逐步归回章节目录，保留短小、直接的调用关系。

**默认依赖还有精简空间。** 当前新服务没有导入 Panel/Bokeh，但二者仍在默认环境中。未来可把旧界面依赖变成可选组；应同时显式声明主站依赖并调整旧界面测试，不能只删两个包就声称迁移完成。本轮没有修改依赖。

**看代码与改代码仍是两种体验。** 当前源码区是读取和高亮实际文件，不是书内 Python 执行环境。学生可以拖动参数和下载工程，但实现练习后还要在本地运行。这个断点与“学生直接在线体会和实现算法”的目标有关。

**本地服务尚不是公共计算服务。** `/api/render` 只有两个全局计算槽位，`/api/figure` 采用另一条调用路径；代码中未形成完整的跨用户作业队列、执行取消和计算配额方案。公开部署需要单独设计资源行为，但没有必要因此马上添加账号、数据库或庞大的后台。

## 4. 同类作品与借鉴方向

以下是代表性样本，不是完整市场清单。“接近程度”和“借鉴方向”是结合本项目目标作出的判断。

| 作品 | 与本项目的关系 | 已核实的形式与技术 | 建议借鉴；需要区分的范围 |
| --- | --- | --- | --- |
| [David Eck — Introduction to Computer Graphics](https://davidjeck.github.io/graphicsbook/index.html) | 最接近整本交互教材 | 在线教材、书内 live demos、可下载正文与源码；涉及 Canvas、OpenGL、Three.js、WebGL、WebGPU | 借鉴连续阅读、术语索引与书内示例组织。其课程也强调图形 API，核心不以 Python 为主。技术形式见 [源码与演示说明](https://davidjeck.github.io/graphicsbook/source/index.html)。 |
| [Computer Graphics from Scratch](https://www.gabrielgambetta.com/computer-graphics-from-scratch/) | 接近原理与最小实现路线 | 以光线追踪和光栅化为主，语言无关伪代码，沿正文链接交互示例 | 借鉴从小算法逐步组合渲染器；演示链接与当前项目的就地操作深度仍需分别比较，不能都称为完整编辑环境。 |
| [Scratchapixel](https://www.scratchapixel.com/) | 接近内容深度与数学解释 | 渲染、数学、几何、成像和程序生成教程；核对的基础光追例子要求本地编译 C++ | 借鉴数学到可执行代码的衔接；不能把它笼统描述成书内即时运行 Python 的平台。[基础光追实例](https://www.scratchapixel.com/lessons/3d-basic-rendering/introduction-to-ray-tracing/ray-tracing-practical-example.html)。 |
| [Bartosz Ciechanowski — Curves and Surfaces](https://ciechanow.ski/curves-and-surfaces/) | 视觉与交互叙事参照 | 正文中有大量直接操作图形，曲面控制点可拖动；本次实际打开并检查页面及浏览器脚本 | 借鉴画面中的直接操作、从曲线到曲面的概念迁移、一段解释对应一个操作问题。[Lights and Shadows](https://ciechanow.ski/lights-and-shadows/)也值得对照。它是专题文章体系，不是完整的 Python 图形学课程。 |
| [A Primer on Bézier Curves](https://pomax.github.io/bezierinfo/) | 几何专题交互教材 | 数学与编程并重，多数曲线图可操作；有中文部分翻译 | 借鉴曲线公式与几何构造的紧密对应、专题内的深度；范围主要围绕 Bézier 与相关曲线。 |
| [The Book of Shaders](https://thebookofshaders.com/?lan=ch) | 书内编辑与即时反馈参照 | 中文版本，片段着色器教学；glslCanvas 展示，glslEditor 嵌入正文，可编辑和分享 GLSL | 借鉴短代码与输出在同一位置联动；主要面向 shader，不等于完整传统图形学。[官方工具说明](https://thebookofshaders.com/04/?lan=ch)。 |
| [WebGL Fundamentals](https://webglfundamentals.org/) | 数学到浏览器实现的教程参照 | JavaScript/GLSL；从变换到纹理、阴影等主题；[透视一节](https://webglfundamentals.org/webgl/lessons/webgl-3d-perspective.html)把数学关系逐步写入代码 | 借鉴可独立理解的小示例和参数对照；它以 WebGL 学习为主，本项目的目标是算法原理与 Python。 |
| [Grappelli / UZH Computer Graphics Course](https://grappelli.ifi.uzh.ch/) | 三维教学编辑器的相邻形态 | 官方搜索索引介绍场景操作、顶点/片元 shader 编辑、错误提示与教学作业 | 可研究专业操作和作业组织。此次直接访问遇到证书域名不匹配，未实测运行；功能按公开介绍记录。其沙盒/作业平台形态不应替代本项目的电子教材主线。 |
| [Three.js Journey](https://threejs-journey.com/) | 商业课程与学习体验的相邻产品 | 付费课程，视频、示例工程与练习；面向 Three.js/WebGL，也有 WebGPU/TSL 内容 | 可研究效果示例、完成作品的学习动机和课程包装；其目标是制作网页 3D 项目，不是用 Python 从头解释基础渲染算法。 |

本次也用中文检索与 GitHub 查询检查了 GAMES101 相关资料。可确认的主线仍包括官方课程、作业实现与资源汇编；这些检索不能证明中文领域没有同类交互教材。官方 GAMES101 的定位是原理课程，明确区分图形学与某一个图形 API，适合作为内容范围参照：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。

这些样本说明：读者已有免费或付费的替代学习资源。“有三维演示”“有公式”“有源码”都不是单独足够的差异。中文、Python 核心、书内直接操作、数学中间量检查，以及可修改代码的统一学习流程，才是值得验证的组合；其中书内执行 Python 尚未实现。

本轮没有做用户访谈、流量调查或付费转化研究，不能由这些作品的存在推导市场规模、付费意愿或商业成功概率。

## 5. Python 在线运行的技术选项

Python 作为教学语言，与 Python 必须运行在服务器，是两个独立选择。

| 方案 | 优点 | 代价与适用判断 |
| --- | --- | --- |
| 保留现有本地 Python + 浏览器 | 算法与环境保持一致，读码和调试直接，短期改动最少 | 适合本地稳定版；分享给新读者仍需启动环境 |
| 将现有 Python 服务部署到服务器 | 可保留大量现有接口；读者无需本机 Python | 需实际处理网络延迟、并发、取消和计算预算；并非部署一个静态站点即可 |
| Pyodide + Web Worker 在浏览器运行 Python | Python 核心有机会复用；可减少远程逐帧请求，并支持本地浏览器内的代码实验 | 必须测初次加载、NumPy 兼容、内存、模块加载、跨语言数据传输与手机速度；不是所有现有模块无需改动即可运行 |
| marimo 的 WebAssembly 导出 | 已提供可交互 Python 文档与可编辑模式，可作为验证和练习工具 | 默认产品形态是 notebook/app；是否能融入既有书页、保持视觉与状态一致，需要验证，不建议直接整书迁移 |

Pyodide 官方文档说明可在 Web Worker 中运行 Python，以避免长计算阻塞页面主线程；Worker 不能直接操作 DOM，需要显式传递数据。[官方 Worker 文档](https://pyodide.org/en/stable/usage/webworker.html)。

marimo 官方提供基于 Pyodide 的浏览器执行，支持 NumPy 等包，并可导出运行模式或编辑模式；同时列出包兼容、资源加载和导出的限制。[WASM 运行](https://docs.marimo.io/guides/wasm/)、[交互 HTML 导出](https://docs.marimo.io/guides/exporting/webassembly_html/)。这是可行技术路线的证据，不是当前工程移植已成功的证据。

本次建议：保留 NumPy 核心与现有前端，先用单章验证浏览器 Python；不立即改用 React、重建后端、接入 MPS 或整体替换为 notebook。框架迁移应由已经测到的瓶颈驱动。

## 6. 建议的下一步

先完成一条完整、可对比的学习体验，再恢复大范围内容扩展。优先使用第 04 章重心坐标作为样章：数学规模小、现有核心清楚、拖点与插值关系可直接观察，也有独立测试可核对结果。

样章应让读者完成以下过程：提出颜色插值问题 → 拖动点并观察面积权重 → 定义并推导公式 → 定位 Python 求值函数 → 修改一个函数或表达式 → 立即比较结果 → 用退化或外部点检验理解。

将工作分成三个有明确产出的决策：

1. **教材与交互设计**：同一概念的文字、图、公式、数值和源码使用一致的对象与符号；概念图只显示当前需要的控制，综合演示保留较大探索空间。专业感来自可预测的操作与清楚的反馈，不靠增加面板数量。
2. **运行方式验证**：对同一组 Python 输入与结果，比较现有服务和浏览器 Worker 的正确性、首次加载、拖动响应、运行中断和恢复。保留原实现作为基线；未测量前不承诺性能提升。
3. **学习可用性验证**：找少量目标读者实际走完样章，观察能否解释公式、定位代码和修正错误，再决定将这一模式推广到其他章节。此项尚未开展。

这三个产出比先补齐所有章、继续堆参数或全量换技术栈更有助于判断项目方向。完整 GAMES101、公开部署和后续增量仍按既有规划保留，是否启动由后续任务决定。

## 调研方法与边界

- 本地：读取当前文件和锁定环境，运行全套测试，临时启动服务并抽查两章；代码未修改。
- 互联网：使用 agent-reach 的 Exa、Jina 和 GitHub CLI，结合官方文档读取及浏览器核对。检索后期 Exa 免费额度耗尽，补充页面直接从官方网站读取。
- 浏览器实际打开了 Bartosz 的曲线曲面页及 David Eck 教材首页；未声称逐一完成所有外部产品的互动测试。
- Grappelli 的公开介绍可以检索到，但本次证书错误使实时访问未完成。Graphics Codex 也出现在检索中，本次未完成实时页面核验，未纳入主要能力比较。
- 原始网页提取和临时浏览器记录位于 `/tmp/graphic-landscape-2026-11-01/`；本文件保存可持续使用的判断与来源链接。
