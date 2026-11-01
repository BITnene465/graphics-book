"""先识别公式，再交给 MathJax；避免 Markdown 吞掉矩阵换行、下划线和 <。"""
from mdit_py_plugins.dollarmath import dollarmath_plugin


def mathjax_plugin(parser):
    def render(tex, options):
        # 这些原稿来自书内文件。Panel 在插入 HTML 前先将整段 TeX 转为 SVG。
        return f"$${tex}$$" if options["display_mode"] else rf"\({tex}\)"

    dollarmath_plugin(parser, renderer=render, allow_labels=False)
