# 24 · 反射、折射与材质

上一章定义到达表面的辐照度与方向分辨的辐亮度。本章研究表面的响应。沿用单位法线 $n$，$\omega_i,\omega_o$ 均从表面指向外部，分别指向来光方向与观察方向；代码中的传播射线方向另行定义。

## 1 · BRDF 是方向上的分配规律

双向反射分布函数（bidirectional reflectance distribution function，BRDF）定义为

$$
f_r(\omega_i,\omega_o)=\frac{dL_o(\omega_o)}{dE_i(\omega_i)}.
$$

这里先固定观察方向 $\omega_o$：从来光方向 $\omega_i$ 增加一小份辐照度 $dE_i$，观察该方向的出射辐亮度增加了多少 $dL_o$。两者的比例便是 BRDF，单位为 sr⁻¹。反射率 $\rho$ 无量纲，两者不能互换。理想 Lambert 漫反射取 $f_r=\rho/\pi$，因为 $\int_{\Omega^+}\cos\theta\,d\omega=\pi$。[第 07 章](?chapter=lighting)的余弦明暗项隐藏了照明和系数约定；进入物理积分后，应显式保留 $1/\pi$。

归一化中的 $\pi$ 可以直接算出。以法线为极轴，$d\omega=\sin\theta\,d\theta\,d\varphi$，则

$$
\int_0^{2\pi}\!\int_0^{\pi/2}\cos\theta\sin\theta\,d\theta\,d\varphi
=2\pi\left[\frac12\sin^2\theta\right]_0^{\pi/2}=\pi.
$$

若省去 $1/\pi$，同样的反射率参数在半球积分后就会多出一个 $\pi$ 倍。被动表面要求对每个入射方向，$\int f_r\cos\theta_o\,d\omega_o\le1$；互易材质还满足交换两个方向后 BRDF 不变。点值超过 1 并不自动违反能量守恒，约束的是带测度的积分。

桌面场景中的小球采用 Lambert 模型，浅色和赭色条纹分别给定不同的漫反射率。对固定表面点与入射照明，出射辐亮度与观察方向无关；镜面高光对观察方向的依赖则需要其他反射模型描述。

## 2 · 微表面把粗糙度变成统计模型

微表面模型假定可见表面由许多微小镜面组成。常见单次散射形式为

$$
f_r=\frac{D(h)F(\omega_i\cdot h)G(\omega_i,\omega_o)}
{4(n\cdot\omega_i)(n\cdot\omega_o)},\qquad
h=\frac{\omega_i+\omega_o}{\|\omega_i+\omega_o\|}.
$$

$h$ 是两个单位方向的角平分方向，与[第 07 章](?chapter=lighting)的半程向量相同：只有法线朝向 h 的理想微镜面，才会把来自 $\omega_i$ 的光反射到 $\omega_o$。$D$ 描述这些微表面法线的分布，$F$ 描述界面反射，$G$ 描述微表面之间的遮蔽与阴影。本图采用各向同性 GGX 分布与 Smith 遮蔽，参数 $\alpha$ 直接控制分布宽度，与软件界面中 roughness 的映射关系须由该软件另行定义。

<details>
<summary>对照核心代码：D、F、G 怎样求值</summary>

令 $c_h=n\cdot h$、$c_i=n\cdot\omega_i$、$c_o=n\cdot\omega_o$。在两个方向均位于上半球时，本例使用

$$
D(h)=\frac{\alpha^2}{\pi\left[c_h^2(\alpha^2-1)+1\right]^2},\qquad
G_1(c)=\frac{2c}{c+\sqrt{\alpha^2+(1-\alpha^2)c^2}},
$$

$$
G=G_1(c_i)G_1(c_o).
$$

它们分别对应 `ggxDistribution()` 与 `smithG1()`。D 按微表面的投影面积归一化，即 $\int D(h)(n\cdot h)\,d\omega_h=1$，不能把 D 本身直接当作方向概率密度。F 使用下一节的 Fresnel 反射率，入射余弦为 $\omega_i\cdot h$，相对的是微表面法线 h，而非宏观法线 n。`ggx()` 将这三项除以 $4c_ic_o$，得到本节采用的单次散射 BRDF。

