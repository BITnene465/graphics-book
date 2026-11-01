# 从像素到光线 · 阅读目录

本书面向会编程、了解向量和矩阵基本运算的读者。十五章以像素、空间、可见性、表面与形状为线索，通过数学推导、书内实验和可独立阅读的 Python 算法建立传统图形学基础。全书包含 54 个聚焦演示、15 个综合演示和 35 道编程练习，最后以一个可运行的综合实践收束。

从项目根目录运行 `uv run --locked python tools/serve.py`，即可在浏览器阅读和操作。目录依先修关系排序，章编号与源码路径保持一致：**01 → 02 → 03 → 04 → 08 → 05 → 06 → 07 → 14 → 09 → 13 → 10 → 11 → 15 → 12 → 综合实践**。

## 学习目标与先修关系

| 章节 | 前置 | 当前实验 | 练习与完成标准 |
| --- | --- | --- | --- |
| [01 像素与颜色](modules/01-images-and-space/01-pixels/lesson.md) | Python 数组、坐标 | 真实采样位置、分辨率、线性 RGB 与 sRGB 混色 | 实现像素中心与黑白混色；解释索引、查看放大和采样次数 |
| [02 坐标与变换](modules/01-images-and-space/02-transforms/lesson.md) | 01；向量 | 齐次变换、顺序、点积/叉积、任意轴旋转、镜像/错切、一般变基与父子 FK | 绕指定点旋转、逆变换；区分变点与变基、局部与世界变换 |
| [03 相机与投影](modules/01-images-and-space/03-camera/lesson.md) | 02；相似三角形 | 视锥、透视/正交、齐次线段裁剪与顶点追踪 | 实现透视坐标和单平面裁剪；解释近平面穿越 |
| [04 重心坐标与覆盖](modules/02-rasterization/04-barycentric/lesson.md) | 01、02；二维面积 | 单点面积/权重，逐像素覆盖、共享边规则与三角形裁剪 | 实现有向面积与权重；解释负权重、退化与共享边归属 |
| [08 采样与抗锯齿](modules/03-surface-and-sampling/08-sampling/lesson.md) | 01、04 | 解析覆盖、卷积/频谱、SSAA/MSAA、八叶轮时间混叠与快门积分 | 实现线性平均与等价频率；区分空间/时间采样、帧率与曝光时长 |
| [05 深度与遮挡](modules/02-rasterization/05-depth/lesson.md) | 03、04 | 相交三角形、深度图、绘制顺序与每像素候选 | 实现深度插值与最近片元选择；区分深度和普通属性 |
| [06 法线与光照](modules/03-surface-and-sampling/06-lighting/lesson.md) | 02、04、05；点积 | 解析椭球、逆转置法线、方向光/点光；同一网格的 Flat/Gouraud/Phong 比较 | 实现 Lambert、逆转置、颜色插值与法线插值；区分着色频率和轮廓精度 |
| [07 UV 与纹理](modules/03-surface-and-sampling/07-textures/lesson.md) | 03、04、08 | 透视 UV、mip/足迹过滤、ripmap/椭圆参考、高度/法线数据与 Bump/位移 | 实现透视插值、双线性和层间混合；区分颜色数据、着色法线与几何轮廓 |
| [14 纹理函数](modules/03-surface-and-sampling/14-texture-functions/lesson.md) | 02、03、06、07 | 经纬/立方体环境、镜面球方向查询、二维/三维 value noise、有限 fBm 与 object/world 平移对照 | 实现经纬地址与归一化多层求和；解释接缝、输入坐标、有限尺度和未过滤高频 |
| [09 阴影映射](modules/04-shadows-and-geometry/09-shadows/lesson.md) | 03、05、06 | 两遍渲染、光源深度图、bias、逐比较 PCF 与像素追踪 | 实现光空间坐标与可见比例；解释偏移和阴影采样限制 |
| [13 完整光栅管线](modules/03-surface-and-sampling/13-pipeline/lesson.md) | 02–09 的光栅主线 | 可移动模型/相机/光、顶点与片元程序、逐像素回溯和线性 alpha | 实现透视属性恢复与 source-over；解释阶段数据、提前深度测试与提交顺序 |
| [10 几何表示](modules/04-shadows-and-geometry/10-geometry/lesson.md) | 02、06 | 同一形状的网格、隐式与参数表示、经纬网格密度和法线 | 实现椭球参数点与隐式法线；区分表示和近似误差 |
| [11 曲线与样条](modules/04-shadows-and-geometry/11-bezier/lesson.md) | 02、04 | de Casteljau、切线、弧长与分割；C0/G1/C1/C2、B-spline 局部控制、有理圆弧 | 实现曲线点、端点切线、按时长的 C1 手柄与有理权重；区分方向、速度、局部支撑和正权投影 |
| [15 曲面](modules/04-shadows-and-geometry/15-surfaces/lesson.md) | 02、06、11 | 两轮 de Casteljau、偏导/定向法线/正则性、H/K；可直接编辑的三维控制网、整边连续性约束与 Python 成像 | 实现张量积求值与按跨度换算的 C1 控制行；解释参数退化、整边约束和网格/解析曲面的差别 |
| [12 基础光线追踪](modules/05-raytracing/12-rays/lesson.md) | 03、06；解析几何 | 相机射线、求交、阴影、有限镜面反射、路径与光栅对照 | 实现最近球交点与反射方向；解释 t 范围及自相交 |

## 怎样阅读算法

每章先阅读正文、预测实验现象，再追踪 `core.py`，最后独立完成 `exercises.py`。练习中保留的 `NotImplementedError` 是读者作答位置；实际演示使用的核心算法已完整实现。书内“展开本章完整源码”显示正在使用的文件，包含语法高亮与行号。

较长主题使用独立文件：04 的 `raster.py` 供后续章节复用；02 的三维变换与层级、07 的足迹过滤与表面贴图、08 的多重采样与时间采样各有对应核心；11 的 `splines.py` 处理样条；15 将曲面数学、成像和教学图分开。前端输入与场景预览不改变这些函数的独立性。

```bash
# 全书算法、接口、书内链接与综合实践检查
uv run --locked python tools/check.py

# 完成练习后运行本章自检
uv run --locked python courses/graphics-foundations/modules/01-images-and-space/01-pixels/exercises.py

# 运行全书的综合实践
uv run --locked python projects/foundation-renderer/main.py
```

## 完成全书后的检查

[综合实践](capstone.md)复用现有函数生成棋盘地面、柱体和椭球，保存正式图像与浮点中间量。应能从一个像素说明世界位置如何恢复、哪个三角形通过深度测试、法线为何与切平面正交、光源是否可见以及颜色何时编码；再以提交次序与固定输出尺寸的采样实验核对这些判断。

[数学补充](../../resources/math/bridge.md)集中说明向量、齐次坐标、插值与采样之间的关系，[术语索引](../../resources/reading/glossary.md)用于复习坐标、颜色与渲染用语。两篇均可从书内侧栏展开阅读。

本版讲解基础光栅化、几何求值与确定性光线追踪。全局光照、路径追踪、真实镜头、动画与物理模拟不在本版范围；完整 GAMES101 覆盖保留在[扩展 TODO](../../ROADMAP.md)。各章会明确局部模型和数值近似的适用条件。
