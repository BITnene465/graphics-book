"""书的公式通道回归检查，配合浏览器矩阵/分段函数视觉验收。"""
from html import unescape
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import panel as pn
except ImportError:
    pn = None
from book_math import mathjax_plugin


@unittest.skipIf(pn is None, "旧 Panel 入口需 uv run --extra legacy")
class MathMarkupTests(unittest.TestCase):
    def render(self, text):
        pane = pn.pane.Markdown(text, plugins=[mathjax_plugin])
        return unescape(pane._transform_object(text)["object"])

    def test_matrix_survives_markdown(self):
        tex = r"\begin{bmatrix}r_x&r_y\\u_x&u_y\end{bmatrix}"
        result = self.render("$$\n" + tex + "\n$$")
        self.assertIn("$$" + tex + "$$", result)
        self.assertNotIn("&amp;", result)

    def test_inequality_and_subscript(self):
        result = self.render(r"前方满足 $z_{view}<0$，而 $x_i+x_j$ 保留两个下标。")
        self.assertIn(r"\(z_{view}<0\)", result)
        self.assertIn(r"\(x_i+x_j\)", result)

    def test_code_remains_code(self):
        result = self.render('```python\ntext = "$cost$"\n```')
        self.assertNotIn('class="math', result)


if __name__ == "__main__":
    unittest.main()
