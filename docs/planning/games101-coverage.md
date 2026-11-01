# GAMES101 全课程覆盖矩阵

> **实施状态：扩展暂缓，保留 TODO。** 2026-09-24 起先维护现有 15 章的本地稳定版。下表继续记录最终目标与缺口，完整课程覆盖不作为当前稳定版的交付条件；恢复扩展后按此表推进。当前范围见 [实施路线](../../ROADMAP.md)。

核对日期：2026-09-24。本文是范围与缺口清单，不是全课程完成声明。当前 15 章包含 54 个聚焦演示、15 个综合演示，共 69 个，另有 35 个 TODO 练习。第 15 章本批加入张量积曲面、局部微分与整边连续性约束；第 11 章已有 C0/G1/C1/C2 拼接、B-spline 局部控制和有理圆弧；第 14 章此前实现经纬图/立方体环境查询、镜面方向、格点 value noise 与有限 octave 合成；其实际范围见 [纹理函数正文](../../courses/graphics-foundations/modules/03-surface-and-sampling/14-texture-functions/lesson.md)。此前的 [坐标、表面与时间扩展记录](../verification/foundations-gap-expansion.md)及 [管线扩展记录](../verification/pipeline-expansion.md)保留为历史证据，不代表本批整书验收。整体界面设计与全课程覆盖仍未验收。

课程基线采用闫令琪老师 2020 年 [GAMES101 官方大纲](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)及其 22 份官方讲义。全课包含光栅化、几何、光的传播、动画与模拟四个部分；**动画与物理模拟、路径追踪、真实相机和颜色感知都属于必修基线**。当前的 15 章是可复用的基础教材，不能据此声称已覆盖 GAMES101。

本批整书测试 470 项通过；新增曲面的数学、渲染与交互验证范围见 [曲面记录](../verification/surfaces.md)。此前样条、25 个曲线操作柄、主视口尺度、公式及模拟触屏的检查保留在 [样条与界面记录](../verification/splines-and-instruments.md)，第 14 章的检查保留在 [纹理函数扩展记录](../verification/texture-functions.md)。这些证据只覆盖各记录中的操作，不关闭整讲或全书验收。

## 核对口径

- **已实现**：该行明确列出的数值主线已有正文、可读 Python、可运行交互和相应数学验证；仍允许后续改善编排与表达。这不是对所有浏览器、性能或出版质量的验收结论。
- **部分**：有可以实际运行的子主题，但本讲的重要知识或实验尚未交付。文中出现一个名词、提供阅读链接或显示相近效果，不算覆盖。
- **待建**：现有章节不能形成这一讲的学习闭环。旧章节可能提供先修算法，不等于该讲已完成。

讲义实际分课与网页短标题有交叉：深度测试实际进入第 7 讲；高光与着色频率主要在第 8 讲；第 10 讲先继续纹理应用；第 14 讲开始辐射度量学。下表按实际讲义内容核对，不机械复制网页标题。无需把一本书限制成 22 章，也无需逐页复刻讲义。

“最低交付”是本书对原课知识深度的转译：主要算法必须可以操作和检查；原课以概览方式介绍的主题也必须讲清楚，但不强行扩成工业实现。所有建议的数值核心均用 Python，浏览器负责输入、展示和操作预览。前端预览不能被当作 Python 算法完成的证据。

## 现有章节证据索引

下表的旧编号仅用于定位现有文件，不预先决定新版书的章节编号。目前实际阅读顺序为 01、02、03、04、08、05、06、07、14、09、13、10、11、15、12。采样紧接光栅覆盖，14 将 UV 查询扩展到方向与位置函数，再由 09 转入深度纹理比较；13 在阴影之后、几何表示之前串联完整管线。稳定文件编号不等于阅读位置。

