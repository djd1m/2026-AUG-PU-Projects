#!/bin/bash
# Внутри образа: сравнение двух рендеров — PSNR по всем кадрам и число кадров, различающихся побайтно (framemd5 декодированных).
#   bash scripts/compare.sh a.mp4 b.mp4
set -u
A=${1:?a}; B=${2:?b}
[ -s "$A" ] && [ -s "$B" ] || { echo "❌ нет входа — сравнение НЕ выполнено" >&2; exit 2; }
ffmpeg -nostdin -hide_banner -i "$A" -i "$B" -lavfi "[0:v][1:v]psnr=stats_file=/tmp/psnr.log" -f null - 2>&1 | grep -E 'PSNR'
echo "PSNR min кадра: $(awk '{for(i=1;i<=NF;i++) if($i ~ /^psnr_avg:/){split($i,a,":"); print a[2]}}' /tmp/psnr.log | sort -g | head -1)"
ffmpeg -nostdin -v error -i "$A" -f framemd5 /tmp/a.md5
ffmpeg -nostdin -v error -i "$B" -f framemd5 /tmp/b.md5
diff <(grep -v '^#' /tmp/a.md5 | awk -F, '{print $6}') <(grep -v '^#' /tmp/b.md5 | awk -F, '{print $6}') | grep -c '^<' | sed 's/^/кадров с различием: /'
echo "кадров всего: $(grep -vc '^#' /tmp/a.md5)"
# диапазоны различающихся кадров (номер кадра / 30 = секунда)
paste -d' ' <(grep -v '^#' /tmp/a.md5 | awk -F, '{print $6}') <(grep -v '^#' /tmp/b.md5 | awk -F, '{print $6}') \
  | awk '{d=($1!=$2)} d&&!p{s=NR-1} !d&&p{printf "различаются кадры %d–%d (%.1f–%.1f с)\n", s, NR-2, s/30, (NR-2)/30} {p=d} END{if(p) printf "различаются кадры %d–%d (%.1f–%.1f с)\n", s, NR-1, s/30, (NR-1)/30}'
