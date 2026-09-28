#!/usr/bin/env bash
# Ветки перезапуска и отката stand-set-yookassa.sh на подменном docker (PATH); env — копия .env.example, не стенд.
S=/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/f6d24409-ff6d-4818-a0f7-936162b5fe15/scratchpad
P=/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/agent-a02dd597959d8688a/projects/05-podcast-clips-opus
export PATH="$S/shim:$PATH"
mkdir -p "$S/stand"
for mode in same-id up-fails not-live ok rollback-up-fails rollback-still-live; do
  echo 0 > "$S/shim/ups"; echo 0 > "$S/shim/tries"
  cp "$P/.env.example" "$S/stand/restart.env"
  printf '123456\ntest_abc\ny\n' | SHIM_MODE=$mode "$P/scripts/stand-set-yookassa.sh" "$S/stand/restart.env" > "$S/stand/out-$mode.txt" 2>&1
  code=$?
  echo "режим $mode: код $code; env после: N5_PAYMENTS_MODE=live строк $(grep -c '^N5_PAYMENTS_MODE=live$' "$S/stand/restart.env")"
  grep -E 'Готово|не пересоздан|не выполнился|не live|подтвержд|ПОДТВЕРЖД' "$S/stand/out-$mode.txt" | sed 's#/tmp/[^ ]*#<путь>#g' | head -3
done
