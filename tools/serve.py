"""启动交互教材与 Python 渲染服务；Ctrl+C 停止子进程。"""
import argparse
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="启动图形学交互教材与 Python 渲染服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5006)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口需要在 1–65535 之间")
    try:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind((args.host, args.port))
    except OSError as error:
        alternative = args.port + 1 if args.port < 65535 else 5006
        parser.exit(1, f"无法监听 {args.host}:{args.port}：{error}\n可换端口：--port {alternative}\n")
    root = Path(__file__).resolve().parents[1]
    command = [sys.executable, str(root / "studio.py"),
               "--host", args.host, "--port", str(args.port)]
    process = subprocess.Popen(command, cwd=root)
    local_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    url = f"http://{local_host}:{args.port}/app?chapter=01"
    try:
        for _ in range(100):
            if process.poll() is not None:
                return process.returncode
            try:
                with urlopen(url, timeout=.3) as response:
                    if response.status == 200:
                        print(f"\n教材已启动：{url}\n按 Ctrl+C 停止。", flush=True)
                        if not args.no_browser:
                            webbrowser.open(url)
                        break
            except (URLError, TimeoutError):
                time.sleep(.1)
        else:
            print("服务启动较慢，请查看上方日志；未自动打开浏览器。", flush=True)
        return process.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    sys.exit(main())
