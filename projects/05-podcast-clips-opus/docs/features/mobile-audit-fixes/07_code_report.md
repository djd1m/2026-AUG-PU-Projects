# mobile-audit-fixes — отчёт реализации

Выполнены изменения A–H и R9 с приоритетом всех 12 обязательных поправок `01_validate.md`.
Код реализован; браузерная и контейнерная приёмка **не подтверждена** из-за ограничений окружения.
Статус в конце относится к полному набору обязательных проверок, а не только к наличию изменений.

## Изменения A–H и R9

Пути ниже относительно проекта.

| Пункт | Изменение | Файл:строка |
|---|---|---|
| A | Шрифты/отступы в rem, body 1rem; заголовки `clamp(2rem,1.9rem + .4vw,…)`, перенос длинных слов, svh без 100vh; токены поверхностей, отступов и опасного действия | `apps/web/src/app/globals.css:1`, `:15`, `:80` |
| A | SSR body 1.125rem; rem/clamp, переносы, ограничение видео 70svh | `apps/web/src/server/short-link-handler.ts:24`, `apps/web/src/server/guest-page.ts:21` |
| B1 | Шапка и ссылка назад ≥2.75rem; ссылки SSR, включая footer и показываемую interest-login | `apps/web/src/app/globals.css:83`, `apps/web/src/server/short-link-handler.ts:31`, `apps/web/src/server/guest-page.ts:29` |
| B2–B3 | Select на ширину карточки, appearance:none в обоих движках, собственная SVG-стрелка, высота ≥2.75rem; summary и кнопки прослушивания ≥44px | `apps/web/src/app/globals.css:105` |
| B4 | Всё правило текстового input исключает checkbox/radio/file; .check — flex-строка ≥2.75rem; чекбокс 1.25rem. Удалены конфликтующие инлайн-стили гостевой формы | `apps/web/src/app/globals.css:12`, `:103`; `apps/web/src/app/clips/GuestPacks.tsx:36`; `apps/web/src/app/upload/Uploader.tsx:54`; `apps/web/src/app/dashboard/AccountDeletion.tsx:40` |
| C | `font:inherit` перед `font-size:max(1rem,16px)` в одном блоке input/select/textarea | `apps/web/src/app/globals.css:6` |
| D | `--muted:#56615a`, в том числе на фоне upload-panel #eaf0df; small.muted сохранён | `apps/web/src/app/globals.css:1` |
| E1 | DOM: короткий заголовок ценности → форма → пояснение; мобильная сетка в одну колонку | `apps/web/src/app/page.tsx:4`, `apps/web/src/app/globals.css:88` |
| E2 | DOM: заголовок → .cta → пояснение → превью; основной CTA выше картинки без JS | `apps/web/src/server/short-link-handler.ts:40` |
| F | Загрузка перед компактными лимитами; на записи лимиты после VideoDetail; интервалы между секциями; danger после disabled в JSX | `apps/web/src/app/dashboard/page.tsx:19`; `apps/web/src/app/dashboard/videos/[videoId]/page.tsx:16`; `apps/web/src/app/dashboard/LimitsPanel.tsx:14`; `apps/web/src/app/globals.css:87`, `:108`; `apps/web/src/app/dashboard/AccountDeletion.tsx:41` |
| G | pluralRu и согласование ваш/ваши; имя остаётся через escapeHtml. Проверены также JSX и шаблонные строки: остальные числовые подписи — сокращения или не требуют склонения | `apps/web/src/lib/plural-ru.ts:2`, `apps/web/src/server/guest-page.ts:35`, `tests/plural-ru.test.ts:3` |
| H | viewportFit cover, safe-area по краям, reduced-motion; аналогично в SSR | `apps/web/src/app/layout.tsx:4`; `apps/web/src/app/globals.css:82`, `:86`, `:126`, `:130`; `apps/web/src/server/short-link-handler.ts:23`, `:32`; `apps/web/src/server/guest-page.ts:19`, `:30` |
| R9 | Константы размеров/маршрутов, первый видимый элемент, disabled не исключается, отсутствие действия — error; rect/scrollY/innerHeight в находке | `scripts/responsive/rules.mjs:148` |
| R9 | Отдельные 3×2 mobile/touch сценария, только R9 после navigate/preconditions до скриншота; fullPage:false; старые scenarios/widths/R1–R8 не изменены | `scripts/check-responsive.mjs:86` |
| R9 tests | Маршруты/размеры; below/above/missing при 390×844 и 360×740 в обоих движках; видимость, fallback, disabled, отрицательный top; три HTML-фикстуры | `tests/responsive-check.test.ts:141`; `tests/browser/responsive-check.test.ts:35`; `tests/fixtures/responsive/r9-{below,above,missing}.html:1` |

