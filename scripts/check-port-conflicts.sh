#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ЗАМЕЩЕНИЕ: отслеживает PR-021
# Статус апстрима: нет — апстрим отказался включать. ПОСТОЯННЫЙ
#
# Зачем метка. Локальный артефакт — это прототип и доказательство для заявки,
# а не вечная копия. Когда апстрим реализует заявку, этот файл обязан быть либо
# удалён, либо урезан до того, чего в пакете нет. Два места с одним правилом —
# худший исход, чем отсутствие правила: они расходятся молча.
# Проверять при каждом обновлении пакета: bash scripts/check-superseded.sh
# ─────────────────────────────────────────────────────────────────────
# Проверка конфликтов портов ДО `docker compose up`.
#
# Ловит класс дефектов, при котором compose сгенерирован «в вакууме»: порт свободен в
# голове у автора, но занят уже запущенным контейнером или службой хоста. Симптом —
# `docker compose up` падает с "port is already allocated", а часть стека остаётся
# поднятой; при нескольких проектах на одной машине это норма, а не редкость.
#
# Проверка детерминированная — слой 1 по лестнице стоимости обнаружения (CLAUDE.md).
# Полагаться на «увижу при запуске» нельзя: сообщение docker называет ОДИН порт, и
# конфликты вскрываются по одному за прогон.
#
# Запуск:  bash scripts/check-port-conflicts.sh [путь-к-проекту|путь-к-compose]
#          без аргумента — docker-compose.yml в текущем каталоге
# Коды:    0 — конфликтов нет, 1 — есть конфликт, 2 — нечего проверять

set -uo pipefail

TARGET="${1:-.}"
if [ -d "$TARGET" ]; then COMPOSE="$TARGET/docker-compose.yml"; else COMPOSE="$TARGET"; fi
[ -f "$COMPOSE" ] || { echo "нет файла $COMPOSE"; exit 2; }

FAIL=0
fail() { printf '  ❌ %s\n' "$1"; FAIL=1; }
ok()   { printf '  ✅ %s\n' "$1"; }
warn() { printf '  ⚠️  %s\n' "$1"; }

# --- Что занято прямо сейчас -------------------------------------------------
# 1. Порты, опубликованные запущенными контейнерами.
declare -A BUSY_BY
if command -v docker >/dev/null 2>&1; then
  while IFS=$'\t' read -r name ports; do
    [ -z "${ports:-}" ] && continue
    # "0.0.0.0:8080->80/tcp, [::]:8080->80/tcp" -> 8080
    for p in $(grep -oE '(0\.0\.0\.0|\[::\]|127\.0\.0\.1):[0-9]+' <<<"$ports" | grep -oE '[0-9]+$' | sort -u); do
      BUSY_BY[$p]="контейнер $name"
    done
  done < <(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null)
else
  warn "docker недоступен — проверены только слушающие сокеты хоста"
fi

# 2. Всё, что слушает на хосте (службы вне docker: системный postgres, nginx и т.п.).
if command -v ss >/dev/null 2>&1; then
  for p in $(ss -tlnH 2>/dev/null | grep -oE ':[0-9]+ ' | grep -oE '[0-9]+' | sort -u); do
    [ -n "${BUSY_BY[$p]:-}" ] || BUSY_BY[$p]="служба хоста"
  done
fi

# --- Что просит compose ------------------------------------------------------
# Порты часто записаны как "${WEB_PORT:-3000}:3000". Наивный grep вытащил бы из этого
# мусор и МОЛЧА решил, что публикуемых портов нет, — то есть проверка «зеленела» бы
# ровно там, где она нужна. Поэтому сначала пробуем `docker compose config`: он
# разворачивает переменные и .env сам и является единственным авторитетным источником.
PROJECT_DIR="$(cd "$(dirname "$COMPOSE")" && pwd)"

extract_from_config() {
  docker compose -f "$COMPOSE" --project-directory "$PROJECT_DIR" config 2>/dev/null \
    | sed -n '/^[[:space:]]*ports:/,/^[[:space:]]*[a-z_]*:[[:space:]]*$/p' \
    | grep -oE 'published:[[:space:]]*"?[0-9]+"?' | grep -oE '[0-9]+'
}

