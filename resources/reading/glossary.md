# 图形学中英术语与符号索引

本索引按主题收录中文术语、英文名称、缩写与符号。章节编号链接到对应正文；相关公式见[数学补充](../math/bridge.md)，接口组合见[综合实践](../../courses/graphics-foundations/capstone.md)。

## 统一约定，以及必须显式转换的接口

| 项目 | 本书约定与接口边界 |
| --- | --- |
| 世界与相机 | 右手系；相机看自身 −Z，前方点通常有 `z_view < 0`。正轴转向按右手规则；02 的二维正旋转是逆时针。见 [02][02]、[03][03]。 |
| 矩阵 | 列向量语义，`p_clip = P @ V @ M @ p_local`，最右边先作用。批量点 `(N,4)` 按行保存时，用 `points @ matrix.T`。内存布局不改变数学约定。 |
| 点与方向 | 三维点补齐次分量 1，方向补 0；二维仿射使用 3×3，三维仿射使用 4×4。法线另用可逆线性部分的逆转置。 |
| 裁剪与除法 | 齐次裁剪范围 `-w <= x,y,z <= w`；先裁剪图元，再对有效正 `w` 做除法。NDC 三轴取 `[-1,1]`，深度缓冲把 Z 映射到 `[0,1]`。见 [03][03]、[05][05]。 |
| 屏幕与数组 | NDC 的 Y 向上，通常图像数组 `[row, col]` 的 row 向下。03 的 `viewport()` 直接返回左上原点屏幕坐标；04 的 `clip_to_screen()` 返回 Y 向上的几何坐标，`rasterize_triangle()` 再输出行向下索引。这两种输出不能直接互换。 |
| 像素中心 | 左上数组像素 `[r,c]` 的连续屏幕坐标为 `(c+.5,r+.5)`；若几何屏幕 Y 向上，则为 `(c+.5,H-r-.5)`。共享边的 top-left 判断须匹配采用的 Y 方向。 |
| 解析采样网格 | 06 的 `ellipsoid_surface()` 与 01、08 一样，**数组第 0 行在顶部**。几何 Y 仍向上；只有交给 Bokeh 图像显示时翻转一次，点击返回的几何坐标不再翻转。 |
| UV | 07 的颜色纹理 UV 原点在左下，而纹理数组行向下；09 的阴影查询 UV 原点在左上，匹配阴影深度数组。两者在 V 轴上需要转换。 |
| 角度 | 02 的 `rotation(angle)` 接收弧度；03 的 `perspective(fov_y_degrees, ...)`、07 的 `tilt/rotation`、08 的 `angle`、10 的观察角接收度数；10 的参数 `u,v` 是弧度。以函数签名和说明为准。 |
| 颜色 | 光照、颜色插值、滤波和累计在线性 RGB 中完成；输入 sRGB 颜色先解码，最终显示再编码一次。法线、UV、深度等数据不做 sRGB 解码。 |
| 缺失数据 | 深度背景常用 `+inf`，物体编号用 `-1`；世界位置等不存在的属性可能为 `NaN`。先用 `owner >= 0` 选表面，再参与计算；不能把背景深度解释成真实表面。 |

## 图像、颜色与采样

| 中文 / English | 含义与常见混淆 | 章节 |
| --- | --- | --- |
| 像素 / pixel | 输出图像的一个离散位置及其值；本书用盒式面积平均建立入门模型。一个像素可以由多个样本估计。 | [01][01]、[08][08] |
| 样本 / sample | 在指定位置对连续场景的一次求值。样本数、输出像素数、显示放大倍数是不同量。 | [01][01]、[08][08] |
| 线性 RGB / linear RGB | 相同照明量相加与平均所用的颜色表示；线性不是指屏幕坐标插值方式。 | [01][01] |
| sRGB 编码 / sRGB encoding | 用分段传递函数把线性颜色映射到显示编码值；不是简单的固定幂 `gamma=2.2`。 | [01][01] |
| 滤波 / filtering | 按权重组合一片区域的值；颜色过滤在线性空间进行。 | [07][07]、[08][08] |
| 盒式滤波 / box filter | 对矩形范围使用常量权重。本书一个像素内的等权平均近似其面积积分。 | [08][08] |
| 超采样抗锯齿 / SSAA, supersampling anti-aliasing | 每个输出像素内部多次求值再合成；1、4、16、64 是 08 的每像素总样本数。 | [08][08] |
| 抖动采样 / stratified jittered sampling | 08 将像素划成小格，每格内随机取一个位置，固定种子可复现。不是把图像随机移动。 | [08][08] |
| 混叠 / aliasing | 不同连续信号产生相同或误导性的离散样本；空间阶梯、摩尔纹、移动时闪烁均可能是表现。 | [08][08] |
| 带限 / band-limited | 信号不含超过某个上限的频率；理想采样定理依赖此条件，锐利边缘通常不满足。 | [08][08] |
| 奈奎斯特频率 / Nyquist frequency | 采样率 $f_s$ 的一半；本书采用 $f_s>2f_{\max}$ 表述避免临界相位歧义。 | [08][08] |
| 重建 / reconstruction | 从离散样本形成连续表示，或依据样本估计输出值；有限样本不能自动恢复已丢失细节。 | [08][08] |

