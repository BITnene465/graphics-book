"""一本书的薄入口：目录、按路径加载一章、正文与代码。算法留在各章 core.py。"""

from html import escape
import base64
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import re
import sys

import panel as pn
from bokeh.events import DocumentReady
from bokeh.models import CustomJS
from book_math import mathjax_plugin

ROOT = Path(__file__).parent
MODULES = ROOT / "courses/graphics-foundations/modules"
CSS = (ROOT / "book.css").read_text()
pn.extension("mathjax", raw_css=["body { margin:0; background:#f7f9f3; }"])

# 目录就是普通数据。算法仍各自完整地留在单元内，不需要注册或继承。
PARTS = ["图像与空间", "光栅化与可见性", "表面与采样", "阴影与几何", "光线追踪"]
CHAPTERS = [
    ("01", 0, "01-images-and-space/01-pixels", "像素与颜色", "图像是一张表，还是一扇窗？", "离散采样 · 线性光 · 显示编码"),
    ("02", 0, "01-images-and-space/02-transforms", "坐标与变换", "一张矩阵，怎样移动整个世界？", "基向量 · 齐次坐标 · 变换顺序"),
    ("03", 0, "01-images-and-space/03-camera", "相机与投影", "三维世界，怎样落到二维屏幕？", "相似三角形 · 相机坐标 · 齐次裁剪"),
    ("04", 1, "02-rasterization/04-barycentric", "重心坐标", "一个像素的颜色，从哪里来？", "有向面积 · 覆盖判断 · 属性插值"),
    ("05", 1, "02-rasterization/05-depth", "深度与遮挡", "谁挡住了谁？", "深度缓冲 · 插值 · 可见性"),
    ("06", 2, "03-surface-and-sampling/06-lighting", "法线与光照", "形状为什么有明暗？", "点积 · 法线变换 · 局部光照"),
    ("07", 2, "03-surface-and-sampling/07-textures", "UV 与纹理", "一张图，怎样贴到倾斜的表面？", "参数化 · 透视校正 · 纹理过滤"),
    ("08", 2, "03-surface-and-sampling/08-sampling", "采样与抗锯齿", "更多像素，为什么仍会看错？", "混叠 · 像素积分 · 重建"),
    ("09", 3, "04-shadows-and-geometry/09-shadows", "阴影映射", "从光源看过去，会看见什么？", "光源相机 · 深度比较 · 偏移"),
    ("10", 3, "04-shadows-and-geometry/10-geometry", "几何表示", "同一个形状，可以有几种写法？", "网格 · 隐式方程 · 参数曲面"),
    ("11", 3, "04-shadows-and-geometry/11-bezier", "Bézier 曲线", "直线插值，怎样弯成曲线？", "递归插值 · 基函数 · 切线"),
    ("12", 4, "05-raytracing/12-rays", "光线追踪", "从一个像素出发，追到光的来处。", "射线 · 求交 · 遮挡与反射"),
]
REFERENCES = {
    "math": ("数学补给", ROOT / "resources/math/bridge.md"),
    "glossary": ("中英术语与符号", ROOT / "resources/reading/glossary.md"),
    "classics": ("经典教材导读", ROOT / "resources/reading/classics.md"),
    "capstone": ("综合实践", ROOT / "courses/graphics-foundations/capstone.md"),
}


def html(text, **kwargs):
    return pn.pane.HTML(text, stylesheets=[CSS], sizing_mode="stretch_width", **kwargs)


