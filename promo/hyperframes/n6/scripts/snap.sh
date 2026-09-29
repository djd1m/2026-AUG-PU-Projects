#!/bin/bash
# Внутри образа: быстрые стоп-кадры формата в ключевые моменты (без рендера всего ролика).
#   bash scripts/snap.sh <16x9|1x1|9x16> [моменты через запятую]
set -u
FMT=${1:?формат}; AT=${2:-2.5,7,10.5,14.5,19,22.5,28.5,34,42}
export HYPERFRAMES_BROWSER_PATH=/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export HYPERFRAMES_NO_UPDATE_CHECK=1
/work/node_modules/.bin/hyperframes snapshot "/work/build/$FMT" --at "$AT" --no-end --describe false -o "/work/renders/snap-$FMT"
