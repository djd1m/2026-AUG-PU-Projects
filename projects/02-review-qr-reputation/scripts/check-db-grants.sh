#!/usr/bin/env bash
# T3 · Матрица прав СУБД — несущая защита, а не administrivia.
#
# Гейтинг («показать площадки только довольным») требует, чтобы код, порождающий гостевую
# страницу, МОГ прочитать тональность. Он не может: у роли app_render нет SELECT на
# private_feedback. Поэтому гейтинг падает с permission denied при первом запуске, а не
# ловится на код-ревью. Этот страж утверждает, что так и осталось.
#
# T3c — единственное намеренное чтение ролью собственных записей (app_intake на
# rate_limit_events). Оно безопасно ТОЛЬКО в паре с грубым барьером в памяти: он
# отбрасывает поток до обращения к БД. Убрать барьер нельзя, не пересмотрев грант.
#
# Коды: 0 — матрица соответствует · 1 — нарушена · 2 — ПРОВЕРКА НЕ ВЫПОЛНЕНА.
# Третий код обязателен: страж, отвечающий «чисто» на недоступной базе, хуже отсутствующего.

set -uo pipefail
FAIL=0
PSQL_URL="${DATABASE_URL_SUPER:-}"
[ -z "$PSQL_URL" ] && { echo "❌ DATABASE_URL_SUPER не задан — проверка НЕ выполнена" >&2; exit 2; }
command -v psql >/dev/null || { echo "❌ psql не найден — проверка НЕ выполнена" >&2; exit 2; }
psql "$PSQL_URL" -tAc 'SELECT 1' >/dev/null 2>&1 || { echo "❌ база недоступна — проверка НЕ выполнена" >&2; exit 2; }

echo "== T3 · матрица прав =="

# has $роль $таблица $право $ожидание(yes|no) $пояснение
has() {
  local got
  # ДВА источника, а не один. Колоночный грант (`GRANT SELECT (id, slug) ON places`)
  # в role_table_grants НЕ ВИДЕН — он лежит в role_column_grants. Первая редакция стража
  # смотрела только в первую и дала ложное красное на верной схеме: «прав нет» там, где
  # чтение работало. Ложное красное отключают вместе с настоящим, поэтому чинится, а не
  # обходится.
  got=$(psql "$PSQL_URL" -tAc \
    "SELECT (SELECT count(*) FROM information_schema.role_table_grants
              WHERE grantee='$1' AND table_name='$2' AND privilege_type='$3')
          + (SELECT count(*) FROM information_schema.role_column_grants
              WHERE grantee='$1' AND table_name='$2' AND privilege_type='$3')" 2>/dev/null)
  [ -z "$got" ] && { echo "❌ запрос к information_schema не удался — проверка НЕ выполнена" >&2; exit 2; }
  local actual=no; [ "$got" -gt 0 ] && actual=yes
  if [ "$actual" = "$4" ]; then printf '  ✅ %-11s %-19s %-6s %s\n' "$1" "$2" "$3" "$5"
  else printf '  ❌ %-11s %-19s %-6s ОЖИДАЛОСЬ %s, ЕСТЬ %s — %s\n' "$1" "$2" "$3" "$4" "$actual" "$5"; FAIL=1; fi
}

# ── Несущее: рендер не читает тональность ни в каком виде
has app_render private_feedback  SELECT no  "гейтинг невыразим: тональность недоступна"
has app_render private_feedback  INSERT no  "и писать её рендер тоже не может"
has app_render guest_events      SELECT no  "не читает даже свой журнал: иначе INSERT..RETURNING = канал чтения"
has app_render guest_events      INSERT yes "метрика недели считается по сканам"
has app_render places            SELECT yes "резолв slug"
has app_render platform_links    SELECT yes "двери страницы"

# ── Приём: пишет, не читает
# Колонки places проверяются У ОБЕИХ ролей. Первая редакция стража перечисляла только
# app_render, и когда тот же дефект повторился у app_intake, страж остался зелёным:
# защита была написана против ПЕРВОГО экземпляра класса.
has app_intake places            SELECT yes "резолв slug на приёме, включая archived_at"
has app_intake private_feedback  SELECT no  "принимает и не перечитывает"
has app_intake private_feedback  INSERT yes ""
has app_intake analytics_events  SELECT no  "аналитика не может стать входом в решение"
has app_intake analytics_events  INSERT yes ""
has app_intake rate_limit_events SELECT yes "T3c: ЕДИНСТВЕННОЕ намеренное исключение — см. шапку"
has app_intake rate_limit_events INSERT yes ""

