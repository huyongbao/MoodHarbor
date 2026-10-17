#!/usr/bin/env bash
# 一键启动后端（独立会话，关掉终端也不影响）
# 用法：bash backend/start.sh
# 停止：kill $(lsof -nP -iTCP:8000 -sTCP:LISTEN -t)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"

# 已在运行就不重复启动
OLD="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
if [ -n "$OLD" ]; then
  echo "后端已在运行（pid ${OLD}）：http://localhost:$PORT/docs"
  exit 0
fi

cd "$ROOT"
.venv/bin/python - <<PY
import subprocess
log = open("/tmp/moodharbor-backend.log", "a")
p = subprocess.Popen(
    [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$PORT"],
    stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
)
print("后端已启动 pid =", p.pid)
PY

# 等待就绪
for _ in $(seq 1 20); do
  CODE="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:$PORT/docs 2>/dev/null || echo 000)"
  [ "$CODE" = "200" ] && { echo "就绪：http://localhost:$PORT/docs"; exit 0; }
  sleep 1
done
echo "启动超时，查看日志：/tmp/moodharbor-backend.log"
exit 1
