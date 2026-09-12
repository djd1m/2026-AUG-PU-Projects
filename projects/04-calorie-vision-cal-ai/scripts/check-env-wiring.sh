#!/usr/bin/env bash
# Страж №1 из `deployment-seams.md`: полнота проброса переменных окружения в сервисы
# docker compose (FR-foundation-10).
#
# Происхождение: .claude/snippets/bash/check-env-wiring.sh (проект 01, 2026-08-27),
# адаптирован под монорепо N4. ЧТО ИМЕННО ИЗМЕНЕНО и почему — ниже, в разделе «Каталоги».
#
# Ловит класс дефектов «приложение стартует, тесты зелёные, наружу выдаётся неверное»:
# переменная читается кодом, но не передана сервису в compose.
#
# Коды возврата ТРИ, и третий здесь главный:
#   0 — потерь нет
#   1 — ДОКАЗАНА потеря: названы переменная и сервис
#   2 — проверка НЕ ВЫПОЛНЕНА (нет docker, нечитаемый или пустой `docker compose config`)
# Пустой вывод конфигурации НИКОГДА не читается как «нарушений не найдено»: страж,
# отвечающий «чисто» на неизвестном состоянии, хуже отсутствия стража
# (`guard-must-be-able-to-fail.md`).

set -uo pipefail
FAIL=0

# ─── Переменные, приходящие НЕ из compose. Список ЯВНЫЙ: молчаливое исключение прячет
#     настоящую потерю. Каждой строке нужна причина. ────────────────────────────────────
#   NODE_ENV, TZ, PORT, CI       — рантайм и окружение исполнения, не конфигурация продукта
#   NEXT_TELEMETRY_DISABLED      — ставится в Dockerfile, а не в compose
#   NEXT_PUBLIC_*                — попадают в клиентский бандл на СБОРКЕ, не в рантайме
#   DATABASE_URL_APP             — только у служебного сервиса `test`, см. ниже
ALLOWED="${ENV_WIRING_ALLOWED:-NODE_ENV|TZ|PORT|CI|NEXT_TELEMETRY_DISABLED|NEXT_PUBLIC_[A-Z0-9_]*}"

PROJECT_DIR="${1:-.}"
cd "$PROJECT_DIR" || { echo "❌ каталог $PROJECT_DIR недоступен — проверка НЕ выполнена" >&2; exit 2; }

# ENV_WIRING_CONFIG — готовый вывод конфигурации вместо вызова docker. Нужен ровно для
# одного: испытать самого стража на трёх входах там, где docker недоступен (внутри
# контейнера прогона тестов его нет). На обычном запуске переменная не задана.
CONFIG="${ENV_WIRING_CONFIG-}"
if [ -z "${ENV_WIRING_CONFIG+set}" ] && ! command -v docker >/dev/null 2>&1; then
  echo '❌ docker недоступен — проверка НЕ выполнена' >&2
  exit 2
fi

if [ -z "${ENV_WIRING_CONFIG+set}" ]; then
  # ВСЕ профили обязательны: api, recognizer и web объявлены в профиле `app`, и
  # `docker compose config` без профилей их просто НЕ ПОКАЗЫВАЕТ. Без этого страж
  # увидел бы пустой блок environment и объявил потерянными все переменные сразу —
  # ложная тревога, от которой стража отключают через неделю.
  CONFIG=$(docker compose --profile app --profile edge --profile test config 2>/dev/null) || CONFIG=""
fi
if [ -z "$CONFIG" ]; then
  echo '❌ docker compose config нечитаем или пуст — проверка НЕ выполнена' >&2
  exit 2
fi

# ─── Каталоги исходников сервиса ────────────────────────────────────────────────────────
# Оригинал снимка брал `context` + каталог `dockerfile`. В N4 это НЕ РАБОТАЕТ: все три
# сервиса собираются из ОДНОГО контекста (корень монорепо) одним Dockerfile, и разделяет
# их только `target`. Взять один контекст — значит посчитать переменные ВСЕГО репозитория
# каждому сервису: ровно те 32 ложные потери, о которых предупреждает снимок.
#
# Поэтому соответствие «сервис → каталоги» ЯВНОЕ. Общие пакеты в список НЕ входят, и это
# требование к коду, а не упрощение: `process.env` читается только в `apps/*/src/env.ts`
# (по одному файлу на сервис), что отдельно стережёт tests/unit/source-guards.test.ts.
service_sources() {
  case "$1" in
    api)        echo 'apps/api' ;;
    recognizer) echo 'apps/recognizer' ;;
    web)        echo 'apps/web' ;;
    *)          echo '' ;;
  esac
}

echo '== Переменные, читаемые кодом, доезжают до сервиса =='

for svc in api recognizer web; do
  dirs=$(service_sources "$svc")
  [ -z "$dirs" ] && continue
  [ -d "$dirs" ] || { echo "  ⚠️  $svc: каталог $dirs отсутствует — пропуск"; continue; }

  # [A-Z][A-Z0-9_]* — С ЦИФРАМИ. Без них S3_ENDPOINT обрезается до «S» и совпадает всегда,
  # то есть страж зеленеет независимо от реальности (ошибка, допущенная в оригинале).
  # Читаются ОБЕ формы: `process.env.X` и `env.X` — в N4 объект окружения передаётся в
  # загрузчик параметром, чтобы тест мог подставить своё окружение, не трогая процесс.
  # Комментарии из подсчёта исключаются: строка документации не является чтением.
  used=$(find "$dirs" -type d \( -name node_modules -o -name .next -o -name dist \) -prune -o \
           -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) -print 2>/dev/null \
         | xargs -r cat 2>/dev/null \
         | grep -vE '^[[:space:]]*(//|\*|/\*)' \
         | grep -oE '(^|[^A-Za-z0-9_.])env\.[A-Z][A-Z0-9_]*' \
         | grep -oE '[A-Z][A-Z0-9_]*$' | sort -u)
  if [ -z "$used" ]; then
    echo "  ⚠️  $svc: ни одной переменной не читается — проверять нечего"
    continue
  fi

  passed=$(printf '%s\n' "$CONFIG" \
           | awk -v svc="  $svc:" '
               $0 == svc { inside = 1; next }
               /^  [a-zA-Z0-9_-]+:$/ { inside = 0 }
               inside { print }
             ' \
           | grep -oE '^[[:space:]]+[A-Z][A-Z0-9_]*:' | tr -d ' :' | sort -u)

  # Сервиса нет в конфигурации — это НЕ «переменные потеряны», а невыполненная проверка.
  if ! printf '%s\n' "$CONFIG" | grep -qxE "  $svc:"; then
    echo "❌ сервис $svc отсутствует в docker compose config — проверка НЕ выполнена" >&2
    exit 2
  fi

  missing=$(comm -23 <(echo "$used") <(echo "$passed") | grep -vxE "$ALLOWED" || true)

  if [ -n "$missing" ]; then
    while read -r v; do
      [ -n "$v" ] && { printf '  ❌ %s: %s читается кодом, но не передаётся сервису\n' "$svc" "$v"; FAIL=1; }
    done <<<"$missing"
  else
    printf '  ✅ %s: все читаемые переменные проброшены\n' "$svc"
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo
  echo '     Добавить в environment соответствующего сервиса docker-compose.yml.'
  echo '     Приложение стартует и без них — ошибка видна только в поведении.'
fi
exit $FAIL
