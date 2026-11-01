# 经典教材与阅读路线

本书的正文、程序、实验场景和矢量示意图独立编写。经典教材用于概念核查与延伸阅读；具体公式的出处列于相关章末。以下资料可按主题查阅，不作为操作书内实验的前置要求。

## 从技术演变理解本书的问题

图形学的历史可以沿“怎样表示、怎样操作、怎样成像”阅读。下表选取与本书直接相关的几个转折；它不是完整技术年表，也不以某项方法出现的年份判定其今天是否仍有价值。

| 技术节点 | 问题发生了什么变化 | 本书中的联系 |
| --- | --- | --- |
| Sutherland 的 Sketchpad，1963 | 图形不仅作为输出，也成为交互输入；对象及其几何约束可以由程序维护。 | [02](?chapter=transforms) 的坐标操作、[20](?chapter=deformation) 的约束形变。[MIT 原论文记录](https://dspace.mit.edu/entities/publication/b5e8025c-c8b2-4843-84e0-76db824e07e6) |
| Kajiya 的渲染方程，1986 | 将多种成像算法放回共同的光传输积分问题，再讨论怎样近似求解。 | [23–26](?chapter=radiometry) 从物理量、材质走到随机积分。[原论文](https://doi.org/10.1145/15886.15902) |
| Levoy 与 Hanrahan 的光场绘制，1996 | 输入可以是一组方向与位置上的图像样本，通过重采样合成新观察，而不总要先构造显式几何。 | [34](?chapter=computational-imaging) 的光场维度与重对焦。[作者资料](https://graphics.stanford.edu/papers/light/) |
| 以样本组织外观 | 将局部图像块的统计、匹配与接缝选择引入生成过程，表示不再局限于解析材料公式。 | [36](?chapter=texture-synthesis) 的纹理块拼接。[Efros 与 Freeman 的纹理合成资料](https://graphics.cs.cmu.edu/people/efros/research/quilting.html) |

这些路线共同提出了持续存在的研究问题：在有限预算下选择什么表示，怎样维持几何、光学与时间上的一致性，观测不足时应引入什么先验，以及怎样量化近似的代价。光栅化与路径追踪、几何模型与图像样本、物理模拟与作者控制可以互相配合，并非一种方法出现后其他方法就失效。

## 同一组基础怎样进入不同应用

| 应用场景 | 输入、约束与结果 | 对应学习路线 |
| --- | --- | --- |
| CAD 中编辑一张曲面 | 控制点与尺寸约束定义形状；接缝连续性、精度和可制造性比单张图的明暗更重要。可用有理曲面保留圆锥曲线，再生成显示网格。 | [13–14](?chapter=bezier) 的样条与连续性 → [16–20](?chapter=subdivision) 的离散表示与约束 |
| 科学数据的等值面 | 输入体素中的标量样本，选择阈值后构造表面；噪声、采样密度和拓扑会影响解释。平滑后的图像不能自动证明测量更准确。 | [12](?chapter=geometry) 的隐式表示 → [17](?chapter=fairing) 的平滑 → [21](?chapter=reconstruction) 的等值面 |
| 交互游戏的一帧 | 场景状态持续变化，需在时间预算内更新可见性、照明与姿态；帧间闪烁与响应延迟同样影响结果。 | [04–11](?chapter=barycentric) 的成像 → [27](?chapter=acceleration) 的查询加速 → [37–39](?chapter=keyframes) 的时间模型 |
| 电影镜头与数字合成 | 几何、材质、光源、镜头与动画共同生成序列，再进行合成与调色；更大的离线预算仍需控制噪声与帧间一致性。 | [24–26](?chapter=materials) 的材质与积分 → [28–29](?chapter=matting) 的合成 → [32](?chapter=lenses) 的镜头 |
| 计算摄像 | 输入是受光学、传感器与噪声限制的测量；估计图像或场景时，不能把先验补出的细节当成直接观测。 | [21](?chapter=reconstruction) 的几何测量 → [32–34](?chapter=lenses) 的光学、采样与反演 |

## 四种互补的视角

| 参考 | 内容侧重 | 公开材料与查阅范围 |
| --- | --- | --- |
| Marschner、Shirley，《Fundamentals of Computer Graphics》 | 从图像、几何和数学建立基础，再连接光栅化与光线追踪 | [第 5 版作者资源页](https://www.cs.cornell.edu/~srm/fcg5/)与作者课程入口；[GAMES101 官方大纲](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)逐讲列出第 4 版对应章节。此处用于查阅资源与对应目录。 |
| Hughes 等，《Computer Graphics: Principles and Practice》第 3 版 | 综合讨论表示、感知、数学和工程中的图像生成问题 | [出版社介绍与目录](https://www.pearson.com/en-us/subject-catalog/p/computer-graphics-principles-and-practice/P200000000336)，用于核对范围与组织。 |
| Pharr、Jakob、Humphreys，《Physically Based Rendering》第 4 版 | 数学与实际运行源码相邻；认真处理坐标、法线、采样、数值误差及物理量 | [公开全文目录](https://www.pbr-book.org/4ed/contents)。具体使用几何变换、颜色、相机、形状、采样和纹理章节；逐章阅读链接列在正文末。 |
| Akenine-Möller 等，《Real-Time Rendering》第 4 版 | 用渲染管线串起变换、着色、纹理、阴影与几何；区分不同方法的质量和代价 | [作者官方目录与资源](https://www.realtimerendering.com/)。目前用作范围与延伸阅读索引；没有复制书中的配图。 |

经典书之间的约定不完全相同。本教材统一采用右手世界、相机看 −Z、列向量、NDC z∈[−1,1]，数组行向下；引用材料采用其他约定时，在当章解释转换，不把某套约定说成唯一正确。

## 算法、源码与交互实验

[PBRT 的 literate programming 说明](https://www.pbr-book.org/4ed/Introduction/Literate_Programming)将程序解释与源代码放在一起。本书沿着这个方向，把同一个数值还连接到可操作的图形：拖动点、观察中间量、构造错误对照、写出函数，然后用一个未见过的例子检验。

正文中的源码视图读取实际算法文件；错误对照固定无关参数，仅改变所研究的因素；章末通过自查问题检验概念理解，基础篇另有留空函数编程练习。进阶模块的核心参考实现可直接修改和运行。

## 按问题阅读

| 本书主题 | 可直接访问的经典入口 | 阅读时追问 |
| --- | --- | --- |
| 像素、颜色、采样 | [PBRT 颜色](https://pbr-book.org/4ed/Radiometry%2C_Spectra%2C_and_Color/Color)、[采样与重建](https://pbr-book.org/4ed/Sampling_and_Reconstruction) | 这个数是线性光强、编码值还是一组样本？ |
| 变换与法线 | [PBRT 变换](https://pbr-book.org/4ed/Geometry_and_Transformations/Transformations)、[应用变换](https://pbr-book.org/4ed/Geometry_and_Transformations/Applying_Transformations) | 点、方向、法线为什么要区别对待？ |
| 相机 | [PBRT 投影相机](https://pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models) | 投影后哪一步除以 w？裁剪在它前面还是后面？ |
| 光栅化、插值、深度、基础光照 | [GAMES101 官方逐讲资料](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html) | 每一步接收什么数组，又产生什么数组？ |
| 纹理 | [PBRT 纹理采样与抗锯齿](https://pbr-book.org/4ed/Textures_and_Materials/Texture_Sampling_and_Antialiasing) | 一个像素在纹理上覆盖多大区域？ |
| 射线与成像 | [Ray Tracing in One Weekend 作者在线版](https://raytracing.github.io/books/RayTracingInOneWeekend.html) | 求交点、选择最近交点和给交点着色是三个怎样连接的步骤？ |

基础阅读记录：2026-09-22；进阶阅读路线补充：2026-11-02。几何处理、图像编辑、光场、风格化与动画的原始文献直接列在相应章节。链接作为出处与延伸阅读，本书的运行不需要下载这些教材。外部链接可能变更，程序和教学正文保存在本项目内。

## 配图原则

数学示意图由各章 `figures.ts` 根据当前参数生成，图形与读数调用同一份教学算法。今后引入真实照片或外部图表时，随图保存作者、来源、许可和所做修改；配图必须解释某个现象，而不只是填补留白。
