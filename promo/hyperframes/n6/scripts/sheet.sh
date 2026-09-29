#!/bin/bash
# Внутри образа: контактный лист результата (кадр каждые STEP с, по умолчанию 2,5) — для просмотра глазами.
#   bash scripts/sheet.sh <вход.mp4> <выход.png> [STEP]
set -u
IN=${1:?вход}; OUT=${2:?выход}; STEP=${3:-2.5}
[ -s "$IN" ] || { echo "❌ нет $IN" >&2; exit 2; }
ffmpeg -nostdin -loglevel error -y -i "$IN" -vf "fps=1/$STEP,scale=640:-1,tile=6x3" -frames:v 1 "$OUT" && echo "ok $OUT"