# Фолбэк без docker: сами подставляем значение по умолчанию из ${VAR:-DEFAULT},
# а при его отсутствии — значение переменной из .env рядом с compose.
extract_fallback() {
  local envfile="$PROJECT_DIR/.env" line host
  sed -n '/^[[:space:]]*ports:/,/^[[:space:]]*[a-z_]*:[[:space:]]*$/p' "$COMPOSE" \
    | grep -oE '[^["'"'"' ]*[0-9}]:[0-9]+(/[a-z]+)?' \
    | while read -r line; do
        host="${line%%:[0-9]*}"
        host="${line%:*}"
        if [[ "$host" =~ \$\{([A-Za-z_][A-Za-z0-9_]*):-([0-9]+)\} ]]; then
          # ${VAR:-3000} — если VAR задан в .env, побеждает он, иначе дефолт.
          local var="${BASH_REMATCH[1]}" def="${BASH_REMATCH[2]}" fromenv=""
          [ -f "$envfile" ] && fromenv=$(grep -oE "^${var}=[0-9]+" "$envfile" | tail -1 | cut -d= -f2)
          echo "${fromenv:-$def}"
        elif [[ "$host" =~ \$\{([A-Za-z_][A-Za-z0-9_]*)\} ]]; then
          local var="${BASH_REMATCH[1]}" fromenv=""
          [ -f "$envfile" ] && fromenv=$(grep -oE "^${var}=[0-9]+" "$envfile" | tail -1 | cut -d= -f2)
          [ -n "$fromenv" ] && echo "$fromenv" || echo "UNRESOLVED:$var"
        else
          grep -oE '[0-9]+$' <<<"$host"
        fi
      done
}