## Сверка с error-находками базовой линии

| Правило / маршрут / селектор | Место исправления |
|---|---|
| R2 / приложение / nav > a:1, nav > a:2 | `apps/web/src/app/globals.css:83` |
| R2 / запись / main > header > a | `apps/web/src/app/globals.css:83` |
| R2 / запись / details > summary, label > select | `apps/web/src/app/globals.css:105` |
| R2 / запись / чекбокс гостя | `apps/web/src/app/clips/GuestPacks.tsx:36`, `apps/web/src/app/globals.css:103` |
| R2 /g/ / main > a, footer > a | `apps/web/src/server/guest-page.ts:29` |
| R4 /dashboard / .upload-controls p.muted, small.muted | `apps/web/src/app/globals.css:1` |
| R5 / / поля form.auth-card; запись / select | `apps/web/src/app/globals.css:6` |
| R8 /, /c/, /g/ / body,h1,p,label | `apps/web/src/app/globals.css:3`, `:15`, `:81`; SSR CSS в таблице A |

## Проверки 1–3 из постановки

1. `docker compose --project-directory . --env-file /tmp/n5-test.env --profile test run --rm --build test` — НЕ ВЫПОЛНЕНО. Дословный вывод:

```text
unable to get image 'minio/minio:RELEASE.2025-04-22T22-12-26Z': permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

2. `npm run test:responsive` — НЕ ВЫПОЛНЕНО. Дословный вывод:

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

Дополнительный запуск установленного Playwright напрямую, `node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts`, также не выполнил тесты:

```text
Error: НЕ ВЫПОЛНЕНО: Error: Браузер chromium недоступен
 Test Files  1 failed (1)
      Tests  44 skipped (44)
```

Диагностика запуска Chromium: `sandbox_host_linux.cc:41`, `shutdown: Operation not permitted (1)`.
**R2 для select именно в WebKit не измерен.** CSS-исправление внесено, но результата браузерной проверки нет.

3. Обе мутации внесены по очереди и гарантированно восстановлены (`finally`, сравнение исходных байтов).
Каждый запуск — `node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts -t '<имя>'`.

| Вариант | Фильтр | Итог |
|---|---|---|
| Удалено `rect.bottom <= innerHeight` | `R9 below` | exit 1 до теста: браузер недоступен; мутация НЕ доказана |
| «Действие не найдено» заменено на `return []` | `R9 missing` | exit 1 до теста: браузер недоступен; мутация НЕ доказана |
| Обе ветки восстановлены | `R9` | exit 1 до теста: браузер недоступен; зелёный результат НЕ получен |

Дословные итоговые строки **каждого из трёх запусков**:

```text
 Test Files  1 failed (1)
      Tests  44 skipped (44)
```

Это инфраструктурный отказ, **не** требуемое доказательство «красный на мутации → зелёный после восстановления».

## Дополнительные проверки

Точечный набор: plural-ru, responsive-check, limits, retention, short-link, guest-pack, clip-music-choice, pack-shot-uploader:

```text
 Test Files  8 passed (8)
      Tests  95 passed (95)
```

- `npm run typecheck` — exit 0.
- `npm run lint` — `Статические правила: ошибок нет`.
- `lintCSS` — `[]` для globals.css и обоих SSR-файлов, R7 отсутствует.
- `git diff --check` — exit 0.
- Сравнение CSP с исходной ревизией — обе строки идентичны побайтно.
- Независимое read-only ревью: конкретных дефектов не найдено; runtime-ограничения подтверждены как пробел доказательств.
- `check-env-wiring.sh` — `Проверка НЕ ВЫПОЛНЕНА: compose config недоступен (окружение, права или конфигурация)`.
- Проверка портов вызвана до контейнерных команд; compose config не прочитан, это не успешная проверка.

`npm test` (локально, exit 0) — частичный прогон, НЕ полный зелёный результат. Дословно:

```text
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  619ms (transform 103ms, setup 0ms, collect 108ms, tests 232ms, environment 0ms, prepare 90ms)
WARNING: ПРОПУЩЕНО 172 тестов; отсутствуют DATABASE_URL, REDIS_URL, S3_ENDPOINT. Это НЕ успешная полная проверка.
 Test Files  78 passed | 21 skipped (99)
      Tests  637 passed | 172 skipped (809)
   Duration  224.30s (transform 2.45s, setup 0ms, collect 16.85s, tests 183.02s, environment 24ms, prepare 8.89s)
