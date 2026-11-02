#!/bin/bash
# dsh-wiki-rag 热重载开发脚本
# 监听源码变化 → 自动构建 → 自动重启 DSH

set -e
cd "$(dirname "$0")/.."

WATCH_DIR="src"
BUILD_CMD="npm run build"
DSH_CMD=".dsh-host/node_modules/.bin/dsh"
DSH_PROFILE=".dsh-host/profiles/web"

echo "🔥 dsh-wiki-rag 热重载开发模式"
echo "   监听目录: $WATCH_DIR/"
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

# 退出时清理
trap stop_dsh EXIT INT TERM

start_dsh
echo ""

# 监听文件变化
echo "👂 监听文件变化..."
LAST_REBUILD=0

while true; do
  sleep 1
  NOW=$(date +%s)
  CHANGED=$(find "$WATCH_DIR" -name '*.ts' -o -name '*.tsx' -o -name '*.yml' | xargs stat -c '%Y' 2>/dev/null | sort -rn | head -1)
  
  if [ -n "$CHANGED" ] && [ "$CHANGED" -gt "$LAST_REBUILD" ]; then
    LAST_REBUILD=$NOW
    echo ""
    echo "🔄 检测到文件变化，重新构建..."
    $BUILD_CMD
    
    echo "🔄 重启 DSH..."
    stop_dsh
    sleep 1
    start_dsh
    echo ""
  fi
done
