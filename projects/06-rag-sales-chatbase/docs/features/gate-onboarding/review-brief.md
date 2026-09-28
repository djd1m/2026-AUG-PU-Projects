# Постановка независимого ревью: `gate-onboarding` (N6 «Суфлёр»)

Ты — ревьюер другой семьи моделей. Только чтение: ничего не меняй. Рабочий каталог — `projects/06-rag-sales-chatbase`.
Предмет — `git diff bf7ab6d0 HEAD -- .` (без `tests/artifacts/`). Контекст — `docs/features/gate-onboarding/01_plan.md`
(инцидент и критерии AC-1…AC-11) и решение A-N6-066 в конце `docs/decisions-autonomous.md`.

## Суть
Ворота A-N6-035: пока владелец не нажал «Я проверил ответы бота» (`bot.answers_verified_at`), посетитель виджета получает
заглушку «Бот ещё настраивается» без вызова модели. На стенде владелец этого не видел. Исправление: (1) заглушка пишется
в `question_log` исходом `not_verified` (миграция 011), (2) сводка и кабинет считают посетителей с заглушкой за 7 дней,
(3) триггер снятия отметки оставляет пометку `answers_verified_reset_at/_reason`, (4) баннер на экранах установки и бота.

## Главные файлы
`packages/db/migrations/011_gate_onboarding.sql`, `packages/db/src/{bots,summary,answers}.ts`, `packages/rag/src/enums.ts`,
`apps/web/src/server/{widget-ask-handler,widget-ask-deps}.ts`, `apps/web/src/app/dashboard/{GateBanner,InstallViews}.tsx`,
`apps/web/src/app/dashboard/bots/[botId]/{page,BotScreen,BotExtrasViews}.tsx`, `.../install/{page,InstallScreen}.tsx`,
тесты `tests/gate-onboarding.{unit,integration}.test.ts`, `tests/browser/gate-onboarding.test.ts`, `tests/enums.test.ts`.

## Что искать
- 152-ФЗ: может ли текст вопроса попасть в журнал с `not_verified`; кто может писать строки (порядок: дверь → бот →
  CheckOrigin → тело → токен → бейдж → запись). Может ли посторонний раздуть журнал/счётчик дешевле, чем раньше.
- Миграция: безопасна ли замена CHECK и функции триггера на живой БД; совместимость отката приложения без отката схемы.
- Правильность счёта (различные сессии, окно 7 дней, чужой бот), пометка снятия (гонки с `setAnswersVerified`, повторная
  пачка), стирание пометки владельцем.
- Экраны: баннер до кода во всех вариантах, кнопка только при готовом источнике, ошибка отметки не дублируется, данные
  после отметки обновляются.
- Тесты: доказывают ли они заявленное; чего не хватает.

## Формат ответа (строго)
Первая строка — `Оценка: A|B|C|D` (A — замечаний нет; B — только low/medium; C — есть high, исправимо; D — несколько high
или blocker). Далее находки списком: `- [blocker|high|medium|low] путь:строка — что не так — почему важно — как исправить`.
В конце строка `НЕ проверил: …`. Пустой ответ недопустим.