```

В том числе есть пропуск медиа-проверки; перечисление пропусков сохранено в исходном выводе запуска.
Финальный `npm run build` после последних CSS-правок — exit 0:

```text
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
BUILD_EXIT=0
```

## Что не выполнено

Не подтверждены контейнерный набор, браузерные проверки, две мутации R9 и восстановленный зелёный запуск.
Не получены скриншоты и геометрия приложения в WebKit/Chromium: sandbox не позволяет запуск браузера.
Прибор против стенда и CJM после выкатки выполняет координатор согласно постановке; выкатка не выполнялась.
Следующий проверяемый шаг: в окружении с Docker выполнить проверки 1–3, затем после выкатки — прибор по всей матрице.

Тёмная тема, новая карточка, демо-лендинг, стадии, БД, tRPC, воркеры, compose, package/lockfile и вендорная .claude не изменены.
Историческая базовая линия не исправлялась: по валидации это задача координатора.

## Телеметрия

RUN_ID: `20260925T111524Z-mobile-audit-fixes-codex`. Профиль: `compact-quality-first-v2`; substantive tier M (скрипт дал нижнюю границу S).
PLAN/VALIDATE — переданные постановка и валидация; отдельный агент выполнил read-only REVIEW.
Координатор: текущая сессия Codex/GPT-6; точный actual model/effort хостом не предоставлен, в телеметрии `null`.
Ревью: requested `gpt-5.6-sol`, effort `high`; точные actual metadata также не предоставлены.
Fallback моделей не выполнялся; локальный запуск тестов вместо Docker отмечен отдельно, не подменяет контейнерный.

Измерено от создания записи до завершения: **559.1 с**. Первоначальное чтение инструкций началось раньше записи;
его длительность неизвестна и не восстановлена по памяти. Active time, токены и стоимость — `null`;
экономия пока не установлена. Профиль не является доказательством фактической смены модели.

Телеметрия: `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/run.json`, журнал: `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/events.jsonl`.
Исходная ревизия: `b6c4a0940c6408bfc9f5fb6dd4b60783bc5aba3a`. Изменения не закоммичены.
Хеш снимка исходников: `a50fd7a039aadcd2f9473bebcefa6b4868633a24ddeaddccef8530ff4248d680`; пофайловые SHA-256 и SHA diff — в `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/evidence/source-manifest.json`.
Результаты/ограничения и ревью — в `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/evidence/`.

Status: failed

## Второй круг

Выполнен по `08_review_fixes_codex.md` и ревью Anthropic `08_review.md`.
Изменены только четыре файла исходников; изменения первого круга и координатора сохранены.

| № | Что сделано | Файл:строка |
|---|---|---|
| 1 / M1 | Достижимые размеры: общий h1 — `clamp(2rem,3.75vw,3.375rem)`, лендинг — `clamp(2rem,4.2vw,3.875rem)`, SSR — `clamp(2rem,4vw,2.75rem)` и `clamp(2rem,4vw,2.625rem)` | `apps/web/src/app/globals.css:15`, `:23`; `apps/web/src/server/short-link-handler.ts:27`; `apps/web/src/server/guest-page.ts:22` |
| 2 / M2 | На ≥600 px единая `.landing-message` содержит надстрочник, заголовок и пояснение. Одна строка сетки, `align-items:center`; форма больше не растягивает две строки текста. На телефоне `display:contents` и `order` оставляют форму перед пояснением | `apps/web/src/app/page.tsx:4`; `apps/web/src/app/globals.css:90`, `:121` |
| 3 | Восстановлены исходные надстрочник и заголовок с «больше зрителей.» и двумя br. Между частями добавлены пробелы, чтобы при скрытых br слова не склеивались. До 600 px CSS скрывает надстрочник и br | `apps/web/src/app/page.tsx:4`; `apps/web/src/app/globals.css:91`, `:123` |
| 4 | `hyphens:auto` удалён; у заголовков, текста, кнопок, ссылок и полей `hyphens:none; overflow-wrap:anywhere` | `apps/web/src/app/globals.css:80`; `apps/web/src/server/short-link-handler.ts:31`; `apps/web/src/server/guest-page.ts:29` |
| 5 / L2 | `select:disabled` получает opacity .55 и cursor not-allowed; рамки текстовых input и select используют `--muted:#56615a` | `apps/web/src/app/globals.css:8`, `:12`, `:108` |
| 6 / L3–L4 | На ≥600 px контейнер и шапка имеют одинаковые края. `--nav-h` используется шапкой и вычитанием в min-height лендинга, учитывает safe-area сверху и рамку | `apps/web/src/app/globals.css:1`, `:81`, `:87`, `:118` |
| 7 / L6 | Все существующие токены объединены в единственном `:root` | `apps/web/src/app/globals.css:1` |
| 8 / L7 | max-height у `.clip-preview` и его video ограничен шириной <600 px; на десктопе возвращён исходный aspect-ratio 9:16 без потолка 520 px | `apps/web/src/app/globals.css:97` |

### Расчёт R8 и геометрии

