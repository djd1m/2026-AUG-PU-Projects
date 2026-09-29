# Pseudocode-OPS — как реализованы адрес гостя, приём и доставка

> Продолжение [`Pseudocode.md`](Pseudocode.md); **нумерация сквозная** (§9–§11 после §8). Вынесено
> по лимиту 500 строк тем же приёмом, что [`Architecture-OPS.md`](Architecture-OPS.md). Роли СУБД —
> те же: `app_render`, `app_intake`, `app_notify`.
>
> Разница с головным файлом: там — **алгоритм, спроектированный на Phase 1**; здесь — то, что
> **исполняется в коде** на 29.09.2026, с путём к файлу у каждого блока. Где они расходятся,
> прав код; расхождения названы в конце каждого раздела. Требования — NFR-SEC-005
> ([`Specification-NFR.md`](Specification-NFR.md)), FR-006, FR-007 ([`Specification.md`](Specification.md)).

## 9. Адрес гостя — ключ лимита «10 с адреса на точку» (фича `guest-ip-forwarding`, 28.09)

Источники: `apps/guest/src/client-ip.ts`, `apps/guest/src/server.ts` (`postToIntake`),
`services/intake/src/server.ts` (`guestIp`, `canonIp`), `services/intake/src/limit.ts`;
тест `services/intake/tests/seam-guest-ip.test.ts`; мутации M-30…M-34 ([`Refinement.md`](Refinement.md) §2);
полный план — [`features/guest-ip-forwarding/01_plan.md`](features/guest-ip-forwarding/01_plan.md).

```
гость ──TLS──▶ Caddy ai-hub-tls-proxy (сеть talk-ai-public) ──XFF──▶ guest ──X-Guest-IP──▶ intake
                                    ▲ в той же сети ~10 чужих контейнеров          (только сеть default)

# guest (app_render). Старт в NODE_ENV=production без TRUSTED_PROXY_HOST — ОТКАЗ; имя не резолвится —
# ОТКАЗ (assertProxyResolvable в main.ts; restart: unless-stopped повторит, пока прокси не появится).
trustedProxies():                                   # DNS сети compose, TTL 30 с, дедлайн 1 с
  if now - resolvedAt < 30 с: return trusted
  inflight ??= lookup(TRUSTED_PROXY_HOST, all)      # одновременные запросы ждут ОДИН резолв
  on error/deadline: trusted = {} ; log trusted_proxy_lookup_failed   # ПУСТОЕ, а не прежнее

pickClientIp(peer, xff, trusted):                   # чистая функция
  p = canonIp(peer); if p is undefined: return "unknown"
  if p not in trusted or xff is absent: return p    # сосед по сети: ключ = ЕГО адрес
  return canonIp(last(split(xff, ","))) ?? p        # ПОСЛЕДНИЙ элемент — его дописал наш прокси

canonIp(a):                                         # один адрес — один ключ
  снять скобки только ПАРОЙ; IPv4 как есть; IPv6 → нормализация WHATWG URL;
  ::ffff:a.b.c.d → a.b.c.d; не адрес → undefined
  # КОПИЯ в services/intake/src/server.ts (разные образы); расхождение ловит таблица теста (M-34)

POST /r/:slug/private (форма, guest):
  ip = clientIp(req)
  r = fetch(INTAKE_URL + "/api/feedback/private", POST, таймаут 8 с,
            headers { content-type: json, origin: BASE_URL, x-guest-ip: ip })   # собирается ЗАНОВО
  201 → запись private_door_click, страница «отправлено» · 429 → «Слишком много сообщений с этого
  адреса» · иначе 422 с ошибками · сеть/таймаут → 503 «Сервис временно недоступен»

# intake (app_intake). Верит X-Guest-IP, потому что НЕ опубликован и НЕ в сети прокси — условие несущее.
guestIp(req) = canonIp(req.header("x-guest-ip")) ?? req.socket.remoteAddress ?? "unknown"

consume(scope, key, limit):                         # limit.ts
  if waiting[scope|key] >= 64: return false         # очередь ограничена — сверх неё отказ сразу
  встать в промис-цепочку ключа (В ПАМЯТИ, ДО pool.connect: ожидающий держит сокет, не соединение)
  consumeOnce: begin; pg_try_advisory_xact_lock(42002, hashtext(scope|key)) — занят → false
               count(rate_limit_events за час) >= limit → commit; false
               insert rate_limit_events(scope, key); commit; true
```

**Расхождения с [`Pseudocode.md`](Pseudocode.md) §2.2:** там ждущий `pg_advisory_xact_lock`; в коде —
очередь в памяти плюс **try**-лок (ждущий лок держал бы соединения пула, голый try-лок давал ложные
`429` одновременным гостям одной точки). Остаточные риски — две реплики `intake` (очередь их не
видит), окно TTL 30 с при переиспользовании адреса прокси, доверие `intake` к любому контейнеру
своей compose-сети — [`features/guest-ip-forwarding/05_completion.md`](features/guest-ip-forwarding/05_completion.md).

