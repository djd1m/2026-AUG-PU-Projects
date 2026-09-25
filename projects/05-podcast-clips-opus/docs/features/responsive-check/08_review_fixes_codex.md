# responsive-check — правки после REVIEW (Anthropic: APPROVE WITH FIXES)

Координатор: lockfile обновлён, зависимости стоят; браузерные тесты в контейнере 22/22; основной набор
в образе 795/795 (браузерные не попали); базовая линия снята (`.responsive-artifacts/baseline/`).

1. **[high] `scripts/seed-ui-fixture.mjs:98-108` — при продолжении создаётся НОВЫЙ гостевой пакет.**
   Если `prior?.guest_pack_id && prior?.screens?.guest` — не звать `guest.create`/`guest.send`; иначе
   сразу после `guest.create` → `save({ guest_pack_id })`, после `guest.send` → `save({ screens: { guest } })`;
   итоговую фикстуру собирать из сохранённого прогресса. Тест: второй успешный прогон НЕ вызывает
   `guest.create`.
2. **[high] `scripts/responsive/rules.mjs:160-164` (`visible`) — все 328 предупреждений R3 ЛОЖНЫЕ:**
   кнопки внутри ЗАКРЫТОГО `<details>` (`ClipMusicChoice.tsx:32`) скрыты `::details-content`, но
   `getBoundingClientRect` даёт размер. Первым шагом —
   `el.checkVisibility?.({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })`;
   запасной путь — исключать потомков `details:not([open])` вне их `summary`. Фикстура в
   `tests/browser`: кнопка в закрытом details → R2/R3/R5 пусты; в открытом — проверяется.
3. **[medium] `rules.mjs:180`** — `[tabindex]` → `[tabindex]:not([tabindex="-1"])`.
4. **[low] `rules.mjs:243`** — R8 только в сценарии `width-390` (сейчас дублируется на WebKit с iPhone 13).
5. **[low] `check-responsive.sh`** — опция сети (`DOCKER_NETWORK`, например `host` для локального стенда)
   и `--user "$(id -u):$(id -g)"`, если образ позволяет (иначе записать, почему нет); убрать
   бесполезный на запуске `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, в отчёте назвать, что для сборки образов
   его нужно ставить в `Dockerfile` (это внесёт координатор).

Прогон: `npx vitest run tests/responsive-check.test.ts`; браузерные тесты координатор прогонит в
контейнере. Не коммить. Раздел «Правки после REVIEW» в `07_code_report.md`; последняя строка —
`Status: completed` либо `Status: failed` (сеть npm и Docker недоступны — не повод для `failed`).
