#!/bin/bash
# Раскадровка ГОТОВЫХ mp4 (модуль 07 п. 2): весь ролик с шагом 0,25 с (4 листа по 12 с на формат) + КАЖДЫЙ стык сцены
# и куска покадрово, ±5 кадров (лист 11×1). Стыки — строки BOUNDARY из config-inspect.tsv (gate-config.sh).
#   bash .claude/skills/promo-video/scripts/storyboard.sh <proj> <каталог mp4> <config-inspect.tsv> [каталог листов]
# Листы по умолчанию — /home/dz-projects-2026/.promo-assets/<proj>/out/final/proof/ (устойчивый путь, не scratchpad).
# Пишет index.tsv (лист → формат → вид → интервал → sha256 mp4) и verdict.tsv (лист, исход, дефект, демо-пометка,
# sha256 mp4, что видно): её заполняет исполнитель, проверяет gate-verdict.sh.
# 1.2 (сквозной прогон N3, замечание 12): при пересборке исход листа ПЕРЕНОСИТСЯ из прежнего verdict.tsv, только если
# лист того же имени и интервала снят с mp4 с тем же sha256 (формат не изменился между рендерами — у N3 16:9 и 1:1
# побайтно совпали в трёх рендерах); иначе «?». Прежде старый verdict.tsv сохранялся целиком — исходы листов
# изменённого 9:16 молча переживали перерендер. Коды: 0 — листы сделаны · 2 — НЕ выполнено (нет входа/образа).
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
# Прежние индекс и вердикт — для переноса исходов неизменённых листов.
OLDI=$(mktemp); OLDV=$(mktemp); trap 'rm -f "$OLDI" "$OLDV"' EXIT
[ -s "$PROOF/index.tsv" ] && cp "$PROOF/index.tsv" "$OLDI"; [ -s "$PROOF/verdict.tsv" ] && cp "$PROOF/verdict.tsv" "$OLDV"
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
# Новый verdict.tsv: перенос исхода только при том же листе, интервале и sha256 mp4; прежний формат (без sha) берёт sha
# из прежнего index.tsv — по нему лист и смотрели.
awk -F'\t' -v OFS='\t' '
  FILENAME == ARGV[1] { if (FNR > 1) { oi[$1] = $4 "|" $5 }; next }
  FILENAME == ARGV[2] { if ($1 ~ /^#/ || $1 == "") next
                        if ($5 ~ /^[0-9a-f]{64}$/) { osha[$1] = $5; what[$1] = $6 } else { osha[$1] = ""; what[$1] = $5 }
                        ov[$1] = $2 OFS $3 OFS $4; next }
  FNR == 1 { print "# лист", "исход (принят|отклонён)", "дефект (нет|цена|бренд|ip|ключ|титр-обрезан|элемент-обрезан|демо-пометка-пропала|другое:<что>)", "демо-пометка (видна|не видна|нет-демо-данных)", "sha256_mp4", "что видно"; next }
  { s = $1; k = $4 "|" $5; vs = (s in osha && osha[s] != "") ? osha[s] : substr(oi[s], index(oi[s], "|") + 1)
    if ((s in ov) && oi[s] == k && vs == $5 && ov[s] !~ /^\?/) { print s, ov[s], $5, what[s]; kept++ }
    else { print s, "?", "?", "?", $5, ""; reset++ } }
  END { printf "перенесено исходов %d, к просмотру (?) %d\n", kept, reset > "/dev/stderr" }
' "$OLDI" "$OLDV" "$PROOF/index.tsv" > "$PROOF/verdict.tsv.new" && mv "$PROOF/verdict.tsv.new" "$PROOF/verdict.tsv" || exit 2
echo "✅ листы: $(($(wc -l < "$PROOF/index.tsv") - 1)) в $PROOF/sheets; индекс $PROOF/index.tsv; заполнить «?» в $PROOF/verdict.tsv"
echo "сторож: bash $(dirname "$0")/gate-watchdog.sh $NAME \"$T0\""
