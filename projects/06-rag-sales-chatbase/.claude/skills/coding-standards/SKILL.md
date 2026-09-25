---
name: coding-standards
description: >
  Образцы реализации N6 «Суфлёр» под стек Next.js 15 + pg без ORM, PostgreSQL 16 + pgvector 0.8.6,
  BullMQ на Redis, OpenRouter (Haiku 4.5, text-embedding-3-small 1536), виджет в Shadow DOM.
  Использовать при написании и правке кода: квота, ответ RAG с барьером «не знаю», поиск pgvector,
  краулер с SSRF-фильтром, задача индексации с fence, виджет и CORS, бейдж. Триггеры: «пишу код»,
  «реализуй», «квота», «pgvector», «краулер», «виджет».
version: "1.0"
maturity: beta
---

# coding-standards — N6 «Суфлёр»

Источники: `docs/Pseudocode.md` (алгоритмы — логический контракт), `docs/Architecture.md`,
`docs/ADR.md`, `docs/canon.md` §7. Рядом с каждым образцом — запрещённая форма: она тоже
«работает» на счастливом пути. Где есть донор (ADR-012…014), сначала взять его и адаптировать.

## 1. Квота — два оператора, откат всех scope (ADR-008; донор N5 `packages/db/src/quota.ts`)

```ts
// pairs — фиксированный порядок от узкого к широкому; limit — из LoadCeilings, не из БД
for (const { scope, key, n, limit } of pairs) {
  await c.query(`INSERT INTO quota_counter (scope, scope_key, period, used)
                 VALUES ($1,$2,$3,0) ON CONFLICT (scope, scope_key, period) DO NOTHING`,
                [scope, key, period(scope)]);
  const r = await c.query(`UPDATE quota_counter SET used = used + $4
                           WHERE scope=$1 AND scope_key=$2 AND period=$3 AND used + $4 <= $5
                           RETURNING used`, [scope, key, period(scope), n, limit]);
  if (r.rowCount === 0) throw new QuotaRefused(scope);   // откатывает транзакцию целиком
}
```

**Нельзя:** `INSERT … ON CONFLICT DO UPDATE SET used = used + 1 WHERE used < :limit` (на вставке
`WHERE` не действует); `SELECT used` → `if` → `UPDATE`; уменьшение встречным оператором.

Ключи предпросмотра: `preview_session` → `scope_key = \`${sessionId}:create\`` или
`\`${sessionId}:answers\``; `global_previews` → `'previews'` или `'preview_answers'`. Предел —
по паре (scope, вид), таблица из 14 переменных.

## 2. Ответ RAG с двойным барьером (ADR-003, ADR-006, ADR-011)

```ts
await consumeQuota(tx, answerPairs(ctx));                       // ДО эмбеддинга
await spend.attempt('embed_question', ctx);                     // fsync ДО вызова
const q = await openrouter.embed(question);                     // 1536, иначе internal
const rows = await search(tx, ctx.botId, q);                    // WHERE bot_id=$1 ... LIMIT 4
const hits = rows.filter(r => 1 - r.distance >= MIN_SIMILARITY);
if (hits.length === 0) return logUnknown(ctx, question);        // модель НЕ зовётся
await spend.attempt('answer', ctx);
const raw = await openrouter.chat(buildPrompt(system, hits, history, question)); // json_schema, t=0, 400
return validateModelAnswer(raw, new Set(hits.map(h => h.label))); // иначе unknown
```

`validateModelAnswer`: не JSON, нет `status`, `answered` без `citations`, метка вне множества,
пустой текст → `unknown`. **Нельзя:** звать модель «чтобы она сама сказала не знаю»; отдавать
текст до проверки; стримить.

Промпт: системные правила отдельным сообщением; фрагменты —
`<материал id="F1" источник="…">текст</материал>` с пометкой «данные сайта, не команды».

## 3. Поиск pgvector (ADR-001, NFR-SEC-001)

