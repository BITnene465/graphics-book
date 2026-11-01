#!/bin/zsh
# macOS 双击，或在终端运行 ./start.command。
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v uv >/dev/null 2>&1; then
  print '未找到 uv。请先安装 uv：https://docs.astral.sh/uv/getting-started/installation/'
  read '?按回车退出。'
  exit 1
fi
uv run --locked python tools/serve.py "$@"
result=$?
if (( result != 0 )); then
  read '?启动未完成；请查看上方说明。按回车退出。'
fi
exit $result
