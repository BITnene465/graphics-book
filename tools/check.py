"""逐章运行标准库数学测试；隔离同名 core.py。uv run python tools/check.py。"""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
total = 0
skipped = 0
failed = []
for chapter in [root / "tools", *sorted((root / "courses/graphics-foundations/modules").glob("*/*")),
                *sorted((root / "projects").glob("*"))]:
    if not list(chapter.glob("test_*.py")):
        continue
    result = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", str(chapter),
                             "-p", "test_*.py"], capture_output=True, text=True)
    match = re.search(r"Ran (\d+) tests?", result.stderr)
    count = int(match[1]) if match else 0
    total += count
    skip_match = re.search(r"skipped=(\d+)", result.stderr)
    skip_count = int(skip_match[1]) if skip_match else 0
    skipped += skip_count
    note = f" · {skip_count} optional tests skipped" if skip_count else ""
    print(f"{chapter.name}: {count} tests · {'PASS' if result.returncode == 0 else 'FAIL'}{note}", flush=True)
    if result.returncode:
        failed.append(chapter.name)
        print(result.stdout + result.stderr)
print(f"Total: {total} tests; passed: {total - skipped}; skipped: {skipped}; failed chapters: {len(failed)}")
sys.exit(bool(failed))
