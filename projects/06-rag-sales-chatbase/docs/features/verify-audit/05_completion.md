# 05 — Квитанция: `verify-audit` (снятие отметки «проверено» только с подтверждением; журнал отметки)

Дата: 2026-09-28 · Основа: `09677f78` · Код: `bf51cb75` · Решение: **A-N6-077** (опирается на A-N6-035, A-N6-036, A-N6-066) ·
план: [`01_plan.md`](01_plan.md) · валидация: [`02_validation.md`](02_validation.md) · ревью: [`08_review.md`](08_review.md).

## Профиль и модели

Тир **L** (`complexity-router.sh` → код 1: «миграция схемы»). Код — Claude Opus 5.5 (`claude-opus-5-5`), один исполнитель в
своём worktree (ветка `fix/n6-verify-audit`). Ревью — Codex `gpt-6-astra`, усилие medium (подтверждено строками журнала),
три вызова: 59 611 + 59 505 + 49 290 токенов. Телеметрия p-replicator — пишет координатор; счётчики токенов и времени самого
исполнителя — `null` (изнутри агента недоступны).

## Коммиты

`0baf9602` план → `71207597` реализация → `9e28f6d2` документы и мутационный скрипт → `04aa1d84` круг 1 → `b93fac9d` круг 2 →
`bf51cb75` находка узкого ревью → документы.

## Проверки (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| lint + typecheck | `npm run lint` в образе; `npm run typecheck` и `tsc -p tests/tsconfig.json` в контейнере Playwright | `Статические правила: ошибок нет`; typecheck 0 |
| все наборы в образе, Postgres 16 + pgvector 0.8.6, Redis 7.4, на `b93fac9d` | `docker compose -p n6-test-verify -f compose.test.yml --project-directory . --env-file <scratchpad>/n6-test.env run --rm --build test sh -c 'npm run lint && node scripts/test-db.mjs && npm test -- --run && node scripts/test-verify-audit-mutations.mjs'`, затем `down -v` | `Test Files  64 passed (64)` · `Tests  1108 passed (1108)` · `exit=0` — [`image-run.txt`](../../../tests/artifacts/verify-audit/image-run.txt) |
| браузер: все наборы, Chromium + WebKit, на `bf51cb75` | `node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts tests/browser` в `mcr.microsoft.com/playwright:v1.60.0-noble` (бандл виджета собран `node apps/widget/scripts/build.mjs`) | `Test Files  12 passed (12)` · `Tests  703 passed (703)` — [`browser-run.txt`](../../../tests/artifacts/verify-audit/browser-run.txt) |

Прогон в образе — на `b93fac9d`; `bf51cb75` меняет только клиентский `InstallScreen.tsx`, браузерный тест и скрипт мутаций —
покрыт браузерным прогоном. Первый прогон образа на `71207597` дал 1 красный (неверный ожидаемый CHECK в новом тесте —
исправлено) и тайм-аут хука `tests/config.test.ts` под нагрузкой машины; на `b93fac9d` оба зелёные.

## Стражи, испытанные мутацией (дефект → красный; восстановлено → зелёный)

В образе (`scripts/test-verify-audit-mutations.mjs`; наборы verify-audit unit/integration, gate-onboarding integration, bot-cabinet unit):

```
server-no-confirm: дефект возвращён → 2 failed | 41 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
event-not-written: дефект возвращён → 6 failed | 37 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
system-as-owner: дефект возвращён → 1 failed | 42 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
set-moves-date: дефект возвращён → 1 failed | 42 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
events-by-time: дефект возвращён → 1 failed | 42 passed (43) (код 1); код восстановлен → 43 passed (43) (код 0)
```

В браузере (`node scripts/test-verify-audit-mutations.mjs --browser`, `tests/browser/verify-audit.test.ts`, на `bf51cb75`):

