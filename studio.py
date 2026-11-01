"""交互书的小服务器：静态界面、教材、源码和 Python 渲染，标准库即可读懂。"""
from __future__ import annotations

import argparse
import html
import io
import json
import mimetypes
from pathlib import Path
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore
from urllib.parse import parse_qs, quote, unquote, urlsplit
import zipfile

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from studio_render import ROOT, MODULES, PATHS, catalog, render
import teaching_figures

RENDER_SLOTS = BoundedSemaphore(2)
DOCUMENTS = {
    "math": ROOT / "resources/math/bridge.md",
    "glossary": ROOT / "resources/reading/glossary.md",
    "classics": ROOT / "resources/reading/classics.md",
    "capstone": ROOT / "courses/graphics-foundations/capstone.md",
}
SKIP = {".venv", "__pycache__", ".git", "outputs", ".DS_Store"}
SOURCE_NAMES = {".python-version", ".gitignore", "LICENSE", "LICENSE-CONTENT"}
SOURCE_SUFFIXES = {".py", ".js", ".css", ".html", ".md", ".toml", ".lock", ".command", ".json", ".svg", ".yml", ".yaml", ".txt"}


def chapter_dir(chapter):
    if chapter not in {item["id"] for item in catalog()}:
        raise ValueError("未知章节")
    return MODULES / PATHS[int(chapter)-1]


def source_path(relative):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or set(path.relative_to(ROOT).parts) & SKIP:
        raise ValueError("文件不在教材目录中")
    if not path.is_file() or path.suffix not in SOURCE_SUFFIXES and path.name not in SOURCE_NAMES:
        raise ValueError("找不到这个源码文件")
    return path


def source_tree(chapter):
    directory = chapter_dir(chapter)
    groups = [{"label": "本章完整源码", "files": sorted(p for p in directory.iterdir() if p.suffix in {".py", ".js"})}]
    # Include the algorithms actually reused by the bridge and chapter cores.
    reused = {
        "01": [], "02": ["01"], "03": ["01", "04", "09", "10"],
        "04": ["01"], "05": ["01", "03", "04"],
        "06": ["01", "04", "10"], "07": ["01", "03", "04", "06"],
        "08": ["01", "04"], "09": ["01", "03", "04"],
        "10": ["01", "03", "04", "09"], "11": ["01"],
        "12": ["01", "03", "10"],
        "13": ["01", "03", "04", "06", "07"],
        "14": ["01", "03", "10"],
        "15": ["01", "03", "04", "06", "07", "11"],
    }
    dependencies = [chapter_dir(other) / "core.py" for other in reused[chapter]]
    if "04" in reused[chapter]:
        dependencies.append(chapter_dir("04") / "raster.py")
    if chapter == "12":
        groups.append({"label": "综合实践", "files": [ROOT / "projects/foundation-renderer/main.py"]})
    groups += [{"label": "可追溯的基础算法", "files": dependencies},
               {"label": "教学插图与渲染桥", "files": [ROOT / p for p in (
                   "teaching_figures.py", "web/teaching-figures.js", "studio_render.py", "studio.py", "web/viewport2d.js", "web/viewport3d.js",
                   "web/studio.js", "web/render-comparison.js", "web/figure-exploration.css", "web/editor-polish.css", "web/studio.css", "web/index.html", "tools/serve.py", "pyproject.toml")]}]
    return [{"label": group["label"], "files": [{"path": p.relative_to(ROOT).as_posix(), "name": p.name,
              "chapter": p.parent.name, "lines": len(p.read_text(encoding="utf-8").splitlines())} for p in group["files"] if p.is_file()]} for group in groups]


