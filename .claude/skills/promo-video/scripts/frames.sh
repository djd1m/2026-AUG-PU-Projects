#!/bin/bash
# Лист кадров ЗАПИСИ с метками времени файла (модули 02 п. 5, 04 п. 3): выбрать куски, снять координаты зон, проверить
# переход. 1.2 — сквозной прогон N3, замечание 10: кроме одиночного `ffmpeg -ss` навык не давал способа увидеть
# интервал записи; исполнитель писал свой tile.sh в scratchpad. Каждый кадр подписан секундой ВНУТРИ файла (как t_file_s).
#   bash .claude/skills/promo-video/scripts/frames.sh <proj> <запись.webm> <from> <to> <лист.png> [all|шаг_с]
# all — каждый кадр (для опасных переходов: вспышка полосы у N3 длилась 0,08 с = 2 кадра при 25 fps; шаг 0,1 с её
# пропускает; метка — ВНИЗУ кадра, верх, где живут служебные полосы, не закрыт), шаг_с — кадр раз в шаг (обзор, по умолчанию 0,25). Не больше 120 кадров на лист.
# Коды: 0 — лист сделан · 1 — интервал вне файла (from < 0, to > длительности, from ≥ to) ·
#       2 — НЕ выполнено (нет записи/образа, контейнер упал, больше 120 кадров — сузить интервал).
set -uo pipefail
PROJ=${1:-}; REC=${2:-}; FROM=${3:-}; TO=${4:-}; OUTP=${5:-}; STEP=${6:-0.25}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» — НЕ выполнено" >&2; exit 2; }
[ -s "$REC" ] || { echo "❌ нет записи «$REC» — НЕ выполнено" >&2; exit 2; }
num='^[0-9]+([.][0-9]+)?$'
[[ "$FROM" =~ $num && "$TO" =~ $num ]] || { echo "❌ from/to «$FROM»/«$TO» не числа (секунды файла, через точку) — НЕ выполнено" >&2; exit 2; }
[ -n "$OUTP" ] || { echo "❌ не задан путь листа — НЕ выполнено" >&2; exit 2; }
[[ "$STEP" = all || "$STEP" =~ $num ]] || { echo "❌ шаг «$STEP»: all или секунды — НЕ выполнено" >&2; exit 2; }
docker image inspect promo-render:2026-09-29 >/dev/null 2>&1 || { echo "❌ нет образа promo-render:2026-09-29 — НЕ выполнено" >&2; exit 2; }
REC=$(realpath "$REC"); D=$(dirname "$REC"); B=$(basename "$REC")
mkdir -p "$(dirname "$OUTP")" || exit 2; OUTP=$(realpath "$OUTP"); OD=$(dirname "$OUTP"); OB=$(basename "$OUTP")
NAME=promo-$PROJ-frames-$$
IMG=(docker run --rm --name "$NAME" --cpus=1 --memory=1g --network none -v "$D:/a:ro" -v "$OD:/o" promo-render:2026-09-29)
meta=$("${IMG[@]}" ffprobe -v error -select_streams v:0 -show_entries format=duration:stream=r_frame_rate,width -of default=nw=1 "/a/$B") \
  || { echo "❌ ffprobe не прочитал $B — НЕ выполнено" >&2; exit 2; }
dur=$(sed -n 's/^duration=//p' <<< "$meta"); fps=$(sed -n 's/^r_frame_rate=//p' <<< "$meta" | awk -F/ '{ print ($2 ? $1/$2 : $1) }')
w=$(sed -n 's/^width=//p' <<< "$meta")
[ -n "$dur" ] && [ -n "$fps" ] || { echo "❌ нет длительности/fps у $B — НЕ выполнено" >&2; exit 2; }
awk -v a="$FROM" -v b="$TO" -v d="$dur" 'BEGIN { exit !(a >= 0 && b > a && b <= d + 0.001) }' \
  || { echo "❌ интервал $FROM–$TO вне файла $B (0–$dur с)"; exit 1; }
if [ "$STEP" = all ]; then n=$(awk -v a="$FROM" -v b="$TO" -v f="$fps" 'BEGIN { printf "%d", (b-a)*f + 0.999 }'); vf="null"
else n=$(awk -v a="$FROM" -v b="$TO" -v s="$STEP" 'BEGIN { printf "%d", (b-a)/s + 0.999 }'); vf="fps=1/$STEP"; fi
[ "$n" -ge 1 ] && [ "$n" -le 120 ] || { echo "❌ $n кадров — больше 120 на лист, сузить интервал — НЕ выполнено" >&2; exit 2; }
cols=$(( n < 10 ? n : 10 )); rows=$(( (n + cols - 1) / cols ))
tw=$(( w > 1000 ? 384 : 260 ))
font=/usr/local/share/fonts/Onest-Medium.ttf
"${IMG[@]}" ffmpeg -nostdin -loglevel error -y -copyts -ss "$FROM" -to "$TO" -i "/a/$B" -vf \
  "$vf,scale=$tw:-2,drawtext=fontfile=$font:text='%{pts\\:flt}':x=6:y=h-th-8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7,tile=${cols}x${rows}:padding=4:color=gray" \
  -frames:v 1 "/o/$OB" || { echo "❌ ffmpeg упал — НЕ выполнено" >&2; exit 2; }
[ -s "$OUTP" ] || { echo "❌ лист $OUTP не создан — НЕ выполнено" >&2; exit 2; }
echo "✅ $OUTP: $B $FROM–$TO с, $([ "$STEP" = all ] && echo "каждый кадр (${fps} fps)" || echo "шаг $STEP с"), $n кадров, сетка ${cols}×${rows}; метка кадра — секунда файла"