## 空间、相机与变换

| 中文 / English | 含义与常见混淆 | 章节 |
| --- | --- | --- |
| 基 / basis | 线性无关的一组方向；坐标是相对于基的系数。二维变换矩阵的两列可看作基向量的去向。 | [02][02] |
| 仿射变换 / affine transform | $p'=Ap+t$，包含平移与线性变换，保持直线及仿射组合。 | [02][02] |
| 齐次坐标 / homogeneous coordinates | 增加一个分量统一表达仿射变换与投影；`w` 不总为 1，也不是额外的空间轴。 | [02][02]、[03][03] |
| 奇异矩阵 / singular matrix | 不可逆矩阵；零缩放把维度压扁，会丢失信息。接近奇异还可能放大数值误差。 | [02][02] |
| 模型矩阵 / model matrix | 局部坐标到世界坐标。 | [02][02]、[03][03] |
| 视图矩阵 / view matrix | 世界到相机坐标，是相机姿态的逆；`look_at()` 构造它。 | [03][03] |
| 透视投影 / perspective projection | 通过除以深度产生近大远小；本书相机的 `w_clip=-z_view`。 | [03][03] |
| 正交投影 / orthographic projection | 图像横纵缩放不随深度变化；09 平行光的阴影相机采用它。 | [03][03]、[09][09] |
| 裁剪空间 / clip space | 尚未除以 `w` 的齐次坐标空间，图元在此与六个半空间求交。 | [03][03]、[04 光栅化][04-raster] |
| 归一化设备坐标 / NDC | clip 坐标除以 `w` 后的坐标；本书可见体三轴范围均为 `[-1,1]`。 | [03][03] |
| 视口 / viewport | 将 NDC 映射到连续屏幕坐标的矩形区域；尚需像素覆盖判定才能得到图像。 | [03][03]、[04 光栅化][04-raster] |
| 近远裁剪面 / near and far planes | 规定保留的相机轴向距离范围；不是把越界深度简单截成 0 或 1 就完成裁剪。 | [03][03]、[05][05] |

## 覆盖、插值与可见性

| 中文 / English | 含义与常见混淆 | 章节 |
| --- | --- | --- |
| 重心坐标 / barycentric coordinates | 三角形三个顶点的仿射权重，和为 1；内部点的权重非负。 | [04][04] |
| 边函数 / edge function | 二维有向面积表达式，判定点位于有向边哪一侧；可同时得到覆盖与权重。 | [04 光栅化][04-raster] |
| 光栅化 / rasterization | 将投影图元变成覆盖样本以及属性；一个像素可能接收多个候选片元。 | [04 光栅化][04-raster] |
| 片元 / fragment | 某图元在一个采样位置产生的候选颜色、深度等信息；通过深度测试后才可能写入图像。 | [04 光栅化][04-raster]、[05][05] |
| 顶边左边规则 / top-left rule | 共享边恰好归给一个相邻三角形的约定；公式依赖屏幕 Y 方向及绕序。 | [04 光栅化][04-raster] |
| 子像素量化 / subpixel quantization | 04 将屏幕顶点固定到 1/256 像素网格，以整数边函数保持共享边归属一致；会轻微改变几何。 | [04 光栅化][04-raster] |
| 仿射插值 / affine interpolation | 属性按屏幕权重直接求和。二维或正交情形适用，通常不能直接插值透视后的普通属性。 | [04][04]、[07][07] |
| 透视正确插值 / perspective-correct interpolation | 插值 $a/w$ 与 $1/w$ 后相除；适用于 UV、世界位置等普通属性。 | [07][07]、[09][09] |
| 深度缓冲 / depth buffer, Z-buffer | 记录当前最近存储深度；05 默认用严格 `<`，相同存储深度由先提交者保留。 | [05][05] |
| 深度争夺 / Z-fighting | 不同表面落入相同或接近的存储深度，产生不稳定可见性；受深度精度和 near/far 影响。 | [05][05] |
| 画家算法 / painter's algorithm | 先远后近绘制；本书整面平均深度排序是故意保留的失败对照，不能解决相交图元。 | [05][05] |

