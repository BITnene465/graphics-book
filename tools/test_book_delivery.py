"""通过真实 HTTP 检查书内链接、附录、Python 图像与下载包。"""
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import sys
import threading
import unittest
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        self.urls.extend(value for key, value in attrs if key in {"href", "src"})


class BookHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = studio.ThreadingHTTPServer(("127.0.0.1", 0), studio.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, route):
        with urlopen(self.base + route, timeout=15) as response:
            return response.read()

    def test_all_chapters_and_appendices_have_resolvable_local_links(self):
        routes = [f"/api/lesson?chapter={c['id']}" for c in studio.catalog()]
        routes += [f"/api/lesson?chapter=12&document={name}" for name in studio.DOCUMENTS]
        links = set()
        for route in routes:
            data = json.loads(self.get(route))
            self.assertTrue(data["toc"], route)
            self.assertNotIn("[[include:", data["html"], route)
            parser = Links()
            parser.feed(data["html"])
            links.update(parser.urls)
        for link in sorted(links):
            parsed = urlsplit(link)
            if parsed.scheme or link.startswith("#"):
                continue
            with self.subTest(link=link):
                self.assertTrue(self.get(link))
                if parsed.path == "/app":
                    query = parse_qs(parsed.query)
                    studio.chapter_dir(query["chapter"][0])
                    if "file" in query:
                        studio.source_path(unquote(query["file"][0]))

    def test_capstone_stays_in_the_book_and_links_to_actual_source(self):
        last = json.loads(self.get("/api/lesson?chapter=12"))["html"]
        self.assertIn("/app?chapter=12&amp;document=capstone", last)
        capstone = json.loads(self.get("/api/lesson?chapter=12&document=capstone"))["html"]
        self.assertIn("projects/foundation-renderer/main.py", capstone)
        self.assertNotIn('data-figure="main"', capstone)

    def test_runtime_resources_and_python_render_work_over_http(self):
        parser = Links()
        parser.feed(self.get("/app?chapter=01").decode())
        for url in parser.urls:
            if url.startswith("/web/"):
                self.assertTrue(self.get(url))
        request = Request(self.base + "/api/render", data=json.dumps({
            "chapter": "01", "params": {"size": 64}}).encode(),
            headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=15) as response:
            result = json.load(response)
        self.assertTrue(result["images"][0]["url"].startswith("data:image/png;base64,"))

    def test_source_download_contains_a_reproducible_licensed_book(self):
        with zipfile.ZipFile(io.BytesIO(self.get("/api/download"))) as archive:
            names = set(archive.namelist())
            for required in ("LICENSE", "LICENSE-CONTENT", "NOTICE.md", "uv.lock", "start.command",
                             "projects/foundation-renderer/main.py", ".github/workflows/check.yml",
                             "web/vendor/three-LICENSE", "web/vendor/katex-LICENSE",
                             "web/vendor/prismjs-LICENSE"):
                self.assertIn("graphic/" + required, names)
            self.assertTrue(any(name.endswith(".woff2") for name in names))
            self.assertFalse(any(set(Path(name).parts) & studio.SKIP for name in names))
            self.assertIsNone(archive.testzip())


if __name__ == "__main__":
    unittest.main()
