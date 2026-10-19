#!/bin/bash
# ============================================================
# 歇会儿（MoodHarbor）· 一键启动全部服务
# 用法：在项目根目录执行  ./start_all.sh   （或 bash start_all.sh）
#
# 特性：
#   · 前台运行，日志实时打印到终端（[backend] / [admin] 前缀区分服务）
#   · 同时落盘 /tmp/moodharbor_backend.log 和 /tmp/moodharbor_admin.log
#   · Ctrl+C 一键停止全部服务
#   · 自动绕过系统代理（代理会劫持 localhost 请求导致 502）
#   · 启动前自动清理端口上的旧实例
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---- 绕过系统代理（关键：代理会劫持 localhost 请求返回 502）----
export NO_PROXY="localhost,127.0.0.1"
export no_proxy="localhost,127.0.0.1"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'
info()  { echo -e "${GREEN}[start]${NC} $1"; }
fail()  { echo -e "${RED}[start]${NC} $1"; }

# ---- 清理残留：本项目端口 + 数字人公网隧道（cloudflared）----
pkill -f "cloudflared.*localhost:8000" 2>/dev/null && \
  echo -e "${YELLOW}[start]${NC} 已停止残留的公网隧道进程"
for P in 8000 5174 5175 5176; do
  PID=$(lsof -nP -iTCP:$P -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$PID" ]; then
    kill $PID 2>/dev/null
    echo -e "${YELLOW}[start]${NC} 已停止端口 $P 上的旧进程 (pid $PID)"
  fi
done
sleep 1

cleanup() {
  echo ""
  echo -e "${YELLOW}[start]${NC} 正在停止所有服务…"
  # 公网隧道（cloudflared）一并收掉，否则下次启动会撞上旧隧道
  pkill -f "cloudflared.*localhost:8000" 2>/dev/null
  # 两轮：先 TERM 再 KILL（后台管道进程可能忽略 TERM）
  for P in 8000 5174 5175 5176; do
    PID=$(lsof -nP -iTCP:$P -sTCP:LISTEN -t 2>/dev/null)
    [ -n "$PID" ] && kill $PID 2>/dev/null
  done
  sleep 1
  for P in 8000 5174 5175 5176; do
    PID=$(lsof -nP -iTCP:$P -sTCP:LISTEN -t 2>/dev/null)
    [ -n "$PID" ] && kill -9 $PID 2>/dev/null
  done
  exit 0
}
trap cleanup INT TERM

echo "=============================================="
echo " 歇会儿 · 服务启动"
echo "   后端 API     → http://localhost:8000"
echo "   管理后台     → http://localhost:5174（以 [admin] 日志实际输出为准）"
echo "   小程序端     → 请用微信开发者工具打开 miniprogram/ 目录"
echo "   按 Ctrl+C 停止全部服务"
echo "=============================================="

# ---------- 后端 FastAPI（:8000）----------
cd "$ROOT/backend"
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 \
  | awk -v c="$CYAN" -v n="$NC" '{ printf "%s[backend]%s %s\n", c, n, $0; fflush() }' \
  | tee -a /tmp/moodharbor_backend.log &

# ---------- 管理后台前端 vite（:5174）----------
cd "$ROOT/admin"
NPM="$(command -v npm || echo /Users/nanxijun/.workbuddy-ai/binaries/node/versions/22.22.2-6/bin/npm)"
"$NPM" run dev 2>&1 \
  | awk -v c="$MAGENTA" -v n="$NC" '{ printf "%s[admin]%s %s\n", c, n, $0; fflush() }' \
  | tee -a /tmp/moodharbor_admin.log &

# ---------- 后端就绪检查（最多 20s）----------
ok=0
for i in $(seq 1 20); do
  curl -s -m 2 --noproxy '*' http://127.0.0.1:8000/ -o /dev/null 2>/dev/null && { ok=1; break; }
  sleep 1
done
if [ "$ok" = "1" ]; then
  info "✅ 后端就绪 http://localhost:8000"
else
  fail "❌ 后端 20 秒内未就绪，请查看上方 [backend] 日志定位错误"
fi

# ---------- 数字人公网隧道（cloudflared → HTTPS 公网地址）----------
# 必须起：小程序 web-view 只认 https 公网地址，没有它数字人就是一片空白。
# 隧道默认走 http2（TCP 443）—— 挂 VPN 时 QUIC(UDP) 常被拦，这是踩过的坑。
info "正在建立数字人公网隧道（约 10~30 秒）…"
bash "$ROOT/backend/scripts/tunnel.sh" 2>&1 \
  | awk -v c="$YELLOW" -v n="$NC" '{ printf "%s[tunnel]%s %s\n", c, n, $0; fflush() }' \
  | tee -a /tmp/moodharbor_tunnel.log

info "全部服务已拉起，日志持续输出中（Ctrl+C 停止）…"
wait
