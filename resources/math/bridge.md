# 图形学数学补充

本页汇总各章使用的基本数学关系，并提供可手算的例子。完成算例后，可在对应章节改变参数，核对几何结果与数值结果。术语定义见[中英术语与符号索引](../reading/glossary.md)，算法组合见[综合实践](../../courses/graphics-foundations/capstone.md)。

| 遇到的问题 | 查哪里 | 回到章节 |
| --- | --- | --- |
| 一个坐标究竟依赖哪组轴？ | [向量与基](#vectors) | [02 坐标与变换][02] |
| 为什么先旋转与先平移不同？ | [矩阵、复合与逆](#matrices) | [02][02]、[03 相机][03] |
| 夹角、法线与明暗有什么关系？ | [点积、叉积与法线](#normals) | [04 重心坐标][04]、[06 光照][06] |
| 透视下为什么不能直接平均 UV？ | [插值与透视除法](#interpolation) | [04][04]、[05 深度][05]、[07 纹理][07] |
| 切线、法线、像素面积怎样计算？ | [导数、梯度与积分](#calculus) | [08 采样][08]、[10 几何][10]、[11 曲线][11] |
| 多取样为什么能减轻锯齿，却仍会出错？ | [采样、频率与颜色](#sampling) | [01 像素][01]、[08][08] |

<a id="vectors"></a>

## 1. 点、向量与基：坐标是表示法

点表示位置，两个点相减得到位移向量。取 $p=(1,2)$、$q=(4,6)$，则 $q-p=(3,4)$，长度为 $\sqrt{3^2+4^2}=5$，单位方向为 $(3/5,4/5)$。零向量没有唯一方向，不能用除以零把它变成单位向量。

若基向量为 $b_1=(2,0)$、$b_2=(1,1)$，坐标 $(1,2)$ 表示的向量是：

$$
x=1b_1+2b_2=(4,2),\qquad
B=\begin{bmatrix}2&1\\0&1\end{bmatrix},\quad
x=B\begin{bmatrix}1\\2\end{bmatrix}.
$$

矩阵的**第 $i$ 列是第 $i$ 个基向量的去向**。上式用 $B$ 将这组基下的坐标变成标准坐标；对同一个几何向量换坐标，要用 $B^{-1}$。这两个方向不能混用。在 [02 的实验][02] 调整旋转、缩放和错切，观察两根基向量，逐列核对矩阵，再用 `apply(matrix, coordinates, vector=True)` 检查结果。

<a id="matrices"></a>

## 2. 矩阵、复合与逆：读出作用顺序

本书采用列向量，矩阵在左。二维仿射变换把点补成 $(x,y,1)$，把方向补成 $(x,y,0)$：

$$
\begin{bmatrix}A&t\\0&1\end{bmatrix}
\begin{bmatrix}p\\1\end{bmatrix}
=\begin{bmatrix}Ap+t\\1\end{bmatrix},\qquad
\begin{bmatrix}A&t\\0&1\end{bmatrix}
\begin{bmatrix}v\\0\end{bmatrix}
=\begin{bmatrix}Av\\0\end{bmatrix}.
$$

令 $R$ 逆时针旋转 $90^\circ$，$T$ 平移 $(3,0)$，$p=(1,0)$：$TRp=(3,1)$，而 $RTp=(0,4)$。乘积从右向左作用，通常 $TR\ne RT$。在 [02 核心][02-core] 中，`compose(T, R)` 就是 `T @ R`；`rotation(angle)` 接收**弧度**，所以 $90^\circ=\pi/2$。

逆变换的推导从 $p'=Ap+t$ 开始：

$$
p=A^{-1}(p'-t),\qquad
(TR)^{-1}=R^{-1}T^{-1}.
$$

前一节的 $B^{-1}=\begin{bmatrix}1/2&-1/2\\0&1\end{bmatrix}$，所以 $B^{-1}(4,2)=(1,2)$。若把 $x$ 方向缩放为 0，无数点挤到同一直线上，信息已经丢失，逆矩阵不存在。接近奇异时即使存在逆，误差也可能被放大。

[03][03] 将相机姿态取逆得到世界到相机的变换：$p_{\rm clip}=PVMp_{\rm local}$。批量点在 NumPy 中按行存储时写 `points @ matrix.T`，仍是同一套列向量语义。

<a id="normals"></a>

## 3. 点积、叉积与法线：把方向变成可检验的数

点积 $a\cdot b=\|a\|\|b\|\cos\theta$。单位法线 $n=(0,1,0)$ 与指向光的单位方向 $\ell=(0.6,0.8,0)$ 给出 $n\cdot\ell=0.8$；Lambert 教学项为 $\max(0,n\cdot\ell)=0.8$。若方向未归一化，点积就不再直接等于夹角余弦。

二维叉积 $a_xb_y-a_yb_x$ 是有向平行四边形面积。$a=(2,0)$、$b=(0,3)$ 得 6，对应三角形面积为 3；交换两个向量会变号。三维叉积 $a\times b$ 则给出同时垂直于二者的方向，长度仍为平行四边形面积。[04][04] 用其二维形式计算权重与覆盖，[10][10] 用三维形式求面法线。

法线不是普通位移。若切线 $u$ 与法线 $n$ 满足 $n^Tu=0$，变换后仍要求 $n'^TAu=0$，因此：

$$
n'\propto A^{-T}n.
$$

取 $u=(1,-1,0)$、$n=(1,1,0)$、$A=\operatorname{diag}(2,1,1)$。正确法线方向 $(1/2,1,0)$ 与新切线 $(2,-1,0)$ 点积为 0；错误方向 $An=(2,1,0)$ 点积为 3。两边最后都归一化也救不了错误方向。用 [06 的 `transform_normals(normals, linear)`][06-core] 重现实验。

<a id="interpolation"></a>

## 4. 插值与透视除法：先问自己在平均什么

线性插值为 $L(a,b,t)=(1-t)a+tb$。仿射组合要求权重和为 1；凸组合还要求权重非负。取三角形 $A=(0,0)$、$B=(2,0)$、$C=(0,2)$，点 $p=(0.5,0.5)$ 的权重为 $(1/2,1/4,1/4)$，逐项加权确实重建 $p$。负权重可以表示外部点，不能据此说公式失效。[04][04] 的 `barycentric(point, vertices)` 在非退化三角形上计算这些权重。

透视除法改变屏幕上的比例。屏幕重心权重为 $\lambda_i$ 时，普通顶点属性 $a_i$ 要写成：

$$
a(p)=\frac{\sum_i\lambda_i a_i/w_i}{\sum_i\lambda_i/w_i}.
$$

在线段上取屏幕权重 $(1/2,1/2)$、属性 $(0,1)$、$w=(1,2)$，得到 $a=(1/4)/(3/4)=1/3$，而不是直接平均的 $1/2$。[07 的 `perspective_interpolate(weights, attributes, inv_w)`][07-core] 接收的是 $1/w$；标量属性也用 `(顶点数, 1)` 数组。

**深度是需要另外认清的量。** 已经除过 $w$ 的 $z_{\rm ndc}$ 直接按屏幕权重线性插值，不能再套一次上式。对 near $=1$、far $=10$、正相机轴向距离 $d=2$：

$$
D=\frac{f}{f-n}-\frac{fn}{(f-n)d}=\frac59.
$$

这里 $D\in[0,1]$ 是深度缓冲值，$d$ 是轴向距离；它们也不等于点到相机的欧氏距离。见 [05 的深度推导][05]。裁剪始终发生在除以 $w$ 之前，新顶点的普通属性与 clip 坐标使用同一个边交点参数。

<a id="calculus"></a>

## 5. 导数、梯度与积分：局部变化和面积累计

导数是局部变化率：$C'(t)=\lim_{h\to0}[C(t+h)-C(t)]/h$。三次 Bézier 曲线满足 $C'(0)=3(P_1-P_0)$。若 $P_0=(0,0)$、$P_1=(1,2)$，初始导数为 $(3,6)$，速度为 $3\sqrt5$；切线方向是导数归一化后的结果。改变 $t$ 的速度与沿曲线移动的速度并不是同一个量：

$$
s(t)=\int_0^t\|C'(u)\|\,du.
$$

[11][11] 的 `derivative(control, t)` 允许返回零导数，此时不能强行画单位切线；`arc_length_parameters(control, fractions, steps=800)` 用折线查表近似等弧长，不能把它叫作解析弧长。

梯度把多变量函数的偏导排成向量。球面 $F(x,y,z)=x^2+y^2+z^2-1=0$ 有 $\nabla F=(2x,2y,2z)$；在 $(1,0,0)$ 处梯度为 $(2,0,0)$，单位法线为 $(1,0,0)$。沿表面切线 $u$ 运动时 $F$ 一阶不变，即 $\nabla F\cdot u=0$。梯度为零的位置不能用这个办法定义唯一法线；见 [10 隐式表示][10]。

积分也进入一个像素。面积为 $|A|$ 的像素采用盒式滤波时，线性颜色是区域平均：

$$
C_A=\frac1{|A|}\int_A C(x,y)\,dx\,dy
\approx\frac1N\sum_{k=1}^N C(x_k,y_k).
$$

若白色形状精确覆盖黑底像素面积的四分之一，线性灰度就是 $1/4$。4 个样本恰有 1 个落入白区也会给出 $1/4$，但这只是该次求积结果；换一个形状，它可能估错覆盖率。见 [08 的解析斜边参考][08]。

<a id="sampling"></a>

## 6. 采样、频率与颜色：样本不是完整信号

对 $f(x)=\sin(2\pi\nu x)$，用采样率 $f_s$ 在 $x_k=k/f_s$ 取值。因为整数 $m$ 满足 $\sin(\theta+2\pi mk)=\sin\theta$，频率 $\nu$ 与 $\nu+mf_s$ 在这些位置给出相同样本。例：$f_s=8$ 时，频率 9 与频率 1 的样本完全一致，低频错觉由此产生。

理想采样定理要求信号带限、均匀采样，并以足够高的采样率配合合适的重建；常用安全表述为 $f_s>2f_{\max}$。锐利边缘通常不带限。SSAA 通过像素内更多求值近似滤波后的像素值，有限样本无法保证消除任意细节的混叠；放大已有图片也没有补回这些求值。

注意两个实际接口的单位：[01][01] 的 `sample_offsets(samples)` 使用**每轴样本数**，`samples=4` 共 16 个；[08][08] 的 `sample_offsets(count, strategy="grid", seed=7)` 使用**每像素总数**，`count=16` 才是 4×4。相同的数字不保证相同的工作量。

最后，颜色平均要在线性 RGB 中做。黑白各占一半得到线性值 0.5，编码为 sRGB 约为 0.735；直接平均 sRGB 的 0 与 1 得到 0.5，解码后只有约 0.214。这个差异属于颜色编码，不属于采样噪声。[01][01] 负责解码/编码，[08][08] 用错误对照验证平均的顺序。

继续阅读：[中英术语与符号索引](../reading/glossary.md) · [综合实践](../../courses/graphics-foundations/capstone.md) · [经典阅读入口](../reading/classics.md)。

[01]: ../../courses/graphics-foundations/modules/01-images-and-space/01-pixels/lesson.md
[02]: ../../courses/graphics-foundations/modules/01-images-and-space/02-transforms/lesson.md
[03]: ../../courses/graphics-foundations/modules/01-images-and-space/03-camera/lesson.md
[04]: ../../courses/graphics-foundations/modules/02-rasterization/04-barycentric/lesson.md
[05]: ../../courses/graphics-foundations/modules/02-rasterization/05-depth/lesson.md
[06]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/06-lighting/lesson.md
[07]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/07-textures/lesson.md
[08]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/08-sampling/lesson.md
[10]: ../../courses/graphics-foundations/modules/04-shadows-and-geometry/10-geometry/lesson.md
[11]: ../../courses/graphics-foundations/modules/04-shadows-and-geometry/11-bezier/lesson.md
[02-core]: ../../courses/graphics-foundations/modules/01-images-and-space/02-transforms/core.py
[06-core]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/06-lighting/core.py
[07-core]: ../../courses/graphics-foundations/modules/03-surface-and-sampling/07-textures/core.py
