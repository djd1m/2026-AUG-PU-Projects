#!/bin/bash
# Окончательные ворота файлов ролика (модуль 07 п. 1): ДЕКОДИРОВАННЫЕ кадры и отсутствие аудио — то, чего не проверяет
# probe.sh шаблона (он считает пакеты: -count_packets/nb_read_packets; аудиопотоки не смотрит — ограничение №8).
#   bash .claude/skills/promo-video/scripts/gate-media.sh <каталог с 16x9.mp4 9x16.mp4 1x1.mp4> [proj]
# Коды: 0 — у всех трёх 1350 декодированных кадров, 0 аудиопотоков, размер по формату · 1 — расхождение названо ·
#       2 — проверка НЕ выполнена (нет файла, нет образа, ffprobe не ответил).
# До правки шаблона №8 — вручную этим скриптом после render.sh; после — в probe.sh/render.sh.
set -uo pipefail
DIR=${1:-}; PROJ=${2:-x}
[ -d "$DIR" ] || { echo "❌ нет каталога «$DIR» — НЕ выполнено" >&2; exit 2; }
DIR=$(realpath "$DIR")
docker image inspect promo-render:2026-09-29 >/dev/null 2>&1 || { echo "❌ нет образа promo-render:2026-09-29 — НЕ выполнено" >&2; exit 2; }
declare -A SIZE=([16x9]="1920x1080" [9x16]="1080x1920" [1x1]="1080x1080")
for f in 16x9 9x16 1x1; do [ -s "$DIR/$f.mp4" ] || { echo "❌ $DIR/$f.mp4 нет или пуст — НЕ выполнено" >&2; exit 2; }; done
NAME=promo-$PROJ-media
if docker container inspect "$NAME" >/dev/null 2>&1; then echo "❌ контейнер $NAME уже есть — не трогаю, НЕ выполнено" >&2; exit 2; fi
# --memory=1g задаём явно (у probe в render.sh лимита памяти нет — модуль 06 §4).
out=$(timeout 600 docker run --rm --name "$NAME" --cpus=1 --memory=1g --network none -v "$DIR:/m:ro" promo-render:2026-09-29 bash -c '
  for f in 16x9 9x16 1x1; do
    v=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height -of csv=p=0 /m/$f.mp4) || { echo "ERR $f"; continue; }
    a=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 /m/$f.mp4 | wc -l)
    echo "$f $v $a"
  done')
rc=$?
[ $rc = 0 ] && [ -n "$out" ] || { echo "❌ контейнер ffprobe: код $rc, вывод пуст — НЕ выполнено" >&2; exit 2; }
bad=0
while read -r f v a; do
  [ "$v" = "" ] || [ "$f" = ERR ] && { echo "❌ ffprobe не прочитал $v — НЕ выполнено" >&2; exit 2; }
  IFS=, read -r w h n <<< "$v"; b0=$bad; bad=0
  [ "${w}x${h}" = "${SIZE[$f]}" ] || { echo "❌ $f.mp4: ${w}x${h}, ожидалось ${SIZE[$f]}"; bad=1; }
  [ "$n" = 1350 ] || { echo "❌ $f.mp4: декодированных кадров $n, ожидалось 1350"; bad=1; }
  [ "$a" = 0 ] || { echo "❌ $f.mp4: аудиопотоков $a, ожидалось 0"; bad=1; }
  [ "$bad" = 0 ] || { bad=1; continue; }; bad=$b0
  echo "✅ $f.mp4: ${w}x${h}, декодировано $n кадров, аудиопотоков $a, sha256 $(sha256sum "$DIR/$f.mp4" | cut -c1-64)"
done <<< "$out"
[ "$(wc -l <<< "$out")" = 3 ] || { echo "❌ ожидалось 3 строки ffprobe, получено: $out — НЕ выполнено" >&2; exit 2; }
exit $bad
