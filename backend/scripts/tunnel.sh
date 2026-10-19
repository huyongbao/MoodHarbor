#!/usr/bin/env bash
# 数字人 H5 公网隧道（Cloudflare Quick Tunnel）一键刷新
#
# 小程序 web-view 加载 3D 数字人必须是 https 公网地址，本地开发用
# cloudflare quick tunnel 把 :8000 暴露出去。这条链路上踩过三个坑，脚本已逐一规避：
#
#   坑 1 · QUIC 被掐：cloudflared 默认用 QUIC(UDP 443) 建隧道。挂 VPN（默认路由
#         走 utun*）时 UDP 常被拦，报错 "Failed to dial a quic connection: timeout",
#         隧道进程活着却永远连不上边缘节点。→ 默认改用 http2（TCP 443）。
#   坑 2 · 回源被代理劫持：cloudflared 是 Go 写的，回源 http://localhost:8000 时会
#         读 HTTP_PROXY。系统一开代理，回源请求就被送到 127.0.0.1 的代理端口，
#         源站永远不可达 → Cloudflare 返回 530。→ 启动时清空代理变量。
#   坑 3 · 域名漂移：quick tunnel 每次重启域名都随机变，.env 里的 PUBLIC_BASE_URL
#         没跟着改 → web-view 打开就是 Cloudflare Error 1033。→ 自动写回 .env。
#
# 用法：bash backend/scripts/tunnel.sh
# 前置：brew install cloudflared
set -uo pipefail

PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG="/tmp/moodharbor-tunnel.log"
# 协议优先级：http2 走 TCP 443，能穿只放行 TCP 的 VPN；quic 作为兜底
PROTOCOLS="${PROTOCOLS:-http2 quic}"

command -v cloudflared >/dev/null 2>&1 || {
  echo "未安装 cloudflared，请先执行：brew install cloudflared"
  exit 1
}

kill_tunnel() {
  pkill -f "cloudflared.*localhost:${PORT}" 2>/dev/null
  sleep 1
}

# 探活：新隧道要几十秒才在全网可解析，单次失败不代表不可用，重试几轮再放弃
probe() {
  local url="$1" code="" i
  for i in $(seq 1 8); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${url}" 2>/dev/null)"
    [ "${code}" = "200" ] && return 0
    sleep 6
  done
  echo "${code:-000}"
  return 1
}

# 1) 已有隧道且地址还活着 → 直接复用，不折腾
CURRENT_URL="$(grep -E '^PUBLIC_BASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
if pgrep -f "cloudflared.*localhost:${PORT}" >/dev/null 2>&1 && [ -n "$CURRENT_URL" ]; then
  if code="$(probe "${CURRENT_URL}/digital-human/index.html")"; then
    echo "隧道正常，继续使用：${CURRENT_URL}"
    exit 0
  fi
  echo "隧道进程在但地址已失效（HTTP ${code:-000}），重建"
  kill_tunnel
fi

# 2) 后端必须在，否则隧道探活永远失败
if ! curl -s -m 2 --noproxy '*' -o /dev/null "http://127.0.0.1:${PORT}/digital-human/index.html"; then
  echo "后端未就绪：http://127.0.0.1:${PORT} 无响应，请先启动后端"
  exit 1
fi

# 3) 逐个协议尝试，拿到真能用的地址为止
URL=""
for PROTO in $PROTOCOLS; do
  echo "尝试协议：${PROTO} → http://localhost:${PORT}"
  kill_tunnel
  : > "$LOG"
  # 坑 2：启动前清空代理变量，否则回源 localhost 被代理劫持 → Cloudflare 530
  nohup env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
        -u ALL_PROXY -u all_proxy \
        NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1" \
        cloudflared tunnel --url "http://localhost:${PORT}" \
        --protocol "$PROTO" --no-autoupdate > "$LOG" 2>&1 &
  disown 2>/dev/null || true

  CAND=""
  for _ in $(seq 1 30); do
    CAND="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)"
    [ -n "$CAND" ] && break
    sleep 1
  done

  if [ -z "$CAND" ]; then
    echo "  ✗ ${PROTO}：30 秒内没拿到隧道地址"
    continue
  fi

  if code="$(probe "${CAND}/digital-human/index.html")"; then
    echo "  ✓ ${PROTO} 可用：${CAND}"
    URL="$CAND"
    break
  fi
  echo "  ✗ ${PROTO}：探活失败（HTTP ${code:-000}）"
done

if [ -z "${URL}" ]; then
  echo "全部协议均失败 —— 数字人会走 2D 兜底页（语音对话不受影响）。常见原因："
  echo "  · VPN / 代理拦截出站（可试关掉 VPN 后重跑本脚本）"
  echo "  · cloudflared 版本过旧（brew upgrade cloudflared）"
  echo "日志：$LOG"
  kill_tunnel
  exit 1
fi

# 4) 写回 .env
# 不用 sed -i：BSD sed 要 `sed -i ''`、GNU sed 一个空参数就会把脚本当文件名，
# 两种环境行为不一致（踩过）。统一走临时文件覆盖，macOS / Linux 都稳。
TMP_ENV="$(mktemp)"
if [ -f "$ENV_FILE" ]; then
  grep -v '^PUBLIC_BASE_URL=' "$ENV_FILE" > "$TMP_ENV" 2>/dev/null || true
else
  : > "$TMP_ENV"
fi
printf '# 对外 HTTPS 地址（cloudflare 隧道，由 scripts/tunnel.sh 自动维护，勿手改）\nPUBLIC_BASE_URL=%s\n' "$URL" >> "$TMP_ENV"
mv "$TMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true
echo "已写入 .env → PUBLIC_BASE_URL=${URL}"
echo "后端按 .env 修改时间热读该地址，无需重启后端"
