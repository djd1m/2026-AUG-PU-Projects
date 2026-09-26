# preview-flow — отчёт о коде

**Фича:** 9 `preview-flow` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (автономный режим, один исполнитель) ·
**Решения:** A-N6-032 · **Квитанция:** [`05_completion.md`](05_completion.md).

Собрано из готового: CheckAddress (crawler), задача индексации и `readIndexJob` (index-job-core), бюджет эмбеддингов
предпросмотра (chunk-embed), ядро `answerQuestion` + `chargeAnswerQuota(mode 'preview')` + `searchChunks` +
`recordQuestion` (rag-answer), квота и `previewCreateCharges` (quota-and-spend), сторож черновиков 24 ч (index-job-core),
токены и классы оформления (design-shell). Нового SQL поиска, квоты и промпта нет.

## Файлы

| Файл | Что | Трассировка |
|---|---|---|
| `packages/db/migrations/002_preview_flow.sql` (новый) | `preview.idempotency_key` + уникальный частичный индекс `(browser_session, idempotency_key)`; `preview.history jsonb` с CHECK «массив ≤ 2»; индекс `preview(bot_id)`. Только добавляющая | A-N6-032 (3), (4) |
| `packages/db/src/previews.ts` (новый) | `createPreview` (квота 3 scope по часам БД → бот `draft` без аккаунта → `createSourceJobTx` с бюджетом 20/40 000 → строка `preview` на 24 ч — одна транзакция), `findPreviewRepeat` (повтор → та же задача, токен перевыпущен), `readPreviewAccess` (токен И задача этого бота), `readPreviewBotByToken`, `appendPreviewTurn` (атомарно, ≤ 2), `recordShareCtaShown` (один раз на бота), `readPreviewSite` + `suggestQuestions` (макет и подсказки без модели), `claimPreview` (блокировка аккаунта → строка предпросмотра `FOR UPDATE` → различение 409/404/истёк → предел плана → одноразовый `UPDATE … WHERE claimed_at IS NULL AND expires_at > now()` → бот `active`), `previewAnswersUsed` | CreatePreview, ClaimPreview, ReadIndexJob п.1, FR-GROWTH-001 |
| `packages/rag/src/check-address.ts` (перенесён) | CheckAddress без изменений логики; подпуть `@n6/rag/check-address` | ADR-010, A-N6-032 (5) |
| `apps/worker/src/crawl/check-address.ts` | реэкспорт из `@n6/rag/check-address` | — |
| `packages/rag/src/constants.ts` | `BOTS_BY_PLAN` (1/1/10, канон §7 «Планы»), `PREVIEW_TTL_HOURS = 24` | ClaimPreview п.3 |
| `apps/web/src/server/preview-session.ts` (новый) | cookie `__Host-n6_browser` (30 дн.) и `__Host-n6_preview` (24 ч, HttpOnly, Secure, SameSite=Lax), HMAC с назначением, нормализация адреса (`example.ru` → `https://`), тело JSON с потолком по принятым байтам | FR-PREVIEW-001 |
| `apps/web/src/server/preview-handler.ts` (новый) | четыре обработчика и `createRegistrationClaim`; порядок операций — в шапке файла | Pseudocode «API Contracts» |
| `apps/web/src/server/preview-deps.ts` (новый) | боевая связка: SQL, ядро ответа с квотой `:answers` сессии ИЗ СТРОКИ предпросмотра, CheckAddress с резолвером | — |
| `apps/web/src/server/preview-runtime.ts` (новый) | зависимости один раз на процесс | — |
| `apps/web/src/app/api/preview/**/route.ts` (4 новых) | `POST /api/preview`, `GET /api/preview/{index_job_id}`, `POST …/ask`, `POST …/claim` | канон §5 (сегмент — A-N6-032 (1)) |
| `apps/web/src/app/api/index-jobs/[id]/route.ts`, `server/index-job-handler.ts` | `resolvePreviewBot` читает cookie предпросмотра (было `null`) | ReadIndexJob п.1, carry_over index-job-core |
| `apps/web/src/server/auth-handler.ts`, `server/route.ts` | ClaimPreview при регистрации и входе; несколько `Set-Cookie`; сбой claim вход не валит | AuthRegisterAndLogin п.5, SC-US-003-2 |
| `apps/web/src/app/preview/PreviewViews.tsx` (новый) | разметка без состояния: прогресс (`role=progressbar`, «k из ≤ 20»), «нет ответа», отказ с причиной канона §4, чат с макетом, развёрнутой цитатой, CTA под первым answered, бейджем «Работает на Суфлёре» | FR-PREVIEW-001, FR-WIDGET-004, FR-GROWTH-001, ADR-007 |
| `apps/web/src/app/preview/PreviewStart.tsx`, `preview/page.tsx` (новые) | цель формы лендинга `/preview?url=`: автозапуск один раз, `Idempotency-Key` в sessionStorage на пару (вкладка, адрес) | SC-US-001-1 |
| `apps/web/src/app/preview/[jobId]/{page,PreviewScreen}.tsx` (новые) | экран `/preview/{index_job_id}`: опрос раз в 2 с до конечного состояния, вопросы, «Сохранить» (claim или регистрация) | long-job-contract |
| `apps/web/src/app/login/AuthForm.tsx`, `dashboard/page.tsx` | итог сохранения предпросмотра в кабинете (сохранён / истёк / предел плана / недоступно) | SC-US-003-1/2 |
| `apps/web/src/app/globals.css` | классы предпросмотра, только токены двух тем (страж `theme.test.ts` зелёный) | FR-LOOK-008…010, 014 |
| `scripts/responsive/rules.mjs` | R9 для `/preview/{id}`: `#preview-question` в первом экране | FR-GROWTH-001 |
| `vitest.config.ts` | псевдонимы массивом: подпуть `@n6/rag/check-address` | — |
| `scripts/test-crawler-mutations.mjs` | мутации CheckAddress перенацелены на `packages/rag/src/check-address.ts` | — |
| `scripts/test-preview-flow-mutations.mjs` (новый) | 4 мутации стражей фичи | testing.md «Стражи» |
| `tests/preview-flow.integration.test.ts` (новый, 14) | Postgres + pgvector, боевая связка | см. квитанцию |
| `tests/preview-flow.unit.test.ts` (новый, 11) | порядок операций на фейках, чистые функции | — |
| `tests/browser/preview-flow.test.ts` (новый, 64) | прибор адаптивности: 6 состояний × 2 темы × 2 движка, R9, ширины 320…1440 | — |

## Проверки

| Проверка | Итог |
|---|---|
| `npm run typecheck` | 0 |
| `npm run lint` | «Статические правила: ошибок нет» |
| `npm run build` | 0 (маршруты `/api/preview*`, `/preview`, `/preview/[jobId]` в выводе next build) |
| Прогон в образе (`tests/artifacts/preview-flow/image-run.txt`) | **731/731**, 34 файла, код 0 |
| Мутации preview-flow в образе (`tests/artifacts/preview-flow/mutations-run.txt`) | 4/4 пойманы, восстановление зелёное, `exit=0` |
| Регресс мутаций краулера (`tests/artifacts/preview-flow/regression-crawler-mutations.txt`) | 9/9, `exit=0` |
| `bash scripts/check-responsive.sh --test` (`tests/artifacts/preview-flow/browser-run.txt`) | **194/194** (3 набора: design-shell, responsive-check, preview-flow), `exit=0` |
| `check-model-cost.cjs` | 0 |
| `check-job-contract.cjs` | 2 — НЕ ВЫПОЛНЕНА, `not-deployed` (как и до фичи: стенда нет) |

Status: completed
