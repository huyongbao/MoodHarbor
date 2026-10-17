#!/bin/bash
# 歇会儿后端启动脚本（含自检）—— 在你自己的终端里执行
# 用法：bash backend/run.sh   或   ./backend/run.sh
cd "$(dirname "$0")"

# 关键：绕过系统代理，否则 curl/python 对 localhost 的请求会被代理劫持返回 502
export NO_PROXY="localhost,127.0.0.1"
export no_proxy="localhost,127.0.0.1"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy

pkill -f "uvicorn main:app" 2>/dev/null
sleep 1
nohup .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 \
  > /tmp/moodharbor_backend.log 2>&1 < /dev/null &
disown

# 等待就绪（最多 15s）
for i in $(seq 1 15); do
  curl -s -m 2 http://127.0.0.1:8000/ -o /dev/null 2>/dev/null && break
  sleep 1
done

if ! curl -s -m 2 http://127.0.0.1:8000/ -o /dev/null 2>/dev/null; then
  echo "❌ 后端启动失败，日志最后 20 行："
  tail -20 /tmp/moodharbor_backend.log
  exit 1
fi

# 后台关键接口自检
TOK=$(curl -s -m 5 -X POST http://127.0.0.1:8000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)

FAIL=0
for E in dashboard users conversations risk-alerts hotlines memories; do
  CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/admin/$E \
    -H "Authorization: Bearer $TOK" 2>/dev/null)
  [ "$CODE" != "200" ] && { echo "❌ /admin/$E → $CODE"; FAIL=1; }
done

if [ "$FAIL" = "0" ]; then
  echo "✅ 后端已启动且后台接口自检通过: http://localhost:8000"
  echo "   日志: /tmp/moodharbor_backend.log   管理后台: http://localhost:5174"
else
  echo "⚠️ 后端已启动但部分接口异常，日志: /tmp/moodharbor_backend.log"
fi