def markdown(text, *, reading=False, math=True, source_dir=None):
    source_dir = source_dir or directory
    # 原稿用普通相对图片路径，浏览器用内嵌图片，无须另起静态资源服务。
    def local_image(match):
        path = (source_dir / match[2]).resolve()
        if ROOT not in path.parents or not path.is_file() or path.suffix != ".svg":
            return match[0]
        data = base64.b64encode(path.read_bytes()).decode()
        return f'<figure class="book-figure"><img alt="{escape(match[1], quote=True)}" src="data:image/svg+xml;base64,{data}"></figure>'
    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", local_image, text)
    # 本地 Markdown 可独立阅读；网页把课程/补充资料链接变成书内导航。
    def book_url(target):
        if target.startswith(("http:", "https:", "#", "?")):
            return target
        path = (source_dir / target.split("#")[0]).resolve()
        for key, (_, reference) in REFERENCES.items():
            if path == reference:
                return f"?chapter={number}&reference={key}"
        for item in CHAPTERS:
            if path.parent == MODULES / item[2]:
                suffix = "&view=code" if path.suffix == ".py" else ""
                if path.name == "exercises.py":
                    suffix = "&view=exercise"
                if path.name == "raster.py":
                    suffix += "&source=raster.py"
                return f"?chapter={item[0]}{suffix}"
        return target
    text = re.sub(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)", lambda m: f"[{m[1]}]({book_url(m[2])})", text)
    text = re.sub(r"^(\[[^\]]+\]:\s*)(\S+)$", lambda m: m[1] + book_url(m[2]), text, flags=re.MULTILINE)
    return pn.pane.Markdown(text, stylesheets=[CSS], sizing_mode="stretch_width",
                           plugins=[mathjax_plugin] if math else [],
                           disable_math=not math, margin=(18, 0),
                           styles={"max-width": "780px" if reading else "100%", "margin": "20px auto"})


def available(chapter):
    directory = MODULES / chapter[2]
    return all((directory / name).exists() for name in ("lab.py", "core.py", "lesson.md", "exercises.py"))


def chapter_link(chapter, label=None):
    number, _, _, title, *_ = chapter
    return f'<a href="?chapter={number}">{escape(label or number + " · " + title)}</a>'


ready = [c for c in CHAPTERS if available(c)]
requested = pn.state.session_args.get("chapter", [ready[0][0].encode()])[0].decode(errors="replace")
chapter = next((c for c in ready if c[0] == requested), ready[0])
number, part, relative, title, question, concepts = chapter
directory = MODULES / relative

contents = []
for index, name in enumerate(PARTS):
    entries = []
    for item in (c for c in CHAPTERS if c[1] == index):
        if item == chapter:
            entries.append(f'<strong aria-current="page">{item[0]} · {item[3]}</strong>')
        elif available(item):
            entries.append(chapter_link(item))
        else:
            entries.append(f'<span class="unwritten">{item[0]} · {item[3]} <small>待编写</small></span>')
    contents.append(f'<section><h3>{index + 1:02} / {name}</h3><p>' + '<br>'.join(entries) + '</p></section>')

header = html(f'''<div class="masthead"><a class="brand" href="?chapter=01">图形学：从几何到像素</a>
<span class="trail">Graphic Lab / 可交互电子教材</span></div>
<details class="book-contents"><summary>全书目录 <span>5 篇 · 12 章 · 已开放 {len(ready)} 章</span></summary>
<div class="contents-grid">{''.join(contents)}</div></details>
<div class="heading"><span class="lesson-no">{number}</span><div><div class="eyebrow">{PARTS[part]} / {title}</div>
<h1>{question}</h1><p class="subtitle">{concepts}</p></div></div>''')

# 每次会话只装配一章；相对导入防止同名 core.py 互相串用。
module_name = f"graphic_chapter_{number}"
spec = spec_from_file_location(module_name, directory / "lab.py", submodule_search_locations=[str(directory)])
module = module_from_spec(spec)
sys.modules[module_name] = module
spec.loader.exec_module(module)
experiment = module.build()
for pane in experiment.select(pn.viewable.Viewable):
    if hasattr(pane, "stylesheets") and CSS not in pane.stylesheets:
        pane.stylesheets = [CSS, *pane.stylesheets]
    if isinstance(pane, pn.pane.Markdown) and not pane.disable_math:
        pane.plugins = [mathjax_plugin]

lesson_text = (directory / "lesson.md").read_text().split("\n", 1)[1]
if (directory / "raster-lesson.md").exists():
    lesson_text += "\n\n" + (directory / "raster-lesson.md").read_text()
headings = []


def reading_anchor(match):
    anchor = f"reading-{len(headings) + 1}"
    headings.append(f'<a href="#{anchor}">{escape(match[1])}</a>')
    return f'<a id="{anchor}"></a>\n\n## {match[1]}'


