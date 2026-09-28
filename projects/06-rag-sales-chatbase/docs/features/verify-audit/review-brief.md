# Постановка независимого ревью: `verify-audit` (N6 «Суфлёр»)

Ты — ревьюер другой семьи моделей. Только чтение: ничего не меняй. Рабочий каталог — `projects/06-rag-sales-chatbase`.
Предмет — `git diff 09677f78 71207597 -- .` (без `tests/artifacts/`). Контекст — `docs/features/verify-audit/01_plan.md`
(инцидент, критерии AC-1…AC-12, решение «событие пишет база») и решение A-N6-077 в конце `docs/decisions-autonomous.md`.

## Суть
Отметка «Я проверил ответы бота» (`bot.answers_verified_at`, A-N6-035) открывает посетителям ответы бота. На стенде она
пропала без обхода: кнопка блока была переключателем (`requestVerify(!verified)`), и второе нажатие молча сняло отметку;
журнала не было. Исправление: (1) установка и снятие — разные действия, снятие только через подтверждение
(`VerifyBlock.tsx`, `role="alertdialog"`); (2) маршрут требует `{ confirm: true }` для снятия; (3) журнал
`bot_verification_event` (миграция 014), пишет триггер `AFTER UPDATE OF answers_verified_at` на переходе; (4) `COALESCE` —
повторная установка не сдвигает дату; (5) баннер ворот после отметки из него не исчезает, а сменяется строкой.

## Главные файлы
`packages/db/migrations/014_verify_audit.sql`, `packages/db/src/bots.ts` (`setAnswersVerified`, `readBotCabinet`),
`apps/web/src/server/cabinet-handler.ts` (`createBotVerifyHandler`), `apps/web/src/lib/verify-request.ts`,
`apps/web/src/app/dashboard/bots/[botId]/{VerifyBlock,BotScreen,page}.tsx`, `apps/web/src/app/dashboard/GateBanner.tsx`,
`.../install/InstallScreen.tsx`; тесты `tests/verify-audit.{unit,integration}.test.ts`, `tests/browser/verify-audit.test.ts`
(гидратированный BotScreen), `scripts/test-verify-audit-mutations.mjs`.

## Что искать
- Может ли отметка всё ещё сняться одним случайным действием (двойной клик, Enter, старая вкладка, баннер, экран установки).
- Триггер: пишется ли событие на КАЖДОМ переходе и только на нём; верно ли определяется актёр (владелец / новые материалы) при
  взаимодействии с триггерами 011 (`bot_verified_clears_reset`, `bot_reset_verified_on_chunk`); гонки; откат приложения без
  отката схемы; 152-ФЗ (ПДн в журнале), стирание аккаунта.
- Доступность подтверждения (фокус, Escape, имя/описание, `aria-expanded`), цели ≥ 44.
- Тесты: доказывают ли заявленное, особенно браузерные (двойное нажатие, Escape/«Отмена»); чего не хватает.

## Формат ответа (строго)
Первая строка — `Оценка: A|B|C|D` (A — замечаний нет; B — только low/medium; C — есть high, исправимо; D — несколько high
или blocker). Далее находки списком: `- [blocker|high|medium|low] путь:строка — что не так — почему важно — как исправить`.
В конце строка `НЕ проверил: …`. Пустой ответ недопустим.
