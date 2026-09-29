#!/bin/bash
# Раскадровка ГОТОВЫХ mp4 (модуль 07 п. 2): весь ролик с шагом 0,25 с (4 листа по 12 с на формат) + КАЖДЫЙ стык сцены
# и куска покадрово, ±5 кадров (лист 11×1). Стыки — строки BOUNDARY из config-inspect.tsv (gate-config.sh).
#   bash .claude/skills/promo-video/scripts/storyboard.sh <proj> <каталог mp4> <config-inspect.tsv> [каталог листов]
# Листы по умолчанию — /home/dz-projects-2026/.promo-assets/<proj>/out/final/proof/ (устойчивый путь, не scratchpad).
# Пишет index.tsv (лист → формат → вид → интервал → sha256 mp4) и заготовку verdict.tsv с исходом «?» по каждому листу:
# её заполняет исполнитель, проверяет gate-verdict.sh. Коды: 0 — листы сделаны · 2 — НЕ выполнено (нет входа/образа).
set -uo pipefail
PROJ=${1:-}; MP4=${2:-}; INSPECT=${3:-}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» — НЕ выполнено" >&2; exit 2; }
[ -d "$MP4" ] && [ -s "$INSPECT" ] || { echo "❌ нужен каталог mp4 и config-inspect.tsv (gate-config.sh) — НЕ выполнено" >&2; exit 2; }
PROOF=${4:-/home/dz-projects-2026/.promo-assets/$PROJ/out/final/proof}
mkdir -p "$PROOF/sheets" || exit 2
MP4=$(realpath "$MP4"); PROOF=$(realpath "$PROOF")
grep -q '^BOUNDARY' "$INSPECT" || { echo "❌ в $INSPECT нет строк BOUNDARY — НЕ выполнено" >&2; exit 2; }
declare -A FMT=([16x9]=wide [9x16]=tall [1x1]=square)
for f in 16x9 9x16 1x1; do [ -s "$MP4/$f.mp4" ] || { echo "❌ нет $MP4/$f.mp4 — НЕ выполнено" >&2; exit 2; }; done
# Список заданий: «формат вид старт-кадр метка». Стык t → кадры round(t*30)-5 … +5 (обрезка по 0 и 1349).
jobs=$PROOF/jobs.txt; : > "$jobs"
for f in 16x9 9x16 1x1; do
  awk -F'\t' -v k="${FMT[$f]}" -v f="$f" '$1=="BOUNDARY" && $2==k && $3+0>0 {n=int($3*30+0.5)-5; if(n<0)n=0; if(n>1339)n=1339; printf "%s boundary %d %s\n", f, n, $3}' "$INSPECT" >> "$jobs"
done
NAME=promo-$PROJ-storyboard
if docker container inspect "$NAME" >/dev/null 2>&1; then echo "❌ контейнер $NAME уже есть — не трогаю, НЕ выполнено" >&2; exit 2; fi
T0=$(date '+%Y-%m-%d %H:%M:%S')
timeout 1200 docker run --rm --name "$NAME" --cpus=2.5 --memory=2g --network none \
  -v "$MP4:/m:ro" -v "$PROOF:/p" promo-render:2026-09-29 bash -c '
  set -e
  for f in 16x9 9x16 1x1; do
    ffmpeg -nostdin -loglevel error -y -i /m/$f.mp4 -vf "fps=4,scale=320:-2,tile=8x6" /p/sheets/$f-step025-%d.png
  done
  while read -r f kind n t; do
    ffmpeg -nostdin -loglevel error -y -i /m/$f.mp4 -vf "select=between(n\,$n\,$((n+10))),scale=320:-2,tile=11x1" -frames:v 1 -fps_mode passthrough /p/sheets/$f-boundary-$t.png
  done < /p/jobs.txt' || { echo "❌ контейнер раскадровки упал — НЕ выполнено" >&2; exit 2; }
{
  printf 'лист\tформат\tвид\tинтервал_с\tsha256_mp4\n'
  for f in 16x9 9x16 1x1; do
    sha=$(sha256sum "$MP4/$f.mp4" | cut -c1-64)
    for k in 1 2 3 4; do printf 'sheets/%s-step025-%d.png\t%s\tшаг 0,25 с\t%d-%d\t%s\n' "$f" $k "$f" $(( (k-1)*12 )) $(( k*12 > 45 ? 45 : k*12 )) "$sha"; done
    while read -r ff kind n t; do [ "$ff" = "$f" ] && printf 'sheets/%s-boundary-%s.png\t%s\tстык ±5 кадров\tкадры %d-%d (t=%s)\t%s\n' "$f" "$t" "$f" "$n" $((n+10)) "$t" "$sha"; done < "$jobs"
  done
} > "$PROOF/index.tsv"
missing=0
while IFS=$'\t' read -r sheet _; do [ "$sheet" = лист ] || [ -s "$PROOF/$sheet" ] || { echo "❌ лист $sheet не создан" >&2; missing=1; }; done < "$PROOF/index.tsv"
[ $missing = 0 ] || exit 2
[ -e "$PROOF/verdict.tsv" ] || {
  printf '# лист\tисход (принят|отклонён)\tдефект (нет|цена|бренд|ip|ключ|титр-обрезан|элемент-обрезан|демо-пометка-пропала|другое:<что>)\tдемо-пометка (видна|не видна|нет-демо-данных)\tчто видно\n' > "$PROOF/verdict.tsv"
  tail -n +2 "$PROOF/index.tsv" | cut -f1 | sed 's/$/\t?\t?\t?\t/' >> "$PROOF/verdict.tsv"; }
echo "✅ листы: $(($(wc -l < "$PROOF/index.tsv") - 1)) в $PROOF/sheets; индекс $PROOF/index.tsv; заполнить $PROOF/verdict.tsv"
echo "сторож: bash $(dirname "$0")/gate-watchdog.sh $NAME \"$T0\""