lesson_text = re.sub(r"^## (.+)$", reading_anchor, lesson_text, flags=re.MULTILINE)
lesson_text = '<nav class="reading-toc"><b>本章路线</b>' + ''.join(headings) + '</nav>\n\n' + lesson_text
lesson = markdown(lesson_text, reading=True)
core_source = (directory / "core.py").read_text()
source_label = html(f'<div class="code-path">core.py · {len(core_source.splitlines())} 行 · 本章实际运行的 Python 源码</div>')
source_text = markdown("```python\n" + core_source + "\n```", math=False)
source = pn.Column(source_label, source_text, sizing_mode="stretch_width")
if (directory / "raster.py").exists():
    choose_source = pn.widgets.Select(name="阅读算法文件", options=["core.py", "raster.py"], width=220)
    def change_source(event):
        code = (directory / event.new).read_text()
        source_label.object = f'<div class="code-path">{event.new} · {len(code.splitlines())} 行 · 本章实际运行的 Python 源码</div>'
        source_text.object = "```python\n" + code + "\n```"
    choose_source.param.watch(change_source, "value")
    source.insert(0, choose_source)
    if pn.state.session_args.get("source") == [b"raster.py"]:
        choose_source.value = "raster.py"
exercise_path = f"courses/graphics-foundations/modules/{relative}/exercises.py"
exercise = pn.Column(markdown(f'''## 先试着写，再打开参考实现

在本章 `exercises.py` 中完成两个函数。先写出预测，用反馈检验，再回到正文解释原因。

```sh
# 从 graphic/ 目录运行
uv run --locked python {exercise_path}
```

下面显示实际练习文件。答案在「Python 核心」里，尝试前可以先不打开。''', reading=True),
                     markdown("```python\n" + (directory / "exercises.py").read_text() + "\n```", math=False),
                     sizing_mode="stretch_width")
reference_key = pn.state.session_args.get("reference", [b"math"])[0].decode(errors="replace")
reference_key = reference_key if reference_key in REFERENCES else "math"
reference_choice = pn.widgets.Select(name="随用随查", options={label: key for key, (label, _) in REFERENCES.items()}, value=reference_key, width=220, tags=["book-reference"])
def reference_content(key):
    _, path = REFERENCES[key]
    return markdown(path.read_text(), reading=True, source_dir=path.parent)
reference_text = reference_content(reference_key)
reference_choice.param.watch(lambda event: setattr(reference_text, "object", reference_content(event.new).object), "value")
references = pn.Column(reference_choice, reference_text, sizing_mode="stretch_width")
initial_tab = {b"code": 1, b"exercise": 2}.get(pn.state.session_args.get("view", [b""])[0], 0)
if "reference" in pn.state.session_args:
    initial_tab = 3
tabs = pn.Tabs(("推导与阅读", lesson), ("Python 核心", source), ("动手练习", exercise), ("查阅与拓展", references),
               active=initial_tab,
               sizing_mode="stretch_width", stylesheets=[CSS], tags=["book-reading-tabs"], dynamic=True)
focus = pn.widgets.Checkbox(name="专注阅读：收起实验", value=initial_tab != 0, stylesheets=[CSS], tags=["book-focus"])
experiment.visible = not focus.value
focus.param.watch(lambda event: setattr(experiment, "visible", not event.new), "value")

index = ready.index(chapter)
previous = chapter_link(ready[index - 1], "← 上一章 · " + ready[index - 1][3]) if index else '<span>从这一章开始</span>'
following = chapter_link(ready[index + 1], "下一章 · " + ready[index + 1][3] + " →") if index + 1 < len(ready) else '<span>完成主线 · 回到目录选择一个问题重新实验</span>'
footer = html(f'<nav class="chapter-navigation">{previous}{following}</nav><div class="footer"><span>公式、实验和 Python 共同解释一个问题。</span><span>阅读位置仅保存在本机浏览器</span></div>')
page = pn.Column(header, focus, experiment, tabs, footer, sizing_mode="stretch_width", css_classes=["book-page"], stylesheets=[CSS],
                 styles={"max-width": "1240px", "margin": "0 auto"})
pn.state.curdoc.js_on_event(DocumentReady, CustomJS(args=dict(chapter=number), code=(ROOT / "book.js").read_text()))
page.servable(title=f"{number} {title} · 图形学：从几何到像素")