# ── Доставка: читает приватное по назначению
# ТРЕТЬЯ роль в проверке. Первая редакция стража перечисляла права ОДНОЙ роли, и тот же
# дефект повторился ещё дважды, оставаясь зелёным. Правило: у каждой роли — каждая таблица,
# которую трогает её код.
has app_notify places            SELECT yes "имя точки в заголовке сообщения"
has app_notify channel_bindings  SELECT yes "куда слать"
has app_notify private_feedback  SELECT yes "текст нужен для отправки владельцу"
has app_notify private_feedback  INSERT no  ""

# ── Оплата: ЧЕТВЁРТАЯ роль в матрице и пять новых таблиц.
# Перечисляются целиком, включая отрицательные строки: список только положительных прав
# отвечает на вопрос «работает ли», но не на вопрос «а больше ничего не может?».
has app_owner  checkout_sessions SELECT yes "вебхук находит арендатора по provider_session_id"
has app_owner  checkout_sessions INSERT yes "создание платежа из кабинета"
has app_owner  checkout_sessions UPDATE yes "пометка completed"
has app_owner  webhook_events    INSERT yes "заявка идемпотентности"
has app_owner  webhook_events    SELECT yes "ON CONFLICT..RETURNING без SELECT падает — грант парный"
has app_owner  commissions       INSERT yes "начисление партнёру"
has app_owner  subscriptions     INSERT yes "активация тарифа"
has app_owner  places            UPDATE yes "снятие бренд-строки после оплаты"

# Деньги недоступны гостевым ролям НИ В КАКОМ виде. Не «незачем», а невыразимо:
# подделать событие оплаты приёмом или прочитать платежи рендером нельзя правами.
has app_render checkout_sessions SELECT no  "гостевая поверхность денег не видит"
has app_render webhook_events    SELECT no  ""
has app_render subscriptions     SELECT no  "тариф решает branding_required в places, а не чтение подписки"
has app_intake webhook_events    INSERT no  "приём не может подделать событие оплаты"
has app_intake commissions       INSERT no  ""

# Истечение подписки живёт в доставке — и ровно в объёме истечения.
has app_notify subscriptions     UPDATE yes "гашение просроченной подписки"
has app_notify places            UPDATE yes "возврат бренд-строки (колоночный грант)"
has app_notify checkout_sessions SELECT no  "к платежам доставка не ходит"
has app_notify webhook_events    INSERT no  ""

# ── Отсутствие полей, которыми выражается гейтинг
echo "== T1 · полей гейтинга не существует =="
for col in gating_enabled rating_threshold positive_destination negative_destination show_if sort_order position; do
  n=$(psql "$PSQL_URL" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='$col'" 2>/dev/null)
  [ -z "$n" ] && { echo "❌ запрос не удался — проверка НЕ выполнена" >&2; exit 2; }
  if [ "$n" = "0" ]; then printf '  ✅ %-22s отсутствует\n' "$col"
  else printf '  ❌ %-22s ПОЯВИЛОСЬ — гейтинг стал выразим\n' "$col"; FAIL=1; fi
done

# ── Единственная оценка в схеме — после выбора приватной двери
n=$(psql "$PSQL_URL" -tAc "SELECT string_agg(table_name||'.'||column_name, ', ') FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('rating','score','sentiment')" 2>/dev/null)
if [ "$n" = "private_feedback.rating" ]; then echo "  ✅ единственная оценка: private_feedback.rating (после развилки)"
else echo "  ❌ оценки в схеме: ${n:-нет} — ожидалась ровно private_feedback.rating"; FAIL=1; fi

# ── UNIQUE там, где он стал бы каналом чтения
echo "== T2 · UNIQUE не превращает ON CONFLICT в канал чтения =="
for t in guest_events analytics_events rate_limit_events; do
  # ПЕРВИЧНЫЙ КЛЮЧ ИСКЛЮЧЁН. PRIMARY KEY реализован уникальным индексом, и наивный поиск
  # по слову UNIQUE в indexdef ругается на него — то есть на каждую таблицу без исключения.
  # Проверяем ограничения типа 'u', а не текст определения индекса: спрашиваем смысл, а не
  # форму записи. Первая редакция спрашивала форму и дала три ложных красных из трёх.
  n=$(psql "$PSQL_URL" -tAc "SELECT count(*) FROM pg_constraint WHERE conrelid='$t'::regclass AND contype='u'" 2>/dev/null)
  if [ "$n" = "0" ]; then printf '  ✅ %-19s без UNIQUE\n' "$t"
  else printf '  ❌ %-19s появился UNIQUE — ON CONFLICT стал каналом чтения\n' "$t"; FAIL=1; fi
done

[ $FAIL -eq 0 ] && echo "== матрица соответствует ==" || echo "== МАТРИЦА НАРУШЕНА ==" >&2
exit $FAIL
