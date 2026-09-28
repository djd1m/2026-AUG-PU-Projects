# 07 — Отчёт исполнителя: `gate-onboarding`

Исполнитель — Claude Opus 5.5 (`claude-opus-5-5`, из метаданных сессии), один, в своём worktree (ветка `fix/n6-gate-onboarding`).
Коммиты: `523d3e9e` (план) → `147b2497` (реализация) → `642f57ae` (круг 1) → `406ca76c` (круг 2) → документы.

## Что изменено

| Место | Изменение |
|---|---|
| `packages/db/migrations/011_gate_onboarding.sql` | CHECK `question_log_outcome_check` + `not_verified`; `bot.answers_verified_reset_at/_reason` (`new_material`), пара; `CHECK bot_verified_or_reset`; `BEFORE`-триггер `bot_verified_clears_reset`; тело `bot_reset_verified_on_chunk` ставит пометку |
| `packages/rag/src/enums.ts` | `QUESTION_OUTCOME` + `not_verified` |
| `packages/db/src/answers.ts` | `recordQuestion` принимает `not_verified` (текст по-прежнему только у `unknown`) |
| `packages/db/src/summary.ts` | `not_verified_visitors` — различные сессии за 7 дней |
| `packages/db/src/bots.ts` | `readBotCabinet.verified_reset`, `stub_visitors_7d`; `setAnswersVerified` стирает пометку |
| `apps/web/src/server/widget-ask-handler.ts`, `widget-ask-deps.ts` | `logNotVerified` после токена и бейджа; вопрос разбирается `parseVisitorRequest` до записи |
| `apps/web/src/app/dashboard/GateBanner.tsx` (новый) | баннер ворот, склонение «посетитель» |
| `InstallViews.tsx`, `install/{page,InstallScreen}.tsx` | баннер ДО кода во всех трёх вариантах; отметка из баннера |
| `bots/[botId]/{page,BotScreen,BotExtrasViews}.tsx`, `globals.css` | баннер первым после заголовка; строка заглушек в сводке; ошибка отметки — у нажатого блока |
| `apps/web/src/lib/verify-request.ts` (новый) | общий `requestVerify` для двух экранов |
| тесты | `tests/gate-onboarding.{unit,integration}.test.ts`, `tests/browser/gate-onboarding.test.ts`, `tests/enums.test.ts` (исход — по последнему CHECK миграций), фикстуры сводки и `logNotVerified` в соседних наборах; сырые `UPDATE … answers_verified_at` в `visitor-ask`/`source-lifecycle` теперь повторяют действие владельца |
| `scripts/test-gate-onboarding-mutations.mjs` (новый) | 8 мутаций |
| документы | канон §4 (исход и причина), A-N6-066, `CLAUDE.md` (следующее решение — A-N6-067) |

## Строки переиспользования

Донора нет: ворота A-N6-035 есть только у N6 — **написано заново** (баннер — на токенах и классах `notice`/`danger-notice`
N6, запрос — прежний `POST /api/bots/{id}/verify`).

## Грабли

- `readSessionCookie` принимает только 43 символа base64url: тест с `randomUUID()` в cookie получал 404 (не 401) — сессия
  отбрасывается молча.
- Жёсткий CHECK инварианта без `BEFORE`-триггера ломал бы откат приложения (прежний SQL знает одну колонку) — найдено
  ревью круга 2.
