#!/usr/bin/env bash
# 跳舞兰 H5 一键部署脚本（本地 → 服务器）
#
# 前置条件：
#   1) 本地已 npm install；服务器已按 deploy/README.md 完成初始化
#      （目录、systemd 服务、nginx、/opt/twlh5-api/.env）
#   2) 本机能免密 SSH 到目标服务器
#
# 用法：
#   HOST=129.204.85.139 SSH_USER=admin ./deploy/deploy.sh
#
set -euo pipefail

HOST="${HOST:-}"
SSH_USER="${SSH_USER:-admin}"
SSH_PORT="${SSH_PORT:-22}"
STATIC_DIR="${STATIC_DIR:-/opt/twlh5-h5}"
API_DIR="${API_DIR:-/opt/twlh5-api}"

if [ -z "$HOST" ]; then
  echo "用法：HOST=<服务器IP> SSH_USER=<用户> $0"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH="ssh -p $SSH_PORT $SSH_USER@$HOST"
RSYNC_SSH="ssh -p $SSH_PORT"

echo "==> 1/6 构建前端（dist/）"
npm run build

echo "==> 2/6 准备远端目录"
$SSH "mkdir -p $STATIC_DIR $API_DIR"

echo "==> 3/6 上传静态站点 + 智能体反代 -> $STATIC_DIR"
rsync -az --delete -e "$RSYNC_SSH" dist/ "$SSH_USER@$HOST:$STATIC_DIR/dist/"
scp -P "$SSH_PORT" deploy/server.cjs "$SSH_USER@$HOST:$STATIC_DIR/server.cjs"

echo "==> 4/6 上传业务后端 -> $API_DIR（保留远端 .env / certs / node_modules）"
rsync -az --delete \
  --exclude 'node_modules' --exclude '.env' --exclude 'certs' --exclude '*.log' \
  -e "$RSYNC_SSH" server/ "$SSH_USER@$HOST:$API_DIR/"

echo "==> 5/6 安装后端依赖（若缺）并重启服务"
$SSH "cd $API_DIR && (npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --production --no-audit --no-fund >/dev/null 2>&1 || true)"
$SSH "sudo systemctl restart twlh5-static twlh5-api"

echo "==> 6/6 冒烟检查"
sleep 2
$SSH "set +e; echo -n 'static(:8088) '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8088/; echo -n 'api(:4000)   '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/health"
echo "==> 部署完成"
