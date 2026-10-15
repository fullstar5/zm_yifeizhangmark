#!/bin/sh
set -e

if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
fi

win_docker="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
if [ -x "$win_docker" ]; then
  exec "$win_docker" compose "$@"
fi

echo "找不到可用的 docker compose。请安装 Docker；如果用的是 Docker Desktop，请为当前 WSL 发行版打开 WSL integration。" >&2
exit 1
