#!/bin/bash
# Страж результата (внутри promo-render, --network none): файл обязан быть ровно тем, что обещает серия.
#   probe.sh <file.mp4> <width> <height>
# 0 — всё совпало · 1 — расхождение (названо) · 2 — проверка НЕ выполнена (нет файла, ffprobe не ответил).
set -uo pipefail
f=$1 W=$2 H=$3
[ -s "$f" ] || { echo "❌ $f: файла нет или пуст — проверка НЕ выполнена" >&2; exit 2; }
out=$(ffprobe -v error -count_packets -select_streams v:0 \
  -show_entries stream=codec_name,profile,pix_fmt,color_range,color_space,width,height,r_frame_rate,nb_read_packets:format=duration \
  -of default=noprint_wrappers=1 "$f") || { echo "❌ $f: ffprobe не прочитал файл — проверка НЕ выполнена" >&2; exit 2; }
[ -n "$out" ] || { echo "❌ $f: ffprobe пуст — проверка НЕ выполнена" >&2; exit 2; }
get() { printf '%s\n' "$out" | sed -n "s/^$1=//p" | head -1; }
bad=0
want() { # <поле> <ожидание> <факт>
  if [ "$2" != "$3" ]; then echo "❌ $f: $1=$3, ожидалось $2" >&2; bad=1; fi
}
want codec_name h264 "$(get codec_name)"
want profile High "$(get profile)"
want pix_fmt yuv420p "$(get pix_fmt)"
want color_range tv "$(get color_range)"
want color_space bt709 "$(get color_space)"
want width "$W" "$(get width)"
want height "$H" "$(get height)"
want r_frame_rate 30/1 "$(get r_frame_rate)"
want frames 1350 "$(get nb_read_packets)"
want duration 45.000000 "$(get duration)"
if [ $bad = 0 ]; then
  echo "✅ $f: h264 High yuv420p tv/bt709 ${W}x${H} 30/1 1350 кадров 45.000000 с, $(stat -c %s "$f") байт, sha256 $(sha256sum "$f" | cut -c1-64)"
fi
exit $bad
