#!/bin/bash
# Внутри образа: ffprobe + размер + sha256 каждого результата; сверка с протоколом PILOT-N6.
#   bash scripts/probe.sh <файл.mp4>...   0 — всё по протоколу · 1 — нарушение названо · 2 — нечего проверять
set -u
[ $# -gt 0 ] || { echo "❌ файлы не названы — проверка НЕ выполнена" >&2; exit 2; }
rc=0
for f in "$@"; do
  [ -s "$f" ] || { echo "❌ $f: нет файла или пуст" >&2; rc=1; continue; }
  line=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration,size \
    -of default=nw=1 "$f" | tr '\n' ' ')
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  echo "PROBE $(basename "$f") $line sha256=$sha"
  codec=$(sed -n 's/.*codec_name=\([^ ]*\).*/\1/p' <<<"$line")
  pix=$(sed -n 's/.*pix_fmt=\([^ ]*\).*/\1/p' <<<"$line")
  fps=$(sed -n 's/.*r_frame_rate=\([^ ]*\).*/\1/p' <<<"$line")
  dur=$(sed -n 's/.*duration=\([^ ]*\).*/\1/p' <<<"$line")
  [ "$codec" = h264 ] || { echo "  ✗ кодек $codec ≠ h264"; rc=1; }
  [ "$pix" = yuv420p ] || { echo "  ✗ pix_fmt $pix ≠ yuv420p"; rc=1; }
  [ "$fps" = 30/1 ] || { echo "  ✗ fps $fps ≠ 30/1"; rc=1; }
  awk -v d="$dur" 'BEGIN{exit !(d>0 && d<=45.0)}' || { echo "  ✗ длительность $dur вне (0; 45]"; rc=1; }
done
exit $rc
