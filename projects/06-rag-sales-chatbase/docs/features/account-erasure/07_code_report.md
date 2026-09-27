# 07 — Отчёт о коде: `account-erasure` (фича 17)

Дата: 2026-09-27 · Исполнитель: Claude Opus 5.5 (один исполнитель, свой worktree) · Основа: `0f7f434a` ·
FR-AUTH-002, NFR-SEC-003 · SC-US-015-1 · ADR-012, ADR-018 · решения **A-N6-054…059**.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| Миграция 010 | `packages/db/migrations/010_account_erasure.sql` | `account.erase_requested_at`, `erase_attempted_at`, очередь `account_erasing_queue`; `attribution.status` += `partner_deleted`; `frozen_reason` += `owner_erased`; `review_reason` += `account_erasing`; `commission_entry.kind` += `forfeit` (знак, без платежа, одна на партнёра); служебная `erasure_audit` (без ПДн) |
| Удаление в БД | `packages/db/src/erasure.ts` (новый), `sources.ts` (`eraseSourceTx`), `commission.ts` (`forfeitCommissionTx`, выплата при `erasing` и перечитывание статуса после замка), `payments.ts` (`account_erasing`), `ops-partners.ts` (CSV `forfeit`), `ops-erasure.ts` (новый), `index.ts` | `readErasurePreview`, `requestErasure` (одна транзакция: аккаунт → фенс задач → боты `deleted` → сессии → приглашения → коды → атрибуции → `erasing`), `eraseAccount` (источники по одному → строки → деньги → надгробие), очередь сторожа, наблюдение просрочки, `listErasingAccounts`, `listOwedPayouts`, `eraseBotQuestionLog` |
| Сторож | `apps/worker/src/erase-accounts.ts` (новый), `index.ts` | `erasureTick` в проходе сторожа: advisory-замок прохода, просрочка ДО попыток, файлы тома ДО строк, сбой — `markErasureAttemptFailed` |
| Маршруты | `apps/web/src/server/account-handler.ts`, `account-runtime.ts`, `erasure-receipt.ts` (новые), `auth.ts` (`DUMMY_HASH`), `app/api/account/route.ts`, `app/api/bots/[botId]/question-log/erase/route.ts` | `DELETE /api/account` (origin → тело `confirm`+`password` → bcrypt вне транзакции → 202 + квитанция, сессия снята); `POST …/question-log/erase` |
| Экраны | `app/dashboard/account/*`, `app/account/erased/*`, `app/dashboard/page.tsx` (ссылка «Удалить аккаунт»), `bots/[botId]/BotExtrasViews.tsx`, `BotScreen.tsx` | последствия до подтверждения, форма с паролем, квитанция трёх состояний и просрочки, стирание журнала бота в два шага |
| Команда | `package.json` (`ops:erasure`) | `list | overdue | owed` |
| Тесты | `tests/account-erasure.{integration,unit}.test.ts`, `tests/browser/account-erasure.test.ts` (новые); `enums.test.ts`, `database.integration.test.ts`; `scripts/test-account-erasure-mutations.mjs` | см. 05_completion |

## Отклонения от плана и почему

- **Виджет — `404`, не `403`** (A-N6-055): прежнее поведение фичи 11 для удалённого бота.
- **`erase_requested_at` без `NOT NULL`** (A-N6-057): ограничение роняло три чужих набора.
- **Долг вместо сгорания** (A-N6-056, ревью H1) — ждёт владельца.
- **`forfeit` пишется в `commission.ts`**, а не в `erasure.ts`: страж фичи 15 разрешает запись `commission_entry` только там.
- **Тихий час проверяет очередь сторожа**, а не `eraseAccount`: прямой вызов стирает сразу (для оператора и тестов).
- **Платежи ссылаются на надгробную строку**, а не `account_id = NULL` (roadmap): ответ владельца 3 — учёт 5 лет.

## Дефекты, пойманные по ходу

- Ревью Codex — 5 находок (08_review.md), все закрыты тестом и мутацией.
- Мутация `finalize-without-payout-lock` выжила при одном конкурентном тесте — добавлен детерминированный.
- Строгий локатор браузерного теста нашёл две ссылки «Войти» (шапка и карточка) — поиск внутри `main`.
- Двойной знак «₽» на экране последствий (`formatRub` уже добавляет знак).

Status: completed