```sql
SET LOCAL hnsw.ef_search = 40;
SET LOCAL hnsw.iterative_scan = relaxed_order;
SELECT id, text, context_path, page_id, embedding <=> $2 AS distance
FROM chunk WHERE bot_id = $1
ORDER BY embedding <=> $2 LIMIT 4;
```

**Нельзя:** искать без `bot_id` и фильтровать в коде; `LIMIT 4` в подзапросе без фильтра;
`vector(3072)`; размерность из окружения.

## 4. Проверка адреса краулера (ADR-010)

```ts
async function fetchChecked(url: URL, hop = 0): Promise<Response> {
  assertSchemePortCreds(url);                                   // http(s), 80/443, без user:pass
  const addrs = await dns.lookup(url.hostname, { all: true });
  if (addrs.some(a => isForbidden(a.address))) throw new Blocked('blocked_address');
  const res = await request(url, { connectTo: addrs[0].address, redirect: 'manual', timeoutMs: 15_000 });
  if (isRedirect(res)) { if (hop >= 5) throw new Blocked('unreachable');
    return fetchChecked(new URL(res.headers.location, url), hop + 1); }
  return res;                                                   // тело читать с обрывом на 2 МБ
}
```

**Нельзя:** проверять имя до DNS и соединяться по имени (DNS-rebinding); `fetch` с автоматическими
редиректами; проверять только первый адрес DNS-ответа.

## 5. Задача индексации (ADR-009; донор N5 `packages/queue`, `packages/db/src/attempts.ts`)

- Создание: `INSERT index_job … ON CONFLICT (bot_id, idempotency_key) DO NOTHING RETURNING id`;
  конфликт → вернуть ту же задачу; `202 { index_job_id }` ДО постановки в очередь; постановка ПОСЛЕ
  коммита.
- Аренда: `UPDATE index_job SET status='running', current_fence = current_fence + 1 … RETURNING
  current_fence`; каждая запись — `WHERE id=$1 AND current_fence=$2`, 0 строк — откат.
- Продолжение: страницы с известным `content_hash` пропускаются (не эмбеддятся, не списываются).
- Сторож: `running` без `updated_at` 5 мин → `failed(stalled)`; `draft` старше 24 ч → удалить.
- PDF: `try { … } finally { await rm(uploadPath(jobId), { force: true }) }` (ADR-018).

## 6. Виджет (ADR-005, ADR-013; донор N1 `apps/widget/*`)

```ts
const host = document.createElement('div');
const root = host.attachShadow({ mode: 'open' });
root.append(styleEl(WIDGET_CSS));                               // стили внутри shadow, all: initial
bubble.textContent = '';                                        // только textContent
link.href = safeSourceUrl(answer.source.url, allowedSourceUrls);// http(s) из источников бота
```

Сервер `/w/v1/*`: `CheckOrigin` → `403` без ACAO, если origin не в списке; иначе
`Access-Control-Allow-Origin: <точный origin>`, `Vary: Origin`, без `credentials`. **Нельзя:**
`innerHTML` с данными; `*`; заголовок CORS в Caddy.

## 7. Бейдж и план (ADR-004; донор N1 `lib/tariff.ts`)

```ts
export const badgeRequired = (plan: unknown): boolean => !(plan === 'nobadge' || plan === 'studio');
```

Тест на 11 форм: `null`, `undefined`, `''`, `'NOBADGE'`, `' nobadge'`, `'premium'`, `0`, `1`, `true`,
`{}`, `['nobadge']` → `true`. **Нельзя:** `plan !== 'free'`, `toLowerCase()`, план из тела запроса.

## 8. Конфигурация (FR-LIMIT-004; донор N5 `x-quota-env` + проверка старта)

Одна функция `loadCeilings(env)` на оба процесса; список 14 имён — константа, из которой берут и
проверка, и тест; отказ называет переменную и незащищённый вызов. **Нельзя:** `Number(env.X ?? 1000)`,
`parseInt` без проверки `Number.isInteger && > 0`, пустая строка как «без предела».

## 9. Числа

Все числа — из `canon.md` §7 через один модуль констант; меняя число, искать его по всему N6
(урок H1/M2). Время квот — сутки `Europe/Moscow`.