| 编号 | 已有可复用内容与证据 |
| --- | --- |
| 01 | [像素与颜色](../../courses/graphics-foundations/modules/01-images-and-space/01-pixels/lesson.md)：像素中心、数组、实际采样位置、线性 RGB 与 sRGB；`core.py` 有采样和颜色转换。 |
| 02 | [坐标与变换](../../courses/graphics-foundations/modules/01-images-and-space/02-transforms/lesson.md)：二维/三维向量、齐次变换、Rodrigues、镜像/错切；`linear3d.py` 给出偏移镜面与简单错切，`hierarchy.py` 给出带原点的一般变基、退化诊断、父子矩阵与两连杆 FK。三个投影视图共享实际三维数组，世界点与局部坐标分开。 |
| 03 | [相机与投影](../../courses/graphics-foundations/modules/01-images-and-space/03-camera/lesson.md)：look-at、透视/正交、齐次裁剪和 viewport；实际成像相机和场景物体可以直接操作。 |
| 04 | [重心坐标](../../courses/graphics-foundations/modules/02-rasterization/04-barycentric/lesson.md)及[光栅补充正文](../../courses/graphics-foundations/modules/02-rasterization/04-barycentric/raster-lesson.md)：有向面积、插值、逐像素覆盖、共享边规则与三角形裁剪；`raster.py` 被后续章节复用。 |
| 05 | [深度与遮挡](../../courses/graphics-foundations/modules/02-rasterization/05-depth/lesson.md)：相交三角形、绘制顺序、逐像素候选、深度量化和投影深度。 |
| 06 | [法线与光照](../../courses/graphics-foundations/modules/03-surface-and-sampling/06-lighting/lesson.md)：解析椭球、逆转置法线、Lambert、点光源衰减和 Blinn–Phong 高光；[mesh_shading.py](../../courses/graphics-foundations/modules/03-surface-and-sampling/06-lighting/mesh_shading.py) 用同一网格、覆盖与公式比较 Flat/Gouraud/Phong，并返回原三角形权重、法线和真实求值次数。 |
| 07 | [UV 与纹理](../../courses/graphics-foundations/modules/03-surface-and-sampling/07-textures/lesson.md)：透视插值、mip/LOD、长轴 taps、ripmap 与离散椭圆 Gaussian 参考。`surface_maps.py` 增加带模型单位的高度偏导、切线法线编码/解码与 Bump/真实位移，比较实际覆盖与深度；不是完整 EWA 或自阴影系统。环境与程序纹理由 14 接续。 |
| 14 | [纹理函数](../../courses/graphics-foundations/modules/03-surface-and-sampling/14-texture-functions/lesson.md)：经纬/立方体方向编码、环境旋转与镜面球查询；`procedural.py` 给出确定性二维/三维 value noise、五次 fade、有限归一化 octave 合成和 object/world 平移对照。环境在无限远，立方体仅面内双线性；程序噪声不是 Perlin，有限合成没有足迹过滤，不构成完整材质或 GI。 |
| 08 | [采样与抗锯齿](../../courses/graphics-foundations/modules/03-surface-and-sampling/08-sampling/lesson.md)：空间覆盖、卷积/频谱、SSAA/MSAA 与 owner/depth/color 缓冲；`temporal.py` 增加八叶轮同帧反转、真实时刻快门求积与逐像素 sinc 参考，分别说明帧间混叠和有限求积误差。 |
| 09 | [阴影映射](../../courses/graphics-foundations/modules/04-shadows-and-geometry/09-shadows/lesson.md)：两遍渲染、光源深度、bias 和逐比较 PCF；PCF 不等于面积光源的物理半影。 |
| 13 | [一条可检查的光栅管线](../../courses/graphics-foundations/modules/03-surface-and-sampling/13-pipeline/lesson.md)：独立 Python 顶点/片元程序，连接模型/世界/观察/clip、裁剪、覆盖、透视属性、深度与颜色；[core.py](../../courses/graphics-foundations/modules/03-surface-and-sampling/13-pipeline/core.py) 返回原三角形权重和候选深度，比较 early/late-depth 工作量，另用线性 source-over 演示混合顺序。它不模拟 GPU 调度或完整透明渲染。 |
| 10 | [几何表示](../../courses/graphics-foundations/modules/04-shadows-and-geometry/10-geometry/lesson.md)：同一椭球的参数、隐式和网格表示、切片、法线、离散误差；提高经纬网格分辨率不等于细分曲面算法。 |
| 11 | [曲线与样条](../../courses/graphics-foundations/modules/04-shadows-and-geometry/11-bezier/lesson.md)：de Casteljau、Bernstein 基、导数、凸包、曲线分割和弧长参数；`splines.py` 补入按时长约束的 C0/G1/C1/C2、Cox–de Boor、重复结点单侧导数、正权有理 Bézier/B-spline 求值。三个新演示操作接头、局部支撑和精确圆弧。 |
| 15 | [曲面](../../courses/graphics-foundations/modules/04-shadows-and-geometry/15-surfaces/lesson.md)：张量积 Bézier、两轮 de Casteljau、偏导、定向法线、正则性和平均/高斯曲率；可编辑控制网与 C0/G1/C1/C2 整边约束。Python 用有限网格计算覆盖/深度，在恢复的 UV 处解析求法线与曲率；像素探针区分网格点与精确曲面点。G1 是局部正比例的充分构造，不是一般曲面 G1 判定器。 |
| 12 | [基础光线追踪](../../courses/graphics-foundations/modules/05-raytracing/12-rays/lesson.md)：针孔射线、球/平面求交、阴影、有限镜面反射、逐跳贡献和光栅对照。局部经验高光与镜面递归没有实现路径追踪、微表面或介质传播。 |

