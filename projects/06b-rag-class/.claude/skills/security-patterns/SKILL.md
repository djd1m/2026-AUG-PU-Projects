---
name: security-patterns
description: >
  Шаблоны безопасности N6b для внешнего API модели и публичных поверхностей: серверный ключ OpenRouter
  с закреплённым исполнителем, потолки расходов до вызова, SSRF-фильтр обходчика, origin-gate виджета
  и демо-ручки, HMAC ключа посетителя, RLS в транзакции. Загружать при работе с OpenRouter, публичными
  ручками, обходчиком и квотами. Триггеры: «безопасность», «SSRF», «CORS», «ключ API», «квота», «RLS».
version: "1.0"
maturity: beta
---

# N6b — шаблоны безопасности

Правила: `.claude/rules/security.md`, `.claude/rules/secrets-management.md`. Этот навык — как реализовать.

## 1. Серверный ключ и закреплённый исполнитель (ADR-004, ADR-011)

- Ключ читается один раз в Boot config check; адаптер `live` — синглтон; ключ нигде не логируется (маскировать заголовок
  `Authorization` в журнале ошибок).
- Константа `PROVIDER = { order: ['openai'], allow_fallbacks: false }` в коде; тест проверяет её присутствие в обоих телах.
- Отказ шлюза/исполнителя → `ProviderUnavailable` → 503; попытка засчитана; запроса к другому исполнителю нет.

## 2. Потолок до вызова (ADR-010, `docs/model-cost-contract.md`)

| Вызов | Единица | Пределы |
|---|---|---|
| ответ посетителю (виджет, демо) | `visitor_key` = HMAC(`VISITOR_SECRET`, префикс IP /24 · /64 + bot_id) | 30 / посетитель, 300 / бот, 3 000 всего в сутки |
| ответ в песочнице | аккаунт | 100 / аккаунт, 2 000 всего в сутки |
| эмбеддинги | аккаунт | 2 000 000 токенов / аккаунт, 20 000 000 всего |
| вход и регистрация | адрес (IPv6 /64) | 10 в час |

Резерв атомарно одной транзакцией, отказ = 429 с контактом владельца; счёт по попыткам; расход виден в `/admin/metrics`
и на https://openrouter.ai/activity.

## 3. SSRF-фильтр обходчика (ADR-013)

```ts
async function safeFetch(url: URL, hop = 0): Promise<Response> {
  if (!['http:', 'https:'].includes(url.protocol) || !['', '80', '443'].includes(url.port)) throw new Blocked('scheme/port');
  const addrs = await dns.lookup(url.hostname, { all: true });
  if (addrs.some(a => isPrivateOrReserved(a.address))) throw new Blocked('private');   // loopback, RFC1918, link-local, CGNAT, metadata, ::1, fc00::/7
  const res = await undiciRequest(url, { connect: pinTo(addrs[0].address), redirect: 'manual', headersTimeout: 15_000 });
  if (isRedirect(res) && hop < 5) return safeFetch(new URL(res.headers.location, url), hop + 1);   // проверка на каждом шаге
  return res;
}
```

Тот же хост, что у источника; поток обрывается на 2 МБ (HTML) / 10 МБ (PDF).

## 4. Origin-gate

```ts
const origin = normalizeOrigin(req.headers.get('origin'));        // 'null' и отсутствие → null
if (!origin || !bot.allowedOrigins.includes(origin)) return new Response(null, { status: 403 });   // без CORS
// демо: media type === 'application/json' && origin === ownOrigin, проверка ДО reserveQuota
```

`Vary: Origin` на всех ответах с CORS; `credentials` не используется; `*` запрещён.

## 5. RLS в транзакции

```ts
await client.query('BEGIN');
await client.query("SELECT set_config('app.account_ids', $1, true)", [ids.join(',')]);   // true = LOCAL
// … запросы приложения …
await client.query('COMMIT');
```

Пул выдаёт соединение на транзакцию целиком; `set_config` параметризован, без интерполяции строк.

## 6. Проверка наружу

`node .claude/hooks/check-ports.cjs .` (Правило №0: `db` без `ports:`), `bash ../../scripts/check-port-conflicts.sh
projects/06b-rag-class`, E2E виджета на чужом origin под CSP — квитанция в `docs/embed-contract.md`.