def lesson_html(chapter, document="lesson"):
    directory = chapter_dir(chapter)
    source = directory / "lesson.md" if document == "lesson" else DOCUMENTS.get(document)
    if source is None:
        raise ValueError("未知阅读文档")
    chunks = [(source, source.read_text(encoding="utf-8"))]
    if chapter == "04" and document == "lesson":
        extra = directory / "raster-lesson.md"
        chunks.append((extra, extra.read_text(encoding="utf-8")))
    # 仅支持同目录的一个 Markdown 文件，供作者把长章拆成可读的小节文件。
    # 保留每段来源路径，源码/附件链接仍相对它实际所在的章节解析。
    expanded=[]
    for path,text in chunks:
        for index,part in enumerate(re.split(r"(?m)^\[\[include:([a-z0-9-]+\.md)\]\]$",text)):
            included=path.parent/part if index%2 else path
            expanded.append((included,included.read_text(encoding="utf-8") if index%2 else part))
    chunks=expanded
    toc, counter = [], 0
    output = []
    for path, markdown in chunks:
        def tex_renderer(tex, options):
            mode = "block" if options["display_mode"] else "inline"
            return f'<span class="tex tex-{mode}" data-tex="{html.escape(tex, quote=True)}">{html.escape(tex)}</span>'
        parser = MarkdownIt("commonmark", {"html": False}).enable("table")
        parser.use(dollarmath_plugin, renderer=tex_renderer, allow_labels=False)
        tokens = parser.parse(markdown)
        for index, token in enumerate(tokens):
            if token.type == "heading_open":
                counter += 1
                identifier = f"section-{counter}"
                token.attrSet("id", identifier)
                label = tokens[index+1].content
                toc.append({"id": identifier, "label": label, "level": int(token.tag[1])})
            for child in token.children or []:
                attribute = "src" if child.type == "image" else "href" if child.type == "link_open" else None
                if not attribute:
                    continue
                href = child.attrGet(attribute) or ""
                if urlsplit(href).scheme or href.startswith("#"):
                    continue
                target = (path.parent / unquote(href.split("#")[0])).resolve()
                if not target.is_relative_to(ROOT):
                    continue
                relative = target.relative_to(ROOT).as_posix()
                if child.type == "image":
                    child.attrSet(attribute, "/content/" + quote(relative))
                elif target.suffix in {".py", ".js"}:
                    child.attrSet(attribute, f"/app?chapter={chapter}&tab=source&file=" + quote(relative))
                elif target in DOCUMENTS.values():
                    name = next(key for key, value in DOCUMENTS.items() if value == target)
                    child.attrSet(attribute, f"/app?chapter={chapter}&document={name}")
                elif target.name == "lesson.md":
                    match = re.match(r"(\d\d)-", target.parent.name)
                    if match:
                        child.attrSet(attribute, f"/app?chapter={match[1]}&tab=read")
                else:
                    child.attrSet(attribute, "/content/" + quote(relative))
        rendered = parser.renderer.render(tokens, parser.options, {})
        rendered = re.sub(r'<p>\[\[demo:([a-z0-9-]+)\]\]</p>',
                          r'<div class="figure-slot" data-figure="\1"></div>', rendered)
        output.append(rendered)
    return {"html": "\n".join(output), "toc": toc, "path": source.relative_to(ROOT).as_posix()}


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, data, content_type, status=200, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, value, status=200):
        self.send_bytes(json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), "application/json; charset=utf-8", status)

    def do_GET(self):
        parsed = urlsplit(self.path)
        route, query = unquote(parsed.path), parse_qs(parsed.query)
        chapter = query.get("chapter", ["01"])[0]
        try:
            if route == "/api/figures":
                return self.send_json(teaching_figures.catalog())
            if route == "/api/catalog":
                return self.send_json(catalog())
            if route == "/api/lesson":
                return self.send_json(lesson_html(chapter, query.get("document", ["lesson"])[0]))
            if route == "/api/source-tree":
                return self.send_json(source_tree(chapter))
            if route == "/api/source":
                path = source_path(query.get("path", [""])[0])
                code = path.read_text(encoding="utf-8")
                language = {".py": "python", ".js": "javascript", ".css": "css", ".html": "markup", ".svg": "markup"}.get(path.suffix, "plain")
                return self.send_json({"path": path.relative_to(ROOT).as_posix(), "language": language, "text": code, "lineCount": len(code.splitlines())})
            if route == "/api/download":
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
                    for path in ROOT.rglob("*"):
                        relative = path.relative_to(ROOT)
                        if path.is_file() and not set(relative.parts) & SKIP and (path.suffix in SOURCE_SUFFIXES | {".woff2", ".png"} or path.name.endswith("LICENSE") or path.name in SOURCE_NAMES):
                            archive.write(path, "graphic/" + relative.as_posix())
                return self.send_bytes(buffer.getvalue(), "application/zip", headers={"Content-Disposition": 'attachment; filename="graphic-source.zip"'})
            if route in ("/", "/app"):
                path = ROOT / "web/index.html"
            elif route.startswith("/web/"):
                path = (ROOT / route.lstrip("/")).resolve()
                if not path.is_relative_to(ROOT / "web") or not path.is_file():
                    raise ValueError("找不到资源")
            elif route.startswith("/content/"):
                path = source_path(route.removeprefix("/content/"))
            elif route == "/favicon.ico":
                return self.send_bytes(b"", "image/x-icon", 204)
            else:
                return self.send_json({"error": "找不到页面"}, 404)
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".js":
                mime = "text/javascript"
            return self.send_bytes(path.read_bytes(), mime + ("; charset=utf-8" if mime.startswith("text/") else ""))
        except (ValueError, FileNotFoundError, OSError) as error:
            self.send_json({"error": str(error)}, 404)

    def do_POST(self):
        route = urlsplit(self.path).path
        if route not in {"/api/render", "/api/figure"}:
            return self.send_json({"error": "找不到接口"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 65536:
                raise ValueError("请求长度无效")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError("请求应为 JSON 对象")
            if route == "/api/figure":
                result = teaching_figures.render(body.get("id", ""), body.get("params", {}), body.get("progress", 1))
            else:
                with RENDER_SLOTS:
                    result = render(body.get("chapter", ""), body.get("params", {}))
            self.send_json(result)
        except (ValueError, TypeError, KeyError) as error:
            self.send_json({"error": str(error)}, 400)
        except BrokenPipeError:
            pass
        except Exception as error:
            print(f"Render failed: {type(error).__name__}: {error}", flush=True)
            self.send_json({"error": "渲染未完成，请重置参数后重试。"}, 500)

    def log_message(self, format, *args):
        if str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Python 图形学交互书")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5006)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Graphic Studio → http://{args.host}:{args.port}/app?chapter=01", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
