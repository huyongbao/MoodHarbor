#!/bin/bash
# 歇会儿 · 停止全部服务（兜底脚本）
# 用法：./stop_all.sh   —— 当 Ctrl+C 后仍有残留、或想不开终端直接清理时使用
echo "[stop] 停止所有歇会儿服务…"
STOPPED=0
for P in 8000 5174 5175 5176; do
  PID=$(lsof -nP -iTCP:$P -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "  端口 $P → 杀掉 pid $PID"
    kill $PID 2>/dev/null
    STOPPED=1
  fi
done
sleep 1
# 顽固进程强制清理
for P in 8000 5174 5175 5176; do
  PID=$(lsof -nP -iTCP:$P -sTCP:LISTEN -t 2>/dev/null)
  [ -n "$PID" ] && kill -9 $PID 2>/dev/null
done
[ "$STOPPED" = "0" ] && echo "[stop] 没有正在运行的服务"
echo "[stop] 完成"