## 逐讲覆盖与交付要求

### 01–09：图像、空间、光栅化与表面采样

| 官方讲义与核心子主题 | 当前状态 / 可复用章节 | 尚缺什么 | 最低交付与书内交互 | Python 核心方向 |
| --- | --- | --- | --- | --- |
| [01 · 概述](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_01.pdf)：图形学的生成任务、应用和四大部分；与其他图像学科的边界。 | **部分**；旧 01 提供图像入口，旧 12 可对比两种成像方式。 | 没有把形状、表面、相机、光、时间组成一个完整问题；动画主线缺席。 | 同一个简洁场景依次切换线框、可见性、局部光照、间接光、运动；点击贡献可进入对应章节。明确每个阶段新增了什么问题。 | 用后续章节已实现的函数生成同场景结果；尚未完成的阶段显示真实建设状态，不用录制图片冒充交互。 |
| [02 · 向量与线性代数](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_02.pdf)：向量、单位化、点积、叉积、矩阵运算、转置/逆与正交基。 | **部分（数值主线已补）**；02 已有三维向量、点积/叉积和一般非正交变基，固定世界点可改变原点与基。 | 新增变基已有指定浏览器操作证据，整章衔接与完整布局仍需评审；一般基与相机正交轴仍需结合后章复核。 | 同步 XY/YZ/ZX 编辑点、原点或基，比较 solve 与错误的转置结果；允许退化与近奇异并明确显示状态。 | `spatial.py` 和 `hierarchy.py` 的 `world_to_local`、`local_to_world`、`basis_diagnostics`；正交特例与独立手算验证。 |
| [03 · 二维与三维变换](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_03.pdf)：缩放、旋转、反射、剪切、齐次平移、复合与逆。 | **部分（数值主线已补）**；02 已有二维顺序、三维镜像/错切、一般变基与两连杆层级，03/13 可操作模型 TRS。 | 新增交互已有指定浏览器证据，整章布局仍需评审；二维 FK 不等于任意骨骼系统，也未实现世界/局部操作柄的完整场景编辑器。 | 对照镜像保距/反手性、错切保体积；固定世界点变基；改父角带动整条链，改子角保持父杆和肘不动。 | `core.py`、`spatial.py`、`linear3d.py`、`hierarchy.py`；列向量、矩阵乘序、局部与世界平移及杆长不变量。 |
| [04 · 模型、视图、投影](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_04.pdf)：三维旋转、模型/相机变换、正交和透视、观察空间。 | **部分**；03 的相机/投影/裁剪，02 的 Rodrigues 推导，以及13的完整模型—像素链已接入。 | 现有三视图拖动与管线回溯已有交互证据，跨单元的完整空间联动和整体布局仍需设计验收；四元数概念导入及其与旋转插值的关系尚待补充。 | 02 用平行/垂直/叉积三项构造任意轴旋转；13 对命中像素返回原三角形的模型、世界、观察和 clip 顶点，再接屏幕覆盖与属性。 | 复用 `look_at`、投影、裁剪与 `rotate`/`rotation_matrix`，13 用 `vertex_stage()` 返回各阶段坐标。四元数完整插值放动画部分。 |
| [05 · 三角形光栅化](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_05.pdf)：屏幕/帧缓冲、三角形、像素中心采样、内外测试、包围盒与边界。 | **已实现（数值主线）**；旧 01、03、04。 | 需要把 04 主文与光栅补充正文整合，并在锯齿出现处自然引向采样章。 | 保留可拖三角形、逐样本覆盖、共享边归属与帧缓冲放大；增加包围盒扫描与全屏扫描的计数对照即可，不必重写核心。 | 复用边函数、top-left 规则、齐次裁剪；显示真实候选/覆盖次数。 |
| [06 · 抗锯齿与采样](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_06.pdf)：空间/时间混叠、傅里叶视角、卷积与滤波、先滤波再采样、面积覆盖和多样本。 | **部分（数值主线已补）**；08 已有覆盖、卷积/频谱、SSAA/MSAA，本批加入真正的轮面时间混叠与快门积分。 | 新增时间演示的指定浏览器交互已验证，整体阅读体验仍需评审；无历史帧 TAA，盒式快门与有限样本也不能消除一切混叠。 | 8 叶轮 +1 rev/s 在 12 fps 对照 −0.5 rev/s；拖真实时间、速度和居中快门窗，比较瞬时/中点求积/解析参考。 | `multisample.py` 保持覆盖与着色分离；`temporal.py` 在真实时刻求值完整线性图像，并用 cosine/sinc 解析平均独立验证。 |
| [07 · 深度与基础光照](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_07.pdf)：画家算法、Z-buffer、局部着色、Lambert 与点光衰减。 | **已实现（数值主线）**；旧 05、06。 | 主要是编排和两章之间的解释：可见表面的选择与该点的颜色计算是不同步骤。 | 同场景切换绘制顺序/深度测试，再拖光源观察余弦和距离项；像素检查器连接“谁被选中”和“该点如何变亮”。 | 复用深度缓冲、法线与光照函数；防止把局部着色中的 ambient 常数解释成真实间接光。 |
| [08 · 着色频率、管线与纹理](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_08.pdf)：Blinn–Phong、逐面/顶点/像素着色、法线插值、管线和 UV。 | **部分（数值主线已补）**；06 提供 Flat/Gouraud/Phong，07 提供 UV，13 新增可编程 Python 管线和像素回溯。 | 新章指定交互已通过，整条阅读体验与界面设计仍未验收；Python 参考程序不模拟 GPU 并行调度、缓存或带宽。 | 13 可改变顶点波动/片元函数模式并比较早期深度测试的实际求值数，探针返回原三角形、属性权重和候选写入；阶段播放高亮完整帧的阶段数据，不冒充硬件执行追踪。 | 06 `mesh_shading.py`；13 [core.py](../../courses/graphics-foundations/modules/03-surface-and-sampling/13-pipeline/core.py) 的 `vertex_stage`、`fragment_stage`、`interpolate_depth`、`render_frame`、`inspect_pixel`；另用 `source_over` 说明线性混合。 |
| [09 · 插值与纹理过滤](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_09.pdf)：重心、纹理放大/缩小、双线性、mipmap、LOD、三线性、各向异性足迹。 | **部分（数值主线已实现）**；04、07、08。07 本批加入双轴 ripmap 与离散椭圆 Gaussian 参考，补上四层混合、方向、支撑及真实原纹素权重。 | 完整 EWA 的金字塔选择、重建核合并和工作量控制未实现；不得把离散参考核改名为生产级 EWA。新图实际拖动、公式和源码跳转已验证，视觉设计与全设备体验仍未验收。 | 拖 UV、双轴 LOD 和椭圆方向/跨度，联动查询颜色、原纹素权重、clamp 累积与退化回退；现有主场景仍比较双线性/三线性/长轴有限 taps。 | `core.py` 的 Jacobian、mip/LOD/长轴 taps，另有 [footprint_filters.py](../../courses/graphics-foundations/modules/03-surface-and-sampling/07-textures/footprint_filters.py) 的 `build_ripmap`、`ripmap_probe`、`ripmap_weights`、`ellipse_filter`；各核的含义与适用范围分开说明。 |

