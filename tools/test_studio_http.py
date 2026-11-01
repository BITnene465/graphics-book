"""正文中的公式/附篇与完整源码读取的回归检查。"""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio


class TexParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tex = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == "data-tex":
                self.tex.append(value)


class BookDeliveryTests(unittest.TestCase):
    def test_formulas_retain_matrix_rows_subscripts_and_comparisons(self):
        for chapter in ("01", "03", "04", "12"):
            with self.subTest(chapter=chapter):
                text = (studio.chapter_dir(chapter) / "lesson.md").read_text()
                parser = TexParser()
                parser.feed(studio.lesson_html(chapter)["html"])
                for tex in re.findall(r"\$\$(.*?)\$\$", text, re.S):
                    self.assertIn(tex.strip(), [value.strip() for value in parser.tex])
                self.assertGreater(len(parser.tex), 5)

    def test_barycentric_appendix_has_all_its_headings(self):
        extra = (studio.chapter_dir("04") / "raster-lesson.md").read_text()
        labels = [item["label"] for item in studio.lesson_html("04")["toc"]]
        for heading in re.findall(r"^#{1,3} (.+)$", extra, re.M):
            self.assertIn(heading, labels)

    def test_source_paths_cannot_escape_or_read_environment(self):
        for path in ("../outside.py", "/etc/passwd", ".venv/pyvenv.cfg", "outputs/private.py"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                studio.source_path(path)

    def test_each_chapter_exposes_the_actual_complete_core(self):
        for chapter in studio.catalog():
            tree = studio.source_tree(chapter["id"])
            core = next(item for item in tree[0]["files"] if item["name"] == "core.py")
            path = studio.source_path(core["path"])
            self.assertEqual(path, studio.chapter_dir(chapter["id"]) / "core.py")
            self.assertEqual(core["lines"], len(path.read_text().splitlines()))

    def test_live_figures_resolve_to_the_right_chapter(self):
        figures = {item["id"]: item for item in studio.teaching_figures.catalog()}
        seen = []
        for chapter in studio.catalog():
            rendered = studio.lesson_html(chapter["id"])["html"]
            slots = re.findall(r'data-figure="([a-z0-9-]+)"', rendered)
            self.assertEqual(slots.count("main"), 1)
            self.assertGreaterEqual(len(slots), 3)
            self.assertNotIn("[[demo:", rendered)
            for identifier in slots:
                if identifier != "main":
                    self.assertEqual(figures[identifier]["chapter"], chapter["id"])
                    seen.append(identifier)
        self.assertEqual(set(seen), set(figures))
        self.assertEqual(len(seen), len(set(seen)))


if __name__ == "__main__":
    unittest.main()
