# 07 — Отчёт исполнителя: `small-talk`

Исполнитель: Claude Opus 5.5 (один агент, отдельный worktree, ветка `feature/n6-small-talk`). Основа `bf7ab6d0`.

| Файл | Что |
|---|---|
| `packages/rag/src/small-talk.ts` (новый) | `detectSmallTalk` — закрытый словарь 6 намерений, правило «вся реплика из словаря», нормализация (регистр, «ё», знаки, эмодзи 👋🙏👍, повтор буквы), опечатка в одну правку (перестановка/вставка/пропуск у слов ≥ 6, замена у ≥ 7), ≤ 80 символов, ≤ 8 слов; `topicsFromTitles`; `smallTalkReply`; `companyLabel` |
| `packages/rag/src/answer.ts` | шаг 0 ядра после статуса бота и границы тела: светская реплика → `{ status: 'small_talk', intent, text }` БЕЗ квоты, эмбеддинга и модели; журнал `small_talk` без текста; зависимость `pageTitles`; `unknownMessage(компания)` вместо `UNKNOWN_MESSAGE` |
| `packages/rag/src/enums.ts`, `index.ts` | `QUESTION_OUTCOME` + `small_talk`; экспорт модуля |
| `packages/db/src/answers.ts` | `readBotPageTitles` — заголовки прочитанных страниц ЭТОГО бота в порядке обхода, ≤ 30 |
| `packages/db/migrations/013_small_talk.sql` (новый) | ДОБАВЛЯЕТ `small_talk` к текущему `question_log_outcome_check` (DO-блок по `pg_get_constraintdef`; неожиданная форма — отказ миграции) |
| `apps/web/src/server/widget-ask-handler.ts` | одна ветка `case 'small_talk'` → `200 { status: unknown, reason: small_talk, text, contact }` (совместимо с кэшированным бандлом — ревью круг 1); без хода истории и установки. Ворота `not_verified` не тронуты |
| `apps/web/src/server/{cabinet,preview}-handler.ts` | ветка `small_talk` в ответе маршрута (экраны кабинета и предпросмотра показывают `text` любого не-answered статуса — правок UI не нужно) |
| `apps/web/src/server/{widget-ask,cabinet,preview}-deps.ts` | `pageTitles: readBotPageTitles` |
| `apps/widget/src/api.ts` | `parseAsk`: `unknown` + `reason: small_talk` → `kind: small_talk` (сообщение бота без источника) |
| `tests/small-talk.test.ts` (новый) | таблица ≥ 73 реплик (6 намерений, ≥ 25 ловушек), темы, шаблоны, ядро: 0 эмбеддингов / моделей / списаний |
| `tests/small-talk.integration.test.ts` (новый) | Postgres: `/w/v1/ask` «привет» → шаблон с темами; «Спасибо!»; «погода» → «не знаю» по сайту; ловушка; CHECK = `QUESTION_OUTCOME`; ответ разбирается прежним (`bf7ab6d0`) и новым `parseAsk` |
| `tests/browser/widget-embed.test.ts`, `widget-harness.ts` | чужой origin 8099: «Привет!» и «Спасибо!» видны в окне; счётчики эмбеддингов и списаний оснастки |
| `tests/enums.test.ts` | outcome: CHECK 001 + значения добавляющих миграций = `QUESTION_OUTCOME` |
| `tests/{rag-answer,widget-ask.unit,bot-isolation,bot-cabinet.integration,preview-flow.integration}.test.ts`, `tests/browser/{preview-flow,bot-cabinet}.test.ts` | новый текст «не знаю»; зависимость `pageTitles` |
| `scripts/test-small-talk-mutations.mjs` (новый) | 5 мутаций стражей |
| документы | Specification FR-ANSWER-003 и SC-US-002-2 (на месте, строки не сдвинуты, новая ревизия), канон §4, контракт стоимости, Refinement, test-scenarios, CLAUDE.md, A-N6-074 |

Переиспользование (ADR-012…016): доноров у светской беседы нет ни в N1–N5 (ни один из готовых ботов не отвечал на
реплики) — **написано заново (почему: нет в донорах)**; каркас мутационного скрипта — **перенесён** из
`scripts/test-rag-answer-mutations.mjs` N6.
