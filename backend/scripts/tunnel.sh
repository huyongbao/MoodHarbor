#!/usr/bin/env bash
# 数字人 H5 公网隧道一键刷新
# 背景：小程序 web-view 加载 3D 数字人需要 https 地址，
#       之前用手工起的 cloudflare quick tunnel，隧道一断/一重启地址就变，
#       .env 里的 PUBLIC_BASE_URL 没跟着改 → web-view 打开就是 Cloudflare Error 1033。
#
# 用法：bash backend/scripts/tunnel.sh
# 前置：brew install cloudflared
set -euo pipefail

PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG="/tmp/moodharbor-tunnel.log"

command -v cloudflared >/dev/null 2>&1 || {
  echo "未安装 cloudflared，请先执行：brew install cloudflared"
  exit 1
}

# 1) 隧道进程：已在跑且地址还活着就复用，否则重起一条
CURRENT_URL="$(grep -E '^PUBLIC_BASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
if pgrep -f "cloudflared tunnel --url http://localhost:$PORT" >/dev/null 2>&1 && [ -n "$CURRENT_URL" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$CURRENT_URL/digital-human/index.html" || echo 000)"
  if [ "$CODE" = "200" ]; then
    echo "隧道正常，继续使用：$CURRENT_URL"
    exit 0
  fi
  echo "隧道进程在但地址已失效（HTTP $CODE），重起一条"
  pkill -f "cloudflared tunnel --url http://localhost:$PORT" || true
  sleep 1
fi

echo "启动隧道 → http://localhost:$PORT"
: > "$LOG"
nohup cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate > "$LOG" 2>&1 &
disown || true

# 2) 等 cloudflared 把 https 地址打印到日志
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "30 秒内没拿到隧道地址，查看日志：$LOG"
  exit 1
fi
echo "隧道地址：$URL"

# 3) 探活：确认后端 H5 能经隧道访问
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/digital-human/index.html" || echo 000)"
if [ "$CODE" != "200" ]; then
  echo "探活失败（HTTP $CODE）：确认后端已在 $PORT 端口启动"
  exit 1
fi

# 4) 写回 .env
if grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE" 2>/dev/null; then
  sed -i '' "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$URL|" "$ENV_FILE"
else
  printf '\n# 对外 HTTPS 地址（cloudflare 隧道）\nPUBLIC_BASE_URL=%s\n' "$URL" >> "$ENV_FILE"
fi
echo "已更新 $ENV_FILE"

# 5) 后端读的是启动时的环境变量，必须重启才生效；
#    --reload 模式下 touch 一下 config.py 即可让子进程重读 .env
touch "$ROOT/config.py"
echo "已触发 --reload；若后端不是 --reload 启动，请手动重启："
echo "  cd backend && .venv/bin/uvicorn main:app --reload --port 8000"
