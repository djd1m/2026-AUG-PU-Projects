#!/usr/bin/env bash
# Проверка scripts/stand-set-yookassa.sh на копиях .env.example (не на env стенда), режим --no-restart.
S=/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/f6d24409-ff6d-4818-a0f7-936162b5fe15/scratchpad/stand
P=/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/agent-a02dd597959d8688a/projects/05-podcast-clips-opus
SCRIPT="$P/scripts/stand-set-yookassa.sh"
mkdir -p "$S"
cp "$P/.env.example" "$S/stand.env"
printf '123456\ntest_abc\ny\n' | "$SCRIPT" "$S/stand.env" --no-restart; echo "исход «верный ввод»: код $?"
echo "N5_PAYMENTS_MODE=live строк: $(grep -c '^N5_PAYMENTS_MODE=live$' "$S/stand.env"); YOOKASSA_SECRET_KEY строк: $(grep -c '^YOOKASSA_SECRET_KEY=' "$S/stand.env")"
printf '123456\nlive_abc\ny\n' | "$SCRIPT" "$S/stand.env" --no-restart; echo "исход «боевой ключ при тестовом магазине»: код $?"
printf 'shop-1\n' | "$SCRIPT" "$S/stand.env" --no-restart; echo "исход «shopId не цифры»: код $?"
grep -v '^N5_LIMIT_PAID_USER_MINUTES' "$S/stand.env" > "$S/nopaid.env"
printf '1\nx\ny\n' | "$SCRIPT" "$S/nopaid.env" --no-restart; echo "исход «нет потолка минут paid»: код $?"
"$SCRIPT" "$S/absent.env" --no-restart; echo "исход «env нет»: код $?"
