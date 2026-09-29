#!/bin/bash
# Внутри образа, С СЕТЬЮ: установка по lockfile с замером времени и размера node_modules.
set -u
cd /work || exit 2
[ -f package-lock.json ] || { echo "❌ нет package-lock.json — установка по lockfile НЕ выполнима" >&2; exit 2; }
rm -rf node_modules
TIMEFORMAT='TIME npm_ci wall=%R user=%U sys=%S'
time npm ci --no-audit --no-fund || exit 1
echo "SIZE node_modules $(du -sb node_modules | cut -f1) bytes ($(du -sh node_modules | cut -f1))"
echo "VERSIONS hyperframes=$(node -p 'require("./node_modules/hyperframes/package.json").version') gsap=$(node -p 'require("./node_modules/gsap/package.json").version') node=$(node -v)"
