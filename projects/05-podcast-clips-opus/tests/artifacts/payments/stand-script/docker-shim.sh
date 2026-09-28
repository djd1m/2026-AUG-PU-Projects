#!/usr/bin/env bash
# Подменный docker для проверки ветки перезапуска и отката stand-set-yookassa.sh (стенд не трогается).
# SHIM_MODE: same-id | up-fails | not-live | ok | rollback-up-fails | rollback-still-live | rollback-env-unreadable | enable-env-unreadable
# ups — число УСПЕШНЫХ пересозданий (id контейнера = id-<ups>), tries — число всех вызовов up.
D=/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/f6d24409-ff6d-4818-a0f7-936162b5fe15/scratchpad/shim
n=$(cat "$D/ups" 2>/dev/null || echo 0)
t=$(cat "$D/tries" 2>/dev/null || echo 0)
args="$*"
case "$args" in
  *" ps -q web"*)
    if [[ "$SHIM_MODE" == same-id ]]; then echo id-0; else echo "id-$n"; fi ;;
  *" up -d "*)
    t=$((t + 1)); echo "$t" > "$D/tries"
    if [[ "$SHIM_MODE" == up-fails && $t -eq 1 ]]; then exit 3; fi
    if [[ "$SHIM_MODE" == rollback-up-fails && $t -eq 2 ]]; then exit 4; fi
    echo $((n + 1)) > "$D/ups" ;;
  "inspect -f {{.State.Health.Status}}"*) echo healthy ;;
  "inspect -f {{range .Config.Env}}"*)
    id="${args##* }"
    case "$SHIM_MODE:$id" in
      ok:id-1) echo N5_PAYMENTS_MODE=live ;;
      rollback-still-live:id-2) echo N5_PAYMENTS_MODE=live ;;
      rollback-env-unreadable:id-2) exit 1 ;;
      enable-env-unreadable:id-1) exit 1 ;;
      *) echo N5_PAYMENTS_MODE=off ;;
    esac ;;
  logs*) echo "журнал подменного web" ;;
  *) echo "неожиданный вызов: $args" >&2; exit 99 ;;
esac
