#!/usr/bin/env bash
# Сборка образа рендера promo-render:2026-09-29. Порты не публикуются, контейнеры не запускаются.
# Коды: 0 — собран; 1 — сборка упала; 2 — сборка НЕ выполнена (нет docker).
set -uo pipefail
TAG="${TAG:-promo-render:2026-09-29}"
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v docker >/dev/null 2>&1 || { echo "❌ docker не найден — сборка НЕ выполнена" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "❌ docker daemon недоступен — сборка НЕ выполнена" >&2; exit 2; }
start=$(date +%s)
if ! DOCKER_BUILDKIT=1 docker build --progress=plain -t "$TAG" "$DIR"; then
  echo "❌ сборка $TAG упала" >&2
  exit 1
fi
end=$(date +%s)
echo "── собран $TAG за $((end - start)) с"
docker image ls "$TAG" --format 'размер (docker image ls): {{.Size}}'
bytes=$(docker image inspect "$TAG" --format '{{.Size}}')
echo "размер (inspect): $((bytes / 1024 / 1024)) МиБ"