## 表面、纹理与光照

| 中文 / English | 含义与常见混淆 | 章节 |
| --- | --- | --- |
| 法线 / normal | 垂直于局部切平面的方向；光照前归一化，变换时用线性部分的逆转置。 | [06][06]、[10][10] |
| Lambert 漫反射 / Lambertian diffuse term | 教学明暗项包含 $\max(0,n\cdot\ell)$，$\ell$ 从表面指向光源。 | [06][06] |
| Blinn–Phong | 用半程向量 $h=\operatorname{normalize}(\ell+v)$ 构造经验高光；指数不等于 PBR 粗糙度。 | [06][06] |
| 环境项 / ambient term | 本书用于保留暗部可见性的简单常量，不是间接光照计算。 | [06][06]、[09][09]、[12][12] |
| 方向光 / directional light | 表面各处使用相同入射方向；09 的光源观察位置定义方向及取样体积。 | [06][06]、[09][09] |
| 点光源 / point light | 方向随表面位置变化；06 可使用平方反比衰减，12 为隔离变量采用恒定强度。 | [06][06]、[12][12] |
| UV / texture coordinates | 表面属性到二维纹理域的坐标；不是屏幕像素坐标，也不天然决定原点方向。 | [07][07] |
| 纹素 / texel | 纹理数组中的一个离散元素；与输出图像像素不必一一对应。 | [07][07] |
| 最近邻 / nearest-neighbor filtering | 根据 UV 选择一个纹素；纹理越界在本章采用 clamp。 | [07][07] |
| 双线性过滤 / bilinear filtering | 对四个邻接纹素加权；不等于对整个像素足迹做面积积分。 | [07][07] |
| 像素足迹 / pixel footprint | 一个输出像素在纹理域覆盖的区域；倾斜、缩小时可能跨过许多纹素。 | [07][07]、[08][08] |
| 阴影映射 / shadow mapping | 第一遍从光源记录深度，第二遍把可见世界点投到光空间作比较。 | [09][09] |
| 深度偏移 / shadow bias | 09 从接收点归一化光深度中减去非负值；其单位不是世界距离。 | [09][09] |
| 阴影痤疮 / shadow acne | 表面对自己的阴影图采样产生错误遮挡；浮点误差和两张图取样位置不同都会影响。 | [09][09] |
| 阴影脱离 / Peter Panning | bias 过大放过实际遮挡，使接触阴影脱离或消失。 | [09][09] |
| PCF / percentage-closer filtering | 多次比较深度，平均通过比例；不能先平均深度，也不是完整物理软阴影。 | [09][09] |

## 几何、曲线与射线

| 中文 / English | 含义与常见混淆 | 章节 |
| --- | --- | --- |
| 三角网格 / triangle mesh | 顶点和三角形索引组成的离散表面；绕序决定面法线方向。 | [10][10] |
| 隐式表示 / implicit representation | 用 $F(p)=0$ 描述表面；$F$ 的数值一般不是到表面的距离。 | [10][10] |
| 参数表示 / parametric representation | 用 $p(u,v)$ 生成表面点；球的经纬参数在极点会退化。 | [10][10] |
| 梯度 / gradient | 标量场的偏导向量；非零梯度在隐式表面上给出法线方向。 | [10][10] |
| Bézier 曲线 / Bézier curve | 控制点通过 Bernstein 权重组合成曲线；内部控制点一般不在曲线上。 | [11][11] |
| de Casteljau 算法 | 对控制点逐层线性插值，最后得到曲线点；同时能构造精确分割。 | [11][11] |
| Bernstein 基函数 / Bernstein basis | $B_i^n(t)=\binom ni t^i(1-t)^{n-i}$；在 $[0,1]$ 非负且和为 1。 | [11][11] |
| 凸包 / convex hull | 包含控制点的最小凸集；Bézier 曲线在参数 $[0,1]$ 上位于其中。 | [11][11] |
| 弧长 / arc length | 沿路径累计的长度 $\int\|C'(t)\|dt$；均匀参数不意味着均匀弧长。 | [11][11] |
| 射线 / ray | $r(t)=o+td$，加上合法参数区间。只有 $d$ 为单位方向时，$t$ 才等于沿线距离。 | [12][12] |
| 最近合法交点 / closest valid hit | 先过滤 `t_min <= t <= t_max`，再比较剩余根和所有物体；负根不是前方命中。 | [12][12] |
| 阴影射线 / shadow ray | 从偏移后的表面点查询到点光源前的有限线段；光后方物体不遮挡这束光。 | [12][12] |
| 自相交 / self-intersection | 新射线立即再次命中自身表面；12 用起点法线偏移与参数下限展示改善及其局限。 | [12][12] |
| 镜面反射 / specular reflection | 确定方向 $r=d-2(d\cdot n)n$；12 每次只延伸一条反射射线。 | [12][12] |
| 路径权重 / throughput | 12 中沿反射链累计的材料镜面混合系数乘积；不是随机采样的概率密度。 | [12][12] |
| 路径追踪 / path tracing | 用路径积分及随机估计处理光传输的进一步方法；当前 12 章的有限确定性镜面链不包含它。 | [12][12] |

