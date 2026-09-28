# 07 — Отчёт исполнителя: `verify-audit`

Исполнитель — Claude Opus 5.5 (`claude-opus-5-5`), один, в своём worktree (ветка `fix/n6-verify-audit`).

## Что изменено

| Место | Изменение |
|---|---|
| `packages/db/migrations/014_verify_audit.sql` | таблица `bot_verification_event` (закрытые `kind`/`actor`, пара `system ⇔ unset_new_material`, каскад с ботом), индекс `(bot_id, id DESC)`, триггер `AFTER UPDATE OF answers_verified_at` на переходе |
| `packages/db/src/bots.ts` | `setAnswersVerified`: `COALESCE` (повтор не сдвигает дату); `readBotCabinet`: `verified_at`, 5 последних событий по `id DESC` |
| `apps/web/src/server/cabinet-handler.ts` | `verify` принимает `confirm`; снятие без `confirm: true` — `400 confirm_required` |
| `apps/web/src/lib/verify-request.ts` | `requestVerify(botId, true)` (тип — литерал) и `requestUnverify` с `confirm: true` |
| `apps/web/src/app/dashboard/bots/[botId]/VerifyBlock.tsx` (новый) | блок «Ответы на сайте»: отдельные кнопки, `alertdialog` подтверждения, фокус/Escape, строка «стоит с / снята», история `<details>` |
| `BotExtrasViews.tsx` | блок вынесен (реэкспорт) |
| `BotScreen.tsx`, `page.tsx` | `markVerified`/`unmarkVerified` вместо переключателя; журнал в пропсах; `justVerified` баннера. Блок источников/AddSource не тронут |
| `GateBanner.tsx` | после отметки из баннера — строка «Отметка поставлена», а не пустота |
| `install/InstallScreen.tsx` | оптимистическая отметка привязана к серверным данным (ревью кругов 1–2 и узкое) |
| `globals.css` | три правила (`.verify-since`, `.verify-confirm p`, `.verify-history ol`) |
| тесты | `tests/verify-audit.{unit,integration}.test.ts`, `tests/browser/verify-audit.test.ts` (гидратация esbuild, как `billing.test.ts`), служебные списки в `enums`/`database`/`account-erasure`, фикстуры `VerifyBlock` в `bot-cabinet`/`gate-onboarding` браузерных наборах |
| `scripts/test-verify-audit-mutations.mjs` (новый) | 5 мутаций образа + 6 браузерных (`--browser`) |
| документы | A-N6-077, канон §4 (служебная таблица, перечисления, маршрут), BACKLOG §3в (пункт закрыт) |

## Строки переиспользования

Донора нет: отметка A-N6-035 есть только у N6 — **написано заново**. Подтверждение в два шага — тот же паттерн, что «Удалить
источник» (фича 16) и «Стереть журнал» (account-erasure), но с `alertdialog`, фокусом и Escape; гидратация в браузерном тесте —
по образцу `tests/browser/billing.test.ts`.

## Грабли

- `JSON.stringify` пропсов в `<script>` без экранирования `<` рвёт страницу, если в данных есть `</script>` (код установки).
- `now()` в триггере — время НАЧАЛА транзакции: порядок журнала по нему врёт при конкуренции — только `id`.
- Оптимистическое состояние поверх серверного `boolean` залипает на `false → false`; привязка к ссылке объекта пропса
  на момент УСПЕХА, а не нажатия.
