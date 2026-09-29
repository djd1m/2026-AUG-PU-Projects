#!/bin/bash
# Ворота квитанции render.sh (модуль 05). Не счётчик `watchdog=clean`, а ожидаемый список операций и поля КАЖДОЙ строки.
#   bash .claude/skills/promo-video/scripts/gate-receipt.sh <proj> <receipt.txt> [ops]
# ops по умолчанию «bundle 16x9 9x16 1x1 16x9-repeat» (прогон REPRO=1). Для каждой операции ровно одна строка
#   promo-<proj>-<op> TIME wall=<ч> user=<ч> sys=<ч> MEMPEAK bytes=<целое> watchdog=clean host_load1=<ч>
# для каждого формата — строка ✅ стража probe.sh с 1350 кадрами, для повтора — «✅ повтор 16:9 побайтно совпал»,
# в конце result=green, ни одного HIT. Коды: 0 — всё на месте · 1 — дефект назван · 2 — квитанции нет/пуста.
set -uo pipefail
PROJ=${1:-}; R=${2:-}; OPS=${3:-"bundle 16x9 9x16 1x1 16x9-repeat"}
[[ "$PROJ" =~ ^[a-z0-9-]+$ ]] || { echo "❌ proj «$PROJ» — НЕ выполнено" >&2; exit 2; }
[ -s "$R" ] || { echo "❌ квитанции $R нет или пуста — НЕ выполнено" >&2; exit 2; }
bad=0; say() { echo "❌ $*"; bad=1; }
num='[0-9]+(\.[0-9]+)?'
head -1 "$R" | grep -qE "^proj=$PROJ rev=[0-9a-f]{40} dirty_files=[0-9]+ image=sha256:[0-9a-f]{64} " || say "первая строка: нет proj/rev/dirty_files/image"
for op in $OPS; do
  lines=$(grep -cE "^promo-$PROJ-$op " "$R")
  [ "$lines" = 1 ] || { say "операция $op: строк $lines, ожидалась 1"; continue; }
  l=$(grep -E "^promo-$PROJ-$op " "$R")
  for re in "wall=$num" "user=$num" "sys=$num" "MEMPEAK bytes=[0-9]+ " "watchdog=clean" "host_load1=$num\$"; do
    grep -qE "$re" <<< "$l" || say "операция $op: нет поля «${re%%=*}» в строке: $l"
  done
  case $op in
    bundle) ;;
    16x9|16x9-repeat) grep -qE "^✅ /out/$op\.mp4: h264 High yuv420p tv/bt709 1920x1080 30/1 1350 кадров 45\.000000 с" "$R" || say "$op: нет строки ✅ стража probe.sh" ;;
    9x16) grep -qE "^✅ /out/9x16\.mp4: h264 High yuv420p tv/bt709 1080x1920 30/1 1350 кадров 45\.000000 с" "$R" || say "9x16: нет строки ✅ стража" ;;
    1x1) grep -qE "^✅ /out/1x1\.mp4: h264 High yuv420p tv/bt709 1080x1080 30/1 1350 кадров 45\.000000 с" "$R" || say "1x1: нет строки ✅ стража" ;;
    *) say "неизвестная операция $op" ;;
  esac
done
case " $OPS " in *" 16x9-repeat "*) grep -qE '^✅ повтор 16:9 побайтно совпал: [0-9a-f]{64}$' "$R" || say "нет «✅ повтор 16:9 побайтно совпал»" ;; esac
grep -q 'HIT' "$R" && say "в квитанции есть HIT сторожа: $(grep HIT "$R" | tr '\n' ' ')"
grep -q '^❌' "$R" && say "в квитанции есть строки ❌"
tail -1 "$R" | grep -qE '^finished=\S+ result=green$' || say "последняя строка не «finished=… result=green»: $(tail -1 "$R")"
[ $bad = 0 ] && echo "✅ квитанция $PROJ: операции [$OPS] — у каждой wall/user/sys/memory.peak/host_load1/watchdog; стражи и повтор зелёные"
exit $bad
