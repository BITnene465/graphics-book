# 经典教材与阅读路线

本书的正文、程序、实验场景和矢量示意图独立编写。经典教材用于概念核查与延伸阅读；具体公式的出处列于相关章末。以下资料可按主题查阅，不作为操作书内实验的前置要求。

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

正文中的源码视图读取实际算法文件；错误对照固定无关参数，仅改变所研究的因素；章末通过解释题和编程题检验概念理解与算法实现。

## 按问题阅读

| 本书主题 | 可直接访问的经典入口 | 阅读时追问 |
| --- | --- | --- |
| 像素、颜色、采样 | [PBRT 颜色](https://pbr-book.org/4ed/Radiometry%2C_Spectra%2C_and_Color/Color)、[采样与重建](https://pbr-book.org/4ed/Sampling_and_Reconstruction) | 这个数是线性光强、编码值还是一组样本？ |
| 变换与法线 | [PBRT 变换](https://pbr-book.org/4ed/Geometry_and_Transformations/Transformations)、[应用变换](https://pbr-book.org/4ed/Geometry_and_Transformations/Applying_Transformations) | 点、方向、法线为什么要区别对待？ |
| 相机 | [PBRT 投影相机](https://pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models) | 投影后哪一步除以 w？裁剪在它前面还是后面？ |
| 光栅化、插值、深度、基础光照 | [GAMES101 官方逐讲资料](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html) | 每一步接收什么数组，又产生什么数组？ |
| 纹理 | [PBRT 纹理采样与抗锯齿](https://pbr-book.org/4ed/Textures_and_Materials/Texture_Sampling_and_Antialiasing) | 一个像素在纹理上覆盖多大区域？ |
| 射线与成像 | [Ray Tracing in One Weekend 作者在线版](https://raytracing.github.io/books/RayTracingInOneWeekend.html) | 求交点、选择最近交点和给交点着色是三个怎样连接的步骤？ |

阅读记录：2026-09-22。链接作为出处与延伸阅读；本书的运行不需要下载这些教材。外部链接可能变更，程序和教学正文保存在本项目内。

## 配图原则

数学示意图优先原创。当前四幅 SVG 的生成代码在 `tools/draw_diagrams.py`，输出留在各章 `figures/`，图中文字、默认参数与正文互相核对。交互图由本章 Python 参数生成。今后引入真实照片或外部图表时，随图保存作者、来源、许可和所做修改；配图必须解释某个现象，而不只是填补留白。