### 10–16：几何与光的传播

| 官方讲义与核心子主题 | 当前状态 / 可复用章节 | 尚缺什么 | 最低交付与书内交互 | Python 核心方向 |
| --- | --- | --- | --- | --- |
| [10 · 纹理应用与几何表示](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_10.pdf)：环境贴图、凹凸/位移、程序纹理；隐式/显式、CSG、距离场、水平集与分形。 | **部分（纹理应用子项已实现）**；07 有解析高度、法线数据、Bump/真实位移；14 新增经纬/立方体环境映射、value noise 与有限 fBm 合成；10 提供基础几何表示。 | CSG、距离场、水平集与分形几何仍缺。环境查询没有 GI、粗糙度预过滤或跨立方面无缝过滤；程序噪声不是 Perlin，有限合成不声称无限分形或严格带限。位移仍受网格采样限制，无凹槽自阴影。 | 已可拖环境方向/法线、格点位置、程序尺度及物体平移，检查实际地址、四角权重、各层贡献和 object/world 球面外观；后续补 CSG 剖面、距离场与几何分形，整讲仍保持部分状态。 | 07 `surface_maps.py`；14 `core.py` 的 `direction_to_latlong`、`direction_to_cube`、`reflect`、`render_sphere`，以及 `procedural.py` 的 `value_noise`、`fbm_parts`、`fbm`。SDF、CSG 等几何主线待建。 |
| [11 · 显式几何、曲线与曲面](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_11.pdf)：点云/网格与 OBJ，Bézier、分段连接、连续性、样条概念、双三次曲面。 | **部分（曲线与双三次曲面基础已补）**；10、11、15。 | 点云/OBJ 与更多几何表示仍缺；已有有理曲线求值与多项式曲面不等于完整 CAD，有理曲面、裁剪曲面及自适应网格尚未实现。 | 11 可拖接头、局部控制和有理权重；15 在书内直接编辑两块 4×4 控制网，观察等参线、法线、曲率和约束联动。后续加入点云/网格表示。 | 11 的样条函数已实现；15 的 `evaluate_patch`、`de_casteljau_patch`、`surface_partials`、`surface_frame`、`patch_mesh`、`stitch_patches`、`join_diagnostics` 提供张量积与曲面约束。最小 OBJ 读写待建；C1/C2 换算参数跨度，G1 仅采用正比例的充分构造。 |
| [12 · 网格处理与阴影](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_12.pdf)：Loop、Catmull–Clark、边折叠/QEM、网格规则化、shadow map 与软硬阴影。 | **部分**；旧 09 的阴影主体已实现，旧 10 可提供网格。 | 没有拓扑细分、简化、QEM 或规则化实验；经纬分辨率滑杆不能填补这些主题。 | 逐步显示旧点/边点/面点及更新权重；选一条边比较折叠代价、面数和形状误差；保留阴影两遍渲染与 bias 对照。 | 可读邻接构造、Loop/Catmull–Clark 一步规则、单边 QEM 与迭代折叠。规则化讲目标与基本操作，不引入大型网格框架。 |
| [13 · 基础光追与求交](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_13.pdf)：眼射线、Whitted 反射/折射、球/平面/三角形交点、Möller–Trumbore、包围体和 slab。 | **部分**；旧 12 的球/平面、阴影和镜面反射已实现。 | 缺三角形求交、AABB、折射和全反射；目前只用解析球/平面，不能表示一般网格求交。 | 同一条可拖射线穿过球、三角形和盒子；显示 t 区间与重心；玻璃界面联动入射/折射/反射，后续材质章解释 Fresnel 权重。 | Möller–Trumbore、稳健 slab、Snell 折射及介质进出状态；与已有逐跳追踪共享命中记录。 |
| [14 · 加速结构与辐射度量入门](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_14.pdf)：均匀网格、KD-tree/BVH、遍历；能量/功率、辐射强度和立体角。 | **待建**；旧 12 可复用射线接口。 | 没有空间/物体划分或遍历；没有带单位的光量与方向积分。 | 拖射线逐节点观察剔除与命中，显示实际包围盒/三角形测试次数；对比分布均匀与集中场景。另用球冠面积解释立体角。 | 网格步进、教学 KD-tree、median-split BVH、遍历计数；单位球面积/立体角数值积分。先直观再谈复杂度，不用帧率替代算法计数。 |
| [15 · 辐射度量、BRDF 与渲染方程](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_15.pdf)：irradiance/radiance、反射方程、发射/间接光、算子展开和概率基础。 | **待建**；旧 06 的余弦与距离项是先修。 | 缺量纲链、方向面积、BRDF 定义与积分、递归入射光；旧 ambient 常数不等于全局光照。 | 改变接收面朝向/面积/距离分别看各光量；拖半球方向联动 BRDF 与积分贡献；分开显示发射、直接、一次和多次间接光。 | 单位明确的辐射量、Lambert BRDF、半球确定性积分作参考、有限反弹贡献；给出随机变量、期望和 PDF 的可操作入门。 |
| [16 · 蒙特卡洛与路径追踪](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_16.pdf)：积分估计、PDF 权重、随机路径、像素采样、Russian roulette、显式光源采样与可见性。 | **待建**；旧 08 的采样位置与旧 12 的求交可复用。 | 没有 f/p 估计器、漫反射间接光、概率终止、面积光源或渐进累积；有限镜面反射不算路径追踪。 | 拖 PDF 看样本与每个 f/p 权重；固定随机种子比较两种采样的均值/方差；书内小场景逐样本变清晰，点击像素检查完整随机路径与贡献。 | NumPy RNG、半球采样、throughput、面积/立体角 PDF 换元、RR、直接光采样。小分辨率渐进累积，清楚区分截断偏差、方差与性能。 |

