#!/usr/bin/env bash
# Проверка образа рендера: разовый контейнер (--rm, без портов, без сети), внутри — инструменты, шрифты,
# телеметрия и тест-рендер кириллицы шрифтом Onest.
#   bash check.sh [образ]          по умолчанию promo-render:2026-09-29
# Коды: 0 — всё есть; 1 — чего-то нет (названо в stderr); 2 — проверка НЕ выполнена (нет docker/образа).
set -uo pipefail
IMAGE="${1:-promo-render:2026-09-29}"

command -v docker >/dev/null 2>&1 || { echo "❌ docker не найден — проверка НЕ выполнена" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "❌ docker daemon недоступен — проверка НЕ выполнена" >&2; exit 2; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "❌ образа $IMAGE нет — проверка НЕ выполнена" >&2; exit 2; }

# Внутренний скрипт: печатает найденное в stdout, недостающее — строками «MISSING: …»; код 1 при любой нехватке.
read -r -d '' INNER <<'SH'
fail=0
miss() { echo "MISSING: $*"; fail=1; }
FONT=/usr/local/share/fonts/Onest-Regular.ttf

v=$(node -v 2>/dev/null) && echo "node: $v" || miss "node"
v=$(ffmpeg -version 2>/dev/null | head -1) && [ -n "$v" ] && echo "ffmpeg: $v" || miss "ffmpeg (нет в PATH)"
v=$(ffprobe -version 2>/dev/null | head -1) && [ -n "$v" ] && echo "ffprobe: $v" || miss "ffprobe (нет в PATH)"
n=$(fc-list | grep -ciE "onest|dejavu|noto")
echo "шрифты onest|dejavu|noto: $n"
[ "$n" -ge 3 ] || miss "шрифты: onest|dejavu|noto найдено $n < 3"
fc-list | grep -qi onest || miss "шрифт Onest не зарегистрирован в fontconfig"
[ -f "$FONT" ] || miss "файл $FONT"
echo "HYPERFRAMES_NO_TELEMETRY=${HYPERFRAMES_NO_TELEMETRY:-<пусто>}"
[ "${HYPERFRAMES_NO_TELEMETRY:-}" = "1" ] || miss "HYPERFRAMES_NO_TELEMETRY не равен 1"
# --no-install: без CLI в образе npx пошёл бы в сеть за чужой версией; сеть здесь выключена.
v=$(timeout 60 npx --no-install playwright --version 2>/dev/null) && [ -n "$v" ] && echo "playwright: $v" \
  || miss "playwright CLI (npx --no-install playwright)"

if command -v ffmpeg >/dev/null 2>&1 && [ -f "$FONT" ]; then
  rm -f /tmp/check.mp4
  if ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=0x0d0f12:s=1920x1080:d=2 \
       -vf "drawtext=fontfile=$FONT:text='Суфлёр — проверка кириллицы':fontcolor=0x5fd0d8:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2" \
       -c:v libx264 -pix_fmt yuv420p /tmp/check.mp4 && [ -s /tmp/check.mp4 ]; then
    p=$(ffprobe -v error -select_streams v:0 \
          -show_entries stream=codec_name,width,height,pix_fmt:format=duration -of csv=p=0 /tmp/check.mp4 | tr '\n' ' ')
    echo "тест-рендер: $p"
    echo "$p" | grep -q "h264,1920,1080,yuv420p" || miss "тест-рендер: ffprobe не подтвердил h264 1920x1080 yuv420p ($p)"
  else
    miss "тест-рендер: ffmpeg drawtext + libx264 не выполнился"
  fi
else
  miss "тест-рендер: пропущен — нет ffmpeg или $FONT"
fi
exit $fail
SH

out=$(docker run --rm --network none --memory=4g --cpus=6 "$IMAGE" bash -c "$INNER" 2>&1)
rc=$?
echo "── образ: $IMAGE"
echo "$out" | grep -v '^MISSING: '
if [ "$rc" -eq 0 ]; then
  echo "✅ всё есть"
  exit 0
fi
if [ "$rc" -eq 1 ] && echo "$out" | grep -q '^MISSING: '; then
  echo "❌ чего-то нет:" >&2
  echo "$out" | grep '^MISSING: ' | sed 's/^MISSING: /  - /' >&2
  exit 1
fi
echo "❌ контейнер не выполнил проверку (код $rc) — проверка НЕ выполнена" >&2
exit 2