mapfile -t RAW < <( { command -v docker >/dev/null 2>&1 && extract_from_config; } | sort -un )
if [ ${#RAW[@]} -eq 0 ]; then
  mapfile -t RAW < <(extract_fallback | sort -u)
fi

WANTED=()
for entry in "${RAW[@]:-}"; do
  [ -z "$entry" ] && continue
  if [[ "$entry" == UNRESOLVED:* ]]; then
    warn "переменная ${entry#UNRESOLVED:} без значения по умолчанию и без .env — порт проверить нельзя"
    FAIL=1
    continue
  fi
  WANTED+=("$entry")
done

if [ ${#WANTED[@]} -eq 0 ]; then
  echo "== Порты =="
  ok "compose не публикует портов наружу — конфликтовать нечему"
  exit 0
fi

# --- Правило №0: БД не публикуется наружу ------------------------------------
# Заслужено инцидентом: тестовый Postgres с -p 55432:5432 и паролем postgres был
# взломан из интернета примерно за час (COPY ... TO PROGRAM -> червь-майнер).
# Проверка детерминированная, потому что цена ошибки — компрометация, а не неудобство.
echo "== БД и хранилища не смотрят в интернет =="
DB_PORTS='5432|3306|27017|6379|9200|9300|5672|11211|9000'
DB_IMAGES='postgres|mysql|mariadb|mongo|redis|elasticsearch|opensearch|minio|rabbitmq|memcached|clickhouse|pgvector'

db_exposed=""
config_ok=0
if command -v docker >/dev/null 2>&1; then
  # Сначала УБЕЖДАЕМСЯ, что конфиг вообще читается. Иначе пустой вывод неотличим от
  # «нарушений нет», и проверка зеленеет именно там, где должна была сработать.
  if docker compose -f "$COMPOSE" --project-directory "$PROJECT_DIR" config >/dev/null 2>&1; then
    config_ok=1
  fi
  # `docker compose config` печатает каждый сервис с его image и published/target портами.
  db_exposed=$(docker compose -f "$COMPOSE" --project-directory "$PROJECT_DIR" config 2>/dev/null \
    | awk -v imgs="$DB_IMAGES" -v prts="$DB_PORTS" '
        /^  [a-zA-Z0-9_-]+:$/ { svc=$1; sub(/:$/,"",svc); isdb=0 }
        /^[[:space:]]*image:/ { if ($2 ~ imgs) isdb=1 }
        /^[[:space:]]*host_ip:/ { hip=$2 }
        /^[[:space:]]*target:/ { tgt=$2 }
        /^[[:space:]]*published:/ {
          pub=$2; gsub(/"/,"",pub)
          # Публикация на ПЕТЛЮ законна: так поднимается тестовое окружение, где тесты
          # идут с хоста. Опасна только привязка ко всем интерфейсам — её docker
          # печатает как host_ip: 0.0.0.0 либо не печатает вовсе.
          loopback = (hip ~ /^127\./ || hip == "::1")
          if ((isdb || tgt ~ "^(" prts ")$") && !loopback) print svc " (порт " pub " -> " tgt ")"
          hip = ""
        }')
fi

if [ -n "$db_exposed" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && fail "$line — хранилище опубликовано наружу. Заменить ports: на expose:"
  done <<<"$db_exposed"
  echo "     Соседи по сети compose достучатся по имени сервиса и без публикации."
  echo "     Правило: .claude/rules/docker-ports.md, «Правило №0»."
elif [ "$config_ok" -eq 1 ]; then
  ok "ни одно хранилище не публикует порт наружу"
else
  # НЕ зеленеем: конфиг не прочитан, значит проверка не выполнена.
  fail "не удалось прочитать конфиг ($COMPOSE) — проверка на публикацию БД НЕ выполнена"
  echo "     Причина обычно в незаданной переменной; посмотреть: docker compose -f $COMPOSE config"
fi
echo

# --- За reverse-proxy приложение тоже не публикуется ---------------------------
# Если в compose есть reverse-proxy (caddy/nginx/traefik), то он и есть единственная
# дверь. Опубликованное рядом приложение позволяет обойти прокси — а вместе с ним и
# всё, что прокси гарантирует. Конкретный случай, ради которого проверка появилась:
# extractClientIP доверяет ПОСЛЕДНЕМУ элементу X-Forwarded-For, потому что его
# дописывает Caddy; при прямом доступе этот элемент задаёт клиент и обходит rate limit
# сменой заголовка (найдено вторым мнением, воспроизведено на живом контейнере).
echo "== За reverse-proxy приложение не публикуется =="
if [ "$config_ok" -eq 1 ]; then
  proxy_present=$(docker compose -f "$COMPOSE" --project-directory "$PROJECT_DIR" config 2>/dev/null \
    | grep -cE '^[[:space:]]*image:[[:space:]]*(docker\.io/library/)?(caddy|nginx|traefik|haproxy)')
  if [ "${proxy_present:-0}" -gt 0 ]; then
    app_pub=$(docker compose -f "$COMPOSE" --project-directory "$PROJECT_DIR" config 2>/dev/null \
      | awk '
          /^  [a-zA-Z0-9_-]+:$/ { svc=$1; sub(/:$/,"",svc); isproxy=0 }
          /^[[:space:]]*image:/ { if ($2 ~ /(caddy|nginx|traefik|haproxy)/) isproxy=1 }
          /^[[:space:]]*published:/ { if (!isproxy) print svc }' | sort -u | tr "\n" " ")
    if [ -n "$app_pub" ]; then
      fail "есть reverse-proxy, но наружу публикуют также: $app_pub"
      echo "     Прокси обходится прямым обращением — вместе со всем, что он гарантирует."
      echo "     Заменить ports: на expose: у всего, кроме прокси."
    else
      ok "наружу смотрит только reverse-proxy"
    fi
  else
    ok "reverse-proxy в compose нет — проверка неприменима"
  fi
else
  fail "конфиг не прочитан — проверка «только прокси наружу» НЕ выполнена"
fi
echo

echo "== Конфликты портов с уже занятым на этой машине =="
for p in "${WANTED[@]}"; do
  if [ -n "${BUSY_BY[$p]:-}" ]; then
    fail "порт $p уже занят: ${BUSY_BY[$p]} — \`docker compose up\` упадёт с 'port is already allocated'"
  else
    ok "порт $p свободен"
  fi
done

if [ "$FAIL" -ne 0 ]; then
  cat <<'HINT'

Как чинить (в порядке предпочтения):
  1. Вынести хостовые порты в .env  ->  ports: ["${WEB_PORT:-3000}:3000"]
     и задать свободные значения в .env конкретной машины. Compose остаётся общим.
  2. Если 80/443 заняты чужим reverse-proxy — не публиковать их из этого проекта,
     а подключить сервис к сети существующего прокси.
  3. Менять номер ВНУТРИ контейнера не нужно: конфликтует только хостовая часть.
HINT
fi

exit "$FAIL"