При стандартном корне 16 px минимум `2rem = 32px`, при `html{font-size:200%}` — 64 px.

| Формула | Предпочтительное при 390 px | 100% → 200% | Отношение | На 1440 px при 100% | Ширина достижения максимума |
|---|---:|---:|---:|---:|---:|
| общий h1, 3.75vw / max 3.375rem | 14,625 px < 32 | 32 → 64 px | 2,0 | 54 px | 1440 px |
| лендинг, 4.2vw / max 3.875rem | 16,38 px < 32 | 32 → 64 px | 2,0 | 60,48 px | ≈1476,2 px |
| `/c/`, 4vw / max 2.75rem | 15,6 px < 32 | 32 → 64 px | 2,0 | 44 px | 1100 px |
| `/g/`, 4vw / max 2.625rem | 15,6 px < 32 | 32 → 64 px | 2,0 | 42 px | 1050 px |

В каждом случае на 390 px срабатывает rem-минимум в обоих режимах, R8 ≥1,8 по формуле.
Другие размеры текста в rem и поля `max(1rem,16px)` также масштабируются вдвое.
Горизонтальный скролл при 200% **не измерен**: отсутствие hyphens компенсируется
`overflow-wrap:anywhere`, но это CSS-механизм, а не доказательство браузерного результата.

Контраст рамки #56615a по относительной яркости sRGB: к #fff **6,455:1**, к #f7f8f3
**6,048:1**, к #eaf0df **5,542:1**. Отключённые элементы намеренно ослаблены opacity.

При 16 px и нулевом safe-area высота шапки = 44 + 16 + 16 + 1 = **77 px**;
`--nav-h = 3.8125rem + max(1rem, safe-area-inset-top)` даёт те же 77 px.
На 1440 px левый край шапки `(1440−1180)/2 = 130 px`; у контейнера
`(1440−1228)/2 + 24 = 130 px`. Min-height лендинга при 900 px равен 823 px,
вместе с шапкой — 900 px. Это расчёт для обычного масштаба и однострочной шапки;
переносы при увеличенном тексте могут закономерно увеличить высоту документа.

R9: восстановленный заголовок на мобильном не имеет принудительных переносов, надстрочник скрыт,
пояснение стоит после формы. Проверку полного rect кнопки «Войти →» при 375×667 и 360×740,
а также R8 scrollWidth и скриншот 1440×900 выполняет координатор. Числа rect здесь не выдумывались.

### Проверки второго круга и передача

- `npm run typecheck` — завершён без ошибок.
- `npm run lint` — exit 0, «Статические правила: ошибок нет».
- `npm run build` — exit 0, все workspace собраны.
- `npm test` — exit 0: **637 passed, 172 skipped**, 78 файлов passed / 21 skipped;
  длительность набора **225,43 с**. Пропуски инфраструктурных и одной медиа-проверки
  перечислены в журнале. Это частичный локальный прогон, не полный контейнерный зелёный.
- `lintCSS` для globals.css и обоих SSR — `[]`; `git diff --check` — exit 0.
- CSP обеих SSR-страниц побайтно совпадает с HEAD.

Docker, браузеры, мутации и прибор по стенду не запускались: постановка второго круга
явно передаёт их координатору. Прежний код 0 на 97 страницах относится к первому кругу;
после этих правок прибор должен быть запущен заново. Cross-family ревью выполняет Anthropic;
самопроверка сборкой и тестами не объявляется независимым ревью.

Телеметрия продолжена в прежнем RUN_ID `20260925T111524Z-mobile-audit-fixes-codex`, попытка `round2-implement`.
Профиль `compact-quality-first-v2`, тир S (механический и содержательный), один исполнитель:
текущая сессия Codex/GPT-6; точная actual-модель и effort не раскрыты хостом (`null`),
переключений/fallback не было. Учтённая длительность второго круга **320.4 с**;
чтение инструкций до отметки начала в неё не входит, его длительность неизвестна.
Active time, usage и стоимость — `null`; экономия не установлена.

Паспорт и журнал: `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/run.json`, `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/events.jsonl`.
Логи: `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/evidence/round2-{typecheck,lint,build,tests}.log`.
Снимок: `docs/telemetry/p-replicator/20260925T111524Z-mobile-audit-fixes-codex/evidence/round2-source-manifest.json`;
ревизия `b6c4a0940c6408bfc9f5fb6dd4b60783bc5aba3a+sha256:1b1f0614655106d3a71d964599171a4a4bed7f18af120e8a2ae3cc7adbe9ed2c`. Сохранены diff до/после второго круга.

Все восемь исправлений и доступные проверки исполнены. Статус ниже относится к поручению
второго круга; полная браузерная приёмка фичи остаётся у координатора.

Status: completed