### 17–22：外观、成像、颜色与运动

| 官方讲义与核心子主题 | 当前状态 / 可复用章节 | 尚缺什么 | 最低交付与书内交互 | Python 核心方向 |
| --- | --- | --- | --- | --- |
| [17 · 材质与外观](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_17.pdf)：漫反射/光泽/理想镜面与透射，Snell/全反射/Fresnel，微表面，各向异性，BRDF 性质与测量。 | **部分**；旧 06、12 只有经验局部光照与有限镜面反射。 | 没有物理 BRDF/BSDF、粗糙度模型、介质/导体区别或测量视角。调高光指数不能叫微表面材质。 | 球面 BRDF 波瓣与实际材质球联动；拖入射方向看 Fresnel/全反射；旋转切线方向看各向异性；检查非负、互易与能量积分。 | Lambert、理想反射/折射、Fresnel、可读微表面 D/F/G 和各向异性分布。用小型合成角度表演示测量/查表，明确不是实测数据库。 |
| [18 · 高级传播与复杂外观](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_18.pdf)：BDPT/MLT/光子映射/VCM/即时辐射度；介质、毛发/皮毛、颗粒、BSSRDF、织物、闪烁细节、波动光学与程序外观。 | **待建**。 | 当前球面经验材质不能代表上述复杂外观；也没有路径策略、偏差/一致性或表示尺度的比较。 | 至少提供路径策略图、密度估计、雾中传播、纤维截面、次表面出射、细节尺度与干涉等可操作的简化实验；逐项要求见下文。 | Python 计算路径、散射、密度和简化光学；原课概览主题使用明确标注的教学模型，不把它们称为完整工业算法。 |
| [19 · 相机与透镜](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_19.pdf)：焦距/画幅/FOV、曝光、快门/光圈/ISO、运动模糊/滚动快门、薄透镜、弥散圈与景深。 | **部分**；03/12 提供针孔/FOV，08 新增居中盒式快门的归一化时间平均与解析参考。 | 尚无有限孔径、焦平面、真实能量曝光/传感器增益或滚动快门；时间平均不能替代真实相机单元。 | 当前拖动快门窗与时间样本；后续拖焦平面联动射线、弥散圈及失焦图，比较光圈/快门和滚动读出。 | 已有 `temporal.py` 的真实时刻求积；后续补薄透镜、曝光能量和简化噪声，明确 ISO 不增加光子。 |
| [20 · 光场、颜色与感知](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_20.pdf)：全光函数/四维光场、视图合成与重聚焦；光谱/视锥、同色异谱、配色、XYZ/xy/色域、HSV/Lab/CMYK 与感知。 | **部分**；旧 01 只有 RGB、线性光和 sRGB。 | 颜色的物理输入与人的响应未建立；光场和多视角采样不存在。Gamma 知识不能替代颜色科学。 | 拖双平面参数观察同一条光线；合成小相机阵列后交互重聚焦。另拖光谱，看 XYZ/显示 RGB 与色域；构造两种不同光谱却相同三刺激值。 | 轻量合成光场数组、shift-and-sum；离散光谱积分与注明来源的配色函数、颜色空间变换、明确色域外处理。区分数据和屏幕可显示近似。 |
| [21 · 动画、弹簧与运动学](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_21.pdf)：关键帧、物理动画、质点弹簧/阻尼/布料、粒子系统、FK/IK、rigging/blendshape/mocap。 | **部分（仅先修 FK）**；02 的两连杆建立父子矩阵、局部/世界角度和正向末端；11 的曲线仍可作插值先修。 | 无关键帧时间状态、IK、关节限制、蒙皮、动力学或数据驱动动画；规定一个旋转速度不等于动画系统。 | 已有基座、父角、子角和杆长操作；后续加时间轴、末端 IK、可达域、弹簧/布料与表情形变。 | 复用 `hierarchy.py` 的两连杆 FK；后续补关键帧、IK、Hooke 力/阻尼、粒子更新、blendshape 与 mocap 数据流程。 |
| [22 · ODE、刚体与流体](https://sites.cs.ucsb.edu/~lingqi/teaching/resources/GAMES101_Lecture_22.pdf)：显/隐式 Euler、中点/改进 Euler、自适应步长/RK/Verlet、误差与稳定性；刚体、流体、Eulerian/Lagrangian/MPM。 | **待建**。 | 没有积分器、时间步实验或守恒量检查；没有刚体/流体概念与可操作模型。 | 同一振子在同一步长比较轨迹/能量/爆炸；拖偏心力看刚体平移与转动；粒子流体显示密度/约束修正，切换粒子与网格观察方式。 | 最小积分器与解析振子参考、线性弹簧隐式解、2D 刚体质量/惯量/力矩、简洁位置约束流体。解释 MPM 的粒子↔网格传递；不把完整 Navier–Stokes/FEM 求解器强加给概论。 |

## 后六讲的深度边界

后六讲不能删去，但也不能因为标题涉及复杂方法，就把全书变成高级渲染/仿真研究课。

- **17**：必须建立材质模型和测量描述的区别；理想反射、微表面近似与真实材料样本不是同一层次。必须实现足以检查角度、粗糙度、折射率和能量的模型。
- **18**：高级算法与复杂外观按官方讲义逐项核对，侧重路径机制、困难场景、适用性和可见结果。完整工业算法可以延后，其基本概念和明确标注的简化实验不能缺席。
- **19**：针孔模型、薄透镜和真实复合透镜分开描述。最低实现是薄透镜和曝光；完整镜头设计及高精度像差追迹不是原课的编程要求。
- **20**：颜色显示受屏幕限制；教学数据必须同时提供光谱/三刺激值与显示近似。光场示例采用 Python 生成的小型多视角数据，不需要神经表示。
- **21**：关键帧、运动学、物理驱动和数据驱动四种来源需要被比较。至少关键帧、弹簧与 IK 有可直接操作的程序；mocap 需讲流程与限制，不能用“以后选修”带过。
- **22**：重点是状态、导数、离散时间、误差、稳定性与不同物质表示。刚体与流体必须有入门实验；完整接触求解、湍流、连续体力学可留作真正进阶。

第 18 讲范围尤其容易被“PBR 材质球”错误代替，最低核对项如下。以下讲义主题都属于基线，深入实现才可能成为增量。

| 讲义页码 | 基线必须说明 | 适合本书的最小交互与边界 |
| --- | --- | --- |
| 4–18 | 无偏/有偏/一致性；BDPT 从两端构造，MLT 扰动路径，光子映射先发射再估计密度，VCM 连接/合并，IR 使用虚拟点光源。 | 同一个二维困难路径图切换构造方式；拖密度估计半径观察偏差/噪声。说明策略为何帮助某类路径，不用玩具示意宣称完整实现了 BDPT、MLT 或 VCM。 |
| 20–29 | 参与介质的吸收、散射、相函数与自由程。 | 可拖光源穿过雾，联动透射衰减、散射角分布和一次散射积分；明确是否包含多次散射。 |
| 30–51 | Kajiya–Kay 与 Marschner 毛发模型的层次；纤维内反射/透射；动物皮毛髓质与双圆柱区别；颗粒的显式/程序表示。 | 可操作纤维截面显示不同路径与吸收；切换有无髓质，解释粗糙经验高光无法表达的差异；颗粒用小区域比较逐粒与统计描述。 |
| 52–69 | BSSRDF 允许入射和出射不在同一点，dipole 是扩散近似；织物可用表面、体介质或显式纤维表示。 | 移动表面入射点观察出射分布；拉近织物观察“表面材料”近似何时失去细节。必须标记近似的有效尺度，不能只给发光边缘特效。 |
| 70–96 | 统计微表面分布与有限像素内实际法线分布的区别；闪烁细节/困难采样；波动光学超出几何光学的相位现象。 | 缩放像素足迹时联动有限微面的直方图与高光；一个波长/相位可调的简单干涉实验说明几何光线模型的边界，不要求全波求解器。 |
| 97–104 | 程序外观通过函数定义空间细节，尺度和采样决定可见结果。 | 14 已提供 value noise、有限 octave 合成、三维切片与 object/world 球面对照，频率和层数可操作；足迹过滤与完整程序材质仍待补。有限噪声叠加不等于完整材质模型或无限分形。 |

## 基线之上的增量

以下增量必须与上述基线分开管理。不能把 BVH、微表面、路径追踪、薄透镜、颜色或动画重新包装成“本书新增知识”。

| 增量方向 | 超出基线的部分 | 交付形式 |
| --- | --- | --- |
| 可检查的推导链 | 把公式、代码、几何与每个样本的贡献永久连在一起；不只是展示最后图像。 | 选中像素/面/路径即定位该次 Python 中间量和相关代码；保持完整源文件可读。 |
| 数值稳健性 | 系统比较裁剪退化、近似阈值、深度精度、浮点误差、射线偏移与网格边界。 | 可触发的反例、误差图、精度切换及独立参考值；每项标清有效条件。 |
| 估计器与优化的深入实验 | 原课已有 MC 和高级路径策略；增量是更完整的推导、实现、方差/代价实测，例如 MIS 的系统实现和评估、BVH 的 SAH 与构建/遍历权衡。 | 固定种子与样本预算的对照、置信信息、真实计数和可复现实验记录。 |
| 成像一致性 | 跨章节用同一场景比较光栅/射线、解析/离散、不同采样器，明确何时应一致、何时模型本来不同。 | A/B 对照、差值和误差随分辨率/样本数变化的曲线。 |
| 性能与轻量实现 | 从普通 NumPy 出发测量广播、分批、数据布局和缓存；需要时再引入可选 MPS/GPU 路径。 | CPU 参考保持可运行；单独记录编译、计算和传输耗时，避免为了演示增加重型默认依赖。 |
| 更完整的综合作品 | 让学生把形状、材质、相机、照明和运动组合成可复现的小场景。 | 一份普通 Python 场景脚本、保存参数、可导出图像/动画，仍从教材正文进入。 |

## 统一验收条件

每个主要教学单元至少有“明确问题 → 可操作现象 → 数学解释 → 可读 Python → 自检/反例”的闭环；一个章节可以有多个短演示，不能为了章节数量把不同问题挤进一个参数面板。

1. **内容**：矩阵对应子主题逐项有实际落点，前置数学在首次需要时解释，后续链接能回访。
2. **数学**：约定、单位、有效条件与简化假设写清楚；关键结果有可手算情形或独立参考。
3. **代码**：主算法在 Python 普通函数中可读、可单独运行；教材显示完整高亮源代码，不把框架桥接当作教材核心。
4. **交互**：主要变量能在场景中直接操作；暂停/分步/重置/撤销和必要的数值检查服务于当前问题，操作说明统一折叠。
5. **真实性**：静态截图、浏览器预览和 Python 正式输出分别标明；耗时算法采用真实渐进计算，不伪造实时结果。
6. **状态**：正文、代码和交互缺任意一项，保留“部分”；仅创建目录、写提纲或添加目录项不得标记完成。

矩阵更新时应附具体文件与验收证据；不以“新开了多少章”或“出现了多少术语”计算课程完成度。