## 符号速查

同一个字母在不同章节可能有不同作用，公式旁的定义优先。下面列出跨章最容易混淆的几组。

| 符号 | 常用含义 | 不要混为一谈 |
| --- | --- | --- |
| $p$, $v$, $n$ | 点、方向向量、法线；06 的 $v$ 特指表面指向相机的单位视方向 | near 有时也简写 $n$，请结合上下文。 |
| $M,V,P$ | 模型、视图、投影矩阵 | 09 的标量可见率也写 $V$，它不参与坐标变换。 |
| $w$, $1/w$ | 齐次坐标第四分量及其倒数 | 与普通插值权重 $\lambda_i$ 不同。 |
| $\lambda_i$ | 屏幕三角形重心权重 | 透视正确插值中还需结合每个顶点的 $w_i$。 |
| $z_{\rm view}$, $z_{\rm ndc}$, $D$ | 相机空间 Z、除以 w 后的 Z、归一化深度缓冲值 | 本书前方 $z_{\rm view}<0$，$z_{\rm ndc}\in[-1,1]$，$D\in[0,1]$。 |
| $d$, $t$ | 射线方向、射线参数；05 的 $d$ 则是正轴向距离 | 11 的 $t\in[0,1]$ 是曲线参数，也不是弧长。 |
| $u,v$ | 07 的纹理坐标；10 的曲面参数 | 两章取值范围、单位不同；纹理域通常归一化，经纬参数以弧度表示。 |
| $\ell,h$ | 指向光的方向、光与视线的半程方向 | `h` 也可能表示差分步长或图像高度。 |
| $k_d,k_s,q$ | 漫反射系数、高光系数、高光指数 | 12 的球求根代码也用局部变量 `q` 表示稳定根公式的中间量。 |
| $b$, $\varepsilon$ | 09 的深度 bias；12 的世界空间起点偏移与单位射线参数下限 | 单位不同，不能直接共用一个数值。 |
| $N,f_s,\nu$ | 样本总数、采样率、信号频率 | 空间频率的单位可为周期/像素，时间频率可为周期/秒，须与采样率一致。 |
| $+\infty$、`NaN` | 无命中深度、无定义属性的标记 | 不是可直接带入光照的有效表面数据。 |

[01]: ../../courses/graphics-foundations/modules/01-images-and-space/01-pixels/lesson.md
[02]: ../../courses/graphics-foundations/modules/01-images-and-space/02-transforms/lesson.md
[03]: ../../courses/graphics-foundations/modules/01-images-and-space/03-camera/lesson.md
[04]: ../../courses/graphics-foundations/modules/02-rasterization/04-barycentric/lesson.md
[04-raster]: ../../courses/graphics-foundations/modules/02-rasterization/04-barycentric/raster-lesson.md
[05]: ../../courses/graphics-foundations/modules/02-rasterization/05-depth/lesson.md
[06]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/06-lighting/lesson.md
[07]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/07-textures/lesson.md
[08]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/08-sampling/lesson.md
[09]: ../../courses/graphics-foundations/modules/04-shadows-and-geometry/09-shadows/lesson.md
[10]: ../../courses/graphics-foundations/modules/04-shadows-and-geometry/10-geometry/lesson.md
[11]: ../../courses/graphics-foundations/modules/04-shadows-and-geometry/11-bezier/lesson.md
[12]: ../../courses/graphics-foundations/modules/05-raytracing/12-rays/lesson.md