## 10. Приём приватного обращения — как исполняется (`services/intake`)

Источники: `services/intake/src/server.ts`, `barrier.ts`, `validate.ts`, `main.ts`; тест
`services/intake/tests/intake.test.ts`. Порядок шагов совпадает с [`Pseudocode.md`](Pseudocode.md) §2:
Origin → грубый барьер (200/час с адреса, в памяти, `MAX_KEYS = 50 000`, переполнение — пропуск) →
тело ≤ 16 КБ за 5 с (`413`/`408`) → JSON → резолв точки (`404`) → `private_ip_place` 10/час →
`private_place` 100/час → валидация (`422`) → одна транзакция.

```
transaction:
  INSERT INTO private_feedback(id, place_id, body, rating, contact)   # id = randomUUID() в приложении
  INSERT INTO notifications(private_feedback_id, channel) VALUES (pf_id, 'telegram')   # ВСЕГДА одна
                                                                        # строка, без ON CONFLICT
return 201 { ok: true }

каждые 60 с (main.ts): s = barrier.drain(); if s.rejected or s.evicted: log "rate_limit_coarse_window" s
```

**Расхождения:** (1) строка `notifications` создаётся **всегда** на канал `telegram`, а не по
привязанным каналам; `ON CONFLICT` убран намеренно — он требует `SELECT`, которого у роли нет, а
`pf_id` свежий, поэтому конфликт невозможен (комментарий в коде). Непривязанная точка → воркер
ставит `failed / channel_not_bound` (§11). (2) Агрегат грубого барьера уходит **в журнал процесса**
(`docker logs reviewqr-intake-1`), а не строкой в `analytics_events`. (3) Событие
`rate_limit_place_rejected` не пишется. (4) Пустой `BASE_URL` отключает проверку Origin
([`Refinement.md`](Refinement.md) §9, G-12).

## 11. Доставка владельцу — как исполняется (`services/notifier`)

Источники: `services/notifier/src/main.ts`, `worker.ts`, `deliver.ts`, `format.ts`; тест
`services/notifier/tests/notifier.test.ts`. Привязка бота — [`Pseudocode-OWNER.md`](Pseudocode-OWNER.md) §4.3,
истечение подписки — [`Pseudocode-GROWTH.md`](Pseudocode-GROWTH.md) §3.1.

```
loop каждые NOTIFY_INTERVAL_MS (по умолчанию 5 000 мс):
  pollBindings(); tick(); раз в час expireSubscriptions(); ошибка тика → log notifier_tick_failed

tick():
  jobs = transaction:                                    # короткая, соединение освобождается ДО отправки
    SELECT n.id, n.channel, pf.body, pf.rating, pf.contact, p.name, cb.chat_id
      FROM notifications n JOIN private_feedback pf … JOIN places p … LEFT JOIN channel_bindings cb …
     WHERE n.status='pending' AND n.attempts < 5 ORDER BY n.created_at LIMIT 20
       FOR UPDATE OF n SKIP LOCKED
    UPDATE notifications SET status='sending', attempts = attempts + 1   # ДО внешнего вызова
  for j in jobs:
    if j.chat_id is null: status='failed', last_error='channel_not_bound'; continue
    text = "Новое сообщение — <точка>" [+ "Оценка: N из 5"] [+ "Контакт: …"] + "\n\n" + body
           # предел канала: telegram 4096, max 2000; не влезло → обрезка + "[показано не полностью]"
    r = POST api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage (таймаут 8 с)
    ok → status='sent', sent_at=now() · 5xx/сеть → status='pending' (повтор на следующем тике)
    4xx → status='failed' (бот заблокирован, chat_id неверен — повтор не поможет)
```

**Расхождения с [`Pseudocode.md`](Pseudocode.md) §3:** попыток **5**, а не 6; экспоненциальной задержки
и колонки `next_attempt_at` нет — повтор на следующем тике (≈ 5 с); `audit_log` не пишется; пометка
об усечении — без ссылки в кабинет; отправка только в Telegram (MAX не реализован). Строка,
упавшая между отправкой и записью результата, остаётся в `sending` — это осознанный выбор «лучше
недоставка, видимая в БД, чем дубль» (комментарий в `worker.ts`). В кабинете статус доставки **не
показывается**: провал виден только в БД (`notifications.status`, `last_error`) и в журнале.
Задержка доставки на стенде — 5–13 с ([`demo-script.md`](demo-script.md), «Риски на сцене»).
