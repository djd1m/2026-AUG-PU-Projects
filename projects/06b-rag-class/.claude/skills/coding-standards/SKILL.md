---
name: coding-standards
description: >
  Стандарты кода N6b «RAG-бот для сайта»: TypeScript/Node 22 монорепо (Next.js 15, pg, esbuild,
  pgvector), паттерны порта провайдера OpenRouter, атомарной квоты, аренды задачи с fence, RAG-ответа
  с проверкой цитат, origin-gate виджета. Загружать перед написанием кода в apps/web, apps/widget,
  services/worker, packages/db, packages/rag. Триггеры: «пиши код», «реализуй», «как оформить», TypeScript, pgvector.
version: "1.0"
maturity: beta
---

# N6b — стандарты кода

Правило стиля: `.claude/rules/coding-style.md`. Здесь — паттерны, закреплённые ADR. Код-образцы — форма, а не готовая
реализация; сверять с `docs/Pseudocode.md`.

## Порт провайдера (ADR-004, ADR-011, SC-US-005-4)

```ts
export interface ModelPort {
  embed(texts: string[], opts: { deadlineMs: number }): Promise<number[][]>;          // 1536
  answer(prompt: Prompt, opts: { deadlineMs: number; maxTokens: 400 }): Promise<AnswerJson>;
}
// live-адаптер: одна константа маршрутизации на оба вызова, из кода, не из окружения
const PROVIDER = { order: ['openai'], allow_fallbacks: false } as const;
// тело: { model: 'openai/gpt-4.1-mini', messages, response_format: { type: 'json_schema', … }, provider: PROVIDER }
// !res.ok или таймаут → throw new ProviderUnavailable(); повторов внутри порта нет
```

Имя модели — из закрытого списка в коде; неизвестное имя в окружении → отказ старта. Журнал `model_call_log`: START до
вызова, ровно один OUTCOME (`succeeded`/`failed`) после.

## Квота (ADR-010)

```sql
INSERT INTO quota_counter(scope, day, used) VALUES ($1, $2, $3)
ON CONFLICT (scope, day) DO UPDATE SET used = quota_counter.used + EXCLUDED.used
WHERE quota_counter.used + EXCLUDED.used <= $4
RETURNING used;               -- нет строки → предел достигнут
```

Все ключи попытки — в ОДНОЙ транзакции; отказ любого — откат всех; платный вызов после COMMIT. Сутки — по МСК.

## Задача индексации (ADR-005)

- `POST` источника отвечает `202 {job_id}` до работы; частичный `unique(source_id) WHERE state IN ('queued','running')`.
- Захват: `SELECT … FOR UPDATE SKIP LOCKED`, `leased_until = now()+interval`, `lease_fence = lease_fence+1`; каждая запись
  результата проверяет fence (`WHERE id=$1 AND lease_fence=$2`), не совпал — работа брошена.
- `attempts ≤ 3`, уборщик возвращает просроченные аренды; потолок 15 мин от `run_started_at`.
- Пользователю три состояния: `queued|running` → «выполняется N из M», `succeeded` → «готово», `failed` → причина + «Повторить».

## RAG-ответ (ADR-003)

1. `hits` = top-5 по `embedding <=> qv` с `SET LOCAL hnsw.iterative_scan = strict_order` и фильтром `bot_id`.
2. `good` = сходство ≥ `MIN_SIMILARITY`; пусто → `dontKnow('below_threshold')` БЕЗ генерации.
3. Ответ модели `{answer, cited_ids, unknown}`; `unknown` или пустые `cited_ids` → `model_unknown`; `cited_ids ⊄ ids(good)`
   → `invalid_citation`.
4. Ссылки — из `document` (`locator_url` или «файл, стр. N»); `stripUrls(answer)`; вывод текстом.

## Публичные ручки

- Widget: `normalizeOrigin(header)` → ∈ `bot.allowed_origins` иначе 403 без CORS; `Access-Control-Allow-Origin` = origin,
  `Vary: Origin`, без `credentials`.
- Demo: media type `application/json` и `normalizeOrigin(Origin) === origin(PUBLIC_BASE_URL)` ДО квоты, иначе 403.
- `metricHost(x)`: нижний регистр, без ведущего `www.`; зовётся и для origin, и для страницы — одна функция.
- `planOf(v)`: `['free','start','studio'].includes(v) ? v : 'free'` — точное совпадение, мусор → free.

## Виджет (`apps/widget`)

Один бандл, `currentScript.dataset.bot`, Shadow DOM, стили через `adoptedStyleSheets`, корень `all: initial`; ни одного
инлайнового `<script>`/`<style>`; `fetch` без `credentials`; панель чата создаётся по клику; бюджет ≤ 30 KB gzip
проверяется скриптом размера в сборке.

## Антипаттерны (отвергнутые альтернативы ADR)

Redis/BullMQ для очереди (ADR-001) · IVFFlat (ADR-002) · URL из текста модели (ADR-003) · `gpt-5-mini` с рассуждением
(ADR-004) · синхронная индексация в запросе (ADR-005) · бейдж решает клиент (ADR-006) · `*` в CORS (ADR-007) · перенос бота
между аккаунтами (ADR-008) · анонимное демо по URL (ADR-009) · ключ модели в браузере (ADR-011) · S3 для PDF (ADR-012).