</details>

[[demo:microfacet-lobe]]

从原点出发的角度表示观察方向 $\omega_o$。蓝色曲线先对 BRDF 数值取 $\log(1+f_r)$，再除以本图采样峰值对应的 $\log(1+f_{\max})$，使最大显示半径为 1；这样弱反射和窄峰都能看清。拖动观察方向手柄，红点给出曲线上的对应位置，数值栏列出真实 BRDF、采样峰值及 D、F、G。不同参数下的曲线各自归一化，因此其显示高度不能直接比较反射强弱，比较时应读取数值。

把入射角设为 30°、观察方向调到 −30°，半程向量应与 n 重合；固定这两个方向再改变粗糙度，观察曲线宽度与 BRDF 读数如何变化。

分布展宽并不意味着反射能量凭空增加。单次散射微表面模型忽略微表面间的多次反射，粗糙时可能损失能量；完整讨论见 [PBRT 微表面章节](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory)。

## 3 · 折射方向与界面能量是两件事

图中光线从上方介质进入下方介质，折射率分别记为 $\eta_i,\eta_t$；角度均从垂直界面的法线量起。Snell 定律为 $\eta_i\sin\theta_i=\eta_t\sin\theta_t$。例如空气进入折射率 1.5 的介质，入射角 30° 给出 $\sin\theta_t=1/3$，折射角约为 19.47°，更靠近法线。若求得 $\sin^2\theta_t>1$，不存在传播折射方向，发生全反射；它只可能发生在从较高折射率进入较低折射率时。

临界角满足 $\sin\theta_c=\eta_t/\eta_i$，所以 1.5 的介质到空气时约为 41.81°。达到临界角时，折射方向沿界面、透射通量为零；本图将这一边界与全反射一起处理，不绘制折射箭头。黄色箭头沿入射光的传播方向，与前面的 $\omega_i$ 朝向相反；切换传播次序时，上下介质标签随之交换。

[[demo:fresnel-refraction]]

无吸收介质界面的 Fresnel 方程决定反射能量比例 $F$，透射能量比例为 $1-F$。空气到 $\eta=1.5$ 的介质正入射时 $F=((1-1.5)/(1+1.5))^2=0.04$。接近掠射时反射显著增强。能量比例不等于直接乘到辐亮度上的全部因子，跨介质传输还需匹配折射率与积分测度。

## 4 · 界面与介质内的吸收分开计算

Beer–Lambert 定律用吸收系数 $\sigma_a$ 与实际路程 $s$ 给出透射率 $T=\exp(-\sigma_a s)$。$\sigma_a$ 的单位是长度的倒数。界面 Fresnel 和介质吸收可同时出现，但改变光线在介质内的路程不会改变入射界面的折射率。

双向散射分布函数（BSDF）同时包含反射与透射。次表面散射还允许入射与出射位置不同，不能仅靠一个局部 BRDF 表示。当前演示分别考察界面与吸收公式。完整玻璃体的传输还需连续求交、选择界面朝向并累计介质内的路径长度。

## 5 · 阅读与核对

依次阅读 `fresnel`、`ggxDistribution`、`smithG1`、`ggx` 和 `beerLambert`。先核对法向 4% 反射，再检查临界角与交换入射/出射方向的 BRDF 对称性。

**核对算例。** 若整个入射半球辐亮度为 1 W/(m²·sr)，则 $E=\pi$ W/m²。反射率 $\rho=0.6$ 的 Lambert 表面有 $f_r=0.6/\pi$ sr⁻¹，出射辐亮度为 0.6 W/(m²·sr)。将入射强度加倍会使结果加倍，改变反射率才改变接收能量中被反射的比例。

自查：为什么半程向量不能用两个未经单位化的方向直接相加？透明与无反射是否等价？为何 BRDF 的峰值不能直接当反射率？

<details class="self-check">
<summary>自查提示</summary>

半程向量要求先统一两个方向的长度，否则长度也会偏移角平分方向。透明介质仍可在界面反射。BRDF 是方向密度式分配，能量约束必须对出射方向带余弦积分，不能仅检查峰值是否超过 1。

</details>

下一章将局部响应放回整个场景，形成表面之间相互照明的积分方程。
