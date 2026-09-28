# 07 — Отчёт исполнителя: `text-source`

Исполнитель — Claude Opus 5.5, один агент в изолированном worktree (`feature/n6-text-source`), основа `09677f78`.

## Файлы

| Файл | Что |
|---|---|
| `packages/db/migrations/015_text_source.sql` | DO-блок дописывает `text` / `not_text` / `text` к `source_kind_check`, `index_job_failure_reason_check`, `index_start_kind_check`; `source_check` (перечисление 001) → три импликации; `content_bytes` (0…2 097 152), `content_sha256`, только у `text` |
| `packages/rag/src/enums.ts`, `constants.ts` | `SOURCE_KIND` += `text`, `INDEX_JOB_FAILURE_REASON` += `not_text`, `TEXT_MAX_BYTES = 2 МиБ` |
| `apps/worker/src/text/fetch-text.ts` (новый) | загрузка: форма → robots.txt (кэш по origin'у) → `safeGet` с `fileScope` (хост + robots.txt origin'а КАЖДОГО шага ДО запроса); тип по заголовку, размер, `decodeText` (кодировки, NUL, HTML в начале) |
| `apps/worker/src/text/split-text.ts` (новый) | разделы `#`/`##`, `###` — контекст, блоки кода, ссылки текстом, якоря-slug с резервированием и запомненным суффиксом |
| `apps/worker/src/text/text-processor.ts` (новый) | обработчик задачи: предел разделов по плану, неизменный раздел без эмбеддинга, `page_budget` + примеры, уборка исчезнувших после полного прохода, метаданные файла под фенсом |
| `apps/worker/src/crawl/safe-get.ts` | `inScope` может быть асинхронным (`await`); краулер не меняется |
| `apps/worker/src/run-index-job.ts`, `index.ts` | `processByKind` += `text` (нет обработчика — `internal`), подключение в воркере |
| `packages/db/src/bots.ts`, `index-jobs.ts`, `sources.ts` | создание источника `text` тем же путём, что сайт (`kind`), кабинет читает `text` |
| `apps/web/src/server/cabinet-handler.ts` | тело `{ url, kind? }`, `kind` ∈ `site|text` закрытым набором; адрес — `CheckAddress` ДО записи; якорь `#` снимается |
| `apps/web/src/app/dashboard/CabinetViews.tsx`, `TextSourceAdder.tsx` (новый), `SourceTruncationNotice.tsx`, `lib/source-ribbon.ts` | третий вариант в `AddSource`, тексты отказов файла, «Обновить» для `text`, пометка «Прочитано N разделов файла из M», лента «разделов файла» |
| `apps/web/src/app/dashboard/bots/[botId]/BotScreen.tsx` | только строка `AddSource` (`botId={p.botId}`) |
| `tests/text-source.test.ts`, `tests/text-source.integration.test.ts`, `tests/browser/text-source.test.ts`, `tests/enums.test.ts` | 31 unit + 6 integration + 12 браузерных; enums — 001 + дописанное 015 |
| `scripts/test-text-source-mutations.mjs` (новый) | 9 мутаций |

## Переиспользование

Сторонних проектов (N1–N5) не брали: проверки чужого адреса, robots.txt, фенс, усечение и эмбеддинги уже есть в N6 —
вызваны, не скопированы (`safe-get.ts`, `robots.ts`, `check-address.ts`, `EmbedAndStore`, `writeIndexedPage`,
`pruneUnseenPages`); форма обработчика адаптирована из `pdf-processor.ts` и `site-processor.ts`.

## Соседи

Файлы соседних агентов (`packages/rag/src/small-talk.ts`, блок отметки в `BotScreen.tsx`, `GateBanner.tsx`, verify-handler,
отметка в `bots.ts`, миграция 014) не тронуты; в `bots.ts` правлены только `readBotCabinet` (вид и заголовок источника) и
`createSiteSource`.

Status: completed
