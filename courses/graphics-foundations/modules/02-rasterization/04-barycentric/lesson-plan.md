# 04 重心坐标与覆盖 · 实现索引

状态：本章初稿已接入 12 章教材，包含单点重心坐标与逐像素光栅化。正文分为 [lesson.md](lesson.md) 和 [raster-lesson.md](raster-lesson.md)，书籍入口会按顺序展示；本文件只记录实现入口，不重复教材。检查结果与测试数量见 [全书验收记录](../../../../../docs/verification/book-audit.md)。

## 学什么、操作什么

- 拖动 A/B/C/P，观察有向面积、重心权重、权重和、位置重建与线性颜色。
- 切换自由探针与像素中心吸附，用内部、边界、外部、共线预设检查适用条件；支持 JSON 参数保存恢复。
- 让两个三角形拼成方形，对比所有边包含与一致边规则，查看颜色和覆盖次数。
- 逐个检查包围盒候选像素、边值、权重和覆盖决定；改变绕序或穿越近平面，追踪裁剪后的三角形。
- 完成面积与权重两道 Python TODO，再把覆盖、裁剪和插值连接到第 05 章深度缓冲。

## 实现文件

| 文件 | 用途 |
| --- | --- |
| [core.py](core.py) | 单点面积、重心权重、覆盖、属性与显示编码 |
| [raster.py](raster.py) | 包围盒、边函数、共享边规则、三角形裁剪与屏幕映射；被后续章节复用 |
| [exercises.py](exercises.py) | 有向面积与权重两道 TODO |
| [test_core.py](test_core.py) / [test_raster.py](test_raster.py) | 手算、不变量、裁剪、绕序、共享边与颜色检查 |
| [lab.py](lab.py) / [raster_lab.py](raster_lab.py) | 单点实验与逐像素实验的界面装配 |
| [preview.js](preview.js) / [全书样式](../../../../../book.css) | 拖动预览与统一外观；最终数值由 Python 核对 |
| [figures/areas.svg](figures/areas.svg) | 原创面积分解图，由根目录 `tools/draw_diagrams.py` 生成 |

读码顺序为 `core.py → exercises.py → raster.py → lab.py / raster_lab.py`。核心仍是普通函数，跨章按路径导入，不建立类继承或后端框架。透视正确属性插值在第 07 章展开。

## 运行与验证

从 `graphic/` 双击 `start.command`，或执行：

```bash
uv run --locked python tools/serve.py
uv run --locked python tools/check.py
```

服务启动后打开 [第 04 章](http://localhost:5006/app?chapter=04)。第一条命令运行全书，第二条逐章执行数学测试。算法测试、浏览器交互和设备检查的范围分别记录；当前不把本地运行等同于公网部署完成。