```
no-confirmation: дефект возвращён → 12 failed | 18 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
toggle-returns: дефект возвращён → 16 failed | 14 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
escape-ignored: дефект возвращён → 2 failed | 28 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
banner-vanishes: дефект возвращён → 8 failed | 22 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
install-sticky: дефект возвращён → 4 failed | 26 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
install-closure-gate: дефект возвращён → 2 failed | 28 passed (30) (код 1); код восстановлен → 30 passed (30) (код 0)
```

## Что доказано и чем

- **AC-1/3 (механизм инцидента):** двойное нажатие «Я проверил ответы бота» (блок и баннер) в ГИДРАТИРОВАННОМ `BotScreen` не
  шлёт ни одного `verified: false`; нажатие во время запроса — один запрос; `requestVerify` принимает только литерал `true` —
  браузер + unit + страж по исходнику.
- **AC-2/4/5:** «Снять отметку» ничего не отправляет, раскрывает `alertdialog` с текстом-предупреждением, фокус на «Отмена»;
  Escape и «Отмена» закрывают без запроса, фокус возвращается; снятие — один запрос `{ verified: false, confirm: true }`; axe AA,
  R1/R2/R5/R8 в обеих темах, цели ≥ 44 на 320/768/1440 — браузер. Заодно закрыт принятый остаток gate-onboarding («клик по
  отметке в гидратированном экране не проверялся»).
- **AC-6:** маршрут без `confirm: true` — `400 confirm_required`, отметка и журнал не меняются — unit + integration.
- **AC-7/8/10:** события на переходе в той же транзакции (откат — без события), актёр по пометке 011, SQL прежнего приложения
  журналируется, повтор без перехода — не событие и не сдвигает «стоит с», пачка фрагментов — одно событие, дата события =
  дата пометки баннера, порядок по переходам при инверсии времени начала транзакций — integration.
- **AC-9/11:** строка «снята когда и кем», история раскрытием; баннер после отметки сменяется строкой; экран установки следует
  серверу при снятии (и `false → false`, и смена данных во время POST) — браузер.
- Стирание аккаунта уносит события каскадом — `tests/account-erasure.integration.test.ts`; служебные списки таблиц обновлены.

## Что НЕ доказано

- Миграция 014 на БД стенда не применялась; прогоны — на пустых схемах теста. История снятий ДО выкладки не восстанавливается:
  инцидент 13:39–13:46 остаётся объяснённым только рассуждением (единственный путь без фрагмента — владелец).
- Поведение `router.refresh()` Next 15 («новый объект пропса при каждом обновлении») — по документации и ревьюеру, не прогоном
  настоящего Next; в тесте refresh эмулирован обёрткой.
- Правка `bf51cb75` (находка узкого ревью) повторным ревью не проверялась — принятый остаток.
- Выложено 28.09 17:32 UTC (A-N6-081): миграция 014 применена `migrate`; первая запись журнала на стенде — `17:32:53 unset_new_material system` (отметка бота aicoding.space снята 31 разделом `llms-full.txt`), `answers_verified_reset_reason = new_material` — даты совпали. Прибор адаптивности по выданному адресу — см. запись A-N6-081.

## При выкладке

1. Миграция **014** (`migrate` применяет сама). Номер 014 — этой правки; **015** занят параллельной правкой llms-full.txt —
   сливать в порядке номеров. Миграция добавляющая: откат приложения без отката схемы безопасен (прежний SQL проходит, события
   пишутся триггером).
2. Новых переменных окружения нет; `compose` не менялся.
3. Совместимость: вкладка кабинета со старым бандлом после выкладки НЕ сможет снять отметку (сервер ответит «Снять отметку можно
   только после подтверждения…») — ставить может; владельцу — обновить страницу.
4. Точки слияния с соседями: `tests/enums.test.ts`, `tests/database.integration.test.ts`, `tests/account-erasure.integration.test.ts`
   (списки служебных таблиц), `docs/canon.md` §4 (число таблиц 31 + `_schema_migration`), `docs/decisions-autonomous.md`
   (A-N6-077), `globals.css`. В `BotScreen.tsx` блок источников/AddSource не тронут.
