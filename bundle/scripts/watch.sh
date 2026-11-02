#!/bin/bash
# dsh-wiki-rag 热重载开发脚本
# - 改 client/ → 只构建，提示刷新浏览器（不重启 DSH）
# - 改 host/   → 构建 + 重启 DSH

set -e
cd "$(dirname "$0")/.."

BUILD_CMD="npm run build"
DSH_CMD=".dsh-host/node_modules/.bin/dsh"
DSH_PROFILE=".dsh-host/profiles/web"

echo "🔥 dsh-wiki-rag 热重载开发模式"
echo "   client 改动 → 只刷新浏览器（不重启）"
echo "   host   改动 → 自动重启 DSH"
echo "   Ctrl+C 退出"
echo ""

# 初始构建
echo "📦 初始构建..."
$BUILD_CMD

# 启动 DSH
start_dsh() {
  echo "🚀 启动 DSH..."
  $DSH_CMD run --profile "$DSH_PROFILE" --no-sandbox &
  DSH_PID=$!
  echo "   DSH PID: $DSH_PID"
}

stop_dsh() {
  if [ -n "$DSH_PID" ]; then
    echo "🛑 停止 DSH (PID: $DSH_PID)..."
    kill $DSH_PID 2>/dev/null || true
    wait $DSH_PID 2>/dev/null || true
  fi
}

trap stop_dsh EXIT INT TERM

start_dsh
echo ""

# 监听文件变化
echo "👂 监听文件变化..."
LAST_CLIENT=0
LAST_HOST=0

while true; do
  sleep 1
  NOW=$(date +%s)
  
  # 检查 client 文件变化
  CLIENT_CHANGED=$(find src/client -name '*.ts' -o -name '*.tsx' 2>/dev/null | xargs stat -c '%Y' 2>/dev/null | sort -rn | head -1)
  if [ -n "$CLIENT_CHANGED" ] && [ "$CLIENT_CHANGED" -gt "$LAST_CLIENT" ]; then
    LAST_CLIENT=$NOW
    echo ""
    echo "🔄 [client] 重新构建..."
    $BUILD_CMD
    echo "✅ 构建完成 → 刷新浏览器即可（不用重启 DSH）"
    echo ""
    continue
  fi
  
  # 检查 host 文件变化
  HOST_CHANGED=$(find src/host -name '*.ts' 2>/dev/null | xargs stat -c '%Y' 2>/dev/null | sort -rn | head -1)
  if [ -n "$HOST_CHANGED" ] && [ "$HOST_CHANGED" -gt "$LAST_HOST" ]; then
    LAST_HOST=$NOW
    echo ""
    echo "🔄 [host] 重新构建 + 重启 DSH..."
    $BUILD_CMD
    stop_dsh
    sleep 1
    start_dsh
    echo ""
  fi
done
