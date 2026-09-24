# Teaser headline — отчёт реализации Codex

Реализованы бриф, все обязательные уточнения VALIDATE и обе правки «Попутно».
Коммит не создавался. База: `13ee335237e9e89e68c2f946078a6cc02845810d`,
содержит `53f18f7` (music-library). Эталоны не изменены.

## Изменения и проверяемые свойства

- `015_teaser.sql`: `video.teaser boolean NOT NULL DEFAULT false`; 001–014 не изменены.
- Строгая схема принимает необязательный boolean; сервер сохраняет отсутствие как false,
  повтор ключа с другим выбором возвращает 409 до S3. Публичные пути/процедуры не добавлены.
- Вторая галочка «Заголовок в начале клипа» включена по умолчанию, сохраняется в Resume,
  блокируется при загрузке/возобновлении. Старый Resume: `saved.teaser === true`, то есть false
  при отсутствии поля. Проверены обработчики компонента и отправленный payload.
- `getRenderInput` читает `v.teaser,c.title`; воркер передаёт их рендереру.
- `teaser.ts`: нормализация пробелов; чистая `layoutTeaser` меряет каждую строку через
  `measureText`, ширина 972 при кадре 1080, до 3 строк, кегль 84→60 шагом 4.
  Затем обрезка по словам, для слишком длинного слова — по символам, с измерением «…».
- Один `drawtext`, `text_align=C`, шрифт метки, y=0.17*h, подложка black@0.55/24,
  окно `lt(t,2.5)` и alpha из брифа. Текст только в UTF-8 `textfile`, mode 0600,
  без конечного LF; путь через `escapeFFmpegPath`, `expansion=none`.
- Фильтры: кадр → ASS → приманка → вспышка → метка. ASS в начале не отключается.
  Порядок проверен строковыми индексами, геометрия — консервативным вычислением:
  верх 302.4 ≥ 268.8; низ ≤ 689.4, выше зон субтитров и метки.
- Пустой текст, неизвестный глиф и ошибки подготовки дают `teaser_skipped`; эмодзи
  не выходит наружу как `WatermarkGeometryError`. Проверен успешный воркер без retry.
- `renderClip` возвращает `teaser: { lines, font_size } | null`. Тип результата допускает
  отсутствие поля у существующих внедряемых рендереров; реальный рендер всегда возвращает поле.
  Контракт включает `teaser` только при фактическом наложении: SHA-256 байтов текста,
  **число** строк, кегль, `version: 'v1'`. Изменение заголовка меняет контракт.
- Без приманки аргументы и контракт совпадают с `baseline.json` и актуальным
  `music-only.json`. Сохраняются один encode и ноль вызовов ffmpeg до ошибки геометрии метки.
- «Попутно»: `[2,5,12]` заменён на `[2,5,13]`; непригодный заданный `clipIndex`
  пишет `music_track_fallback`. Музыкальные алгоритмы и каталог не менялись.

## Проверки

Артефакты: `tests/artifacts/teaser-headline/`; SHA-256 исходников и тестов —
`source-manifest.json`. Проверки относятся к незакоммиченному снимку поверх указанной базы.

| Команда | Результат | Артефакт |
|---|---|---|
| `npx vitest run tests/teaser*.test.ts` | 20 passed, 4 skipped на промежуточном тестовом наборе | `teaser.log` |
| `npm test` | 535 passed, 1 failed, 148 skipped; exit 1, исправление ниже | `full.log` |
| `npx vitest run tests/pack-shot-uploader.test.ts tests/teaser-uploader.test.ts` | после исправления: 7 passed, exit 0 | `uploader-final.log` |
| `npm run build` | exit 0, все workspace, включая Next.js | `build.log` |
| `npm run typecheck` после build | exit 0, включая тесты | `typecheck-final.log` |
| `npm run lint` | exit 0 | `lint-final.log` |
| `node tests/run-teaser-mutations.mjs` | exit 0; 18 PASS, 1 NOT_EXECUTED | `mutations.log`, `mutations/results.json` |
| `git diff --check` | exit 0 | локальная проверка |
| `bash scripts/check-env-wiring.sh` | exit 2: compose config недоступен | `wiring.log` |
| `bash ../../scripts/check-port-conflicts.sh .` | exit 1: compose config не прочитан, проверка не выполнена | `ports.log` |

Общий прогон нашёл ровно одно устаревшее ожидание: `pack-shot-uploader.test.ts`
требовал единственную галочку. Ожидание обновлено на две согласно брифу; проверки подписи
музыки и CC0-атрибуции сохранены. После этого оба затронутых UI-набора прошли (7 тестов).
Успешные неизменные наборы повторно не запускались. `npm test` целиком после этой
правки теста не повторялся; его исходный exit 1 сохранён, а не переименован в успех.
В полном прогоне новые teaser unit/contract/UI: 21 passed; четыре новых проверки пропущены.
148 общих пропусков = 147 интеграционных тестов без сервисов + 1 teaser media на ffmpeg 4.4.2.

Первый узкий прогон: 59 passed, 1 failed — тест ошибочно ожидал уменьшения кегля для
15 коротких слов, которые помещаются при 84. Исправлена входная строка, проверка сохранена.
Следующий прогон: 76 passed, 4 skipped и ошибка запуска синхронного ffmpeg (`EPERM`);
медиатест переведён на тот же асинхронный execFile, что применён соседними тестами.
Первый typecheck обнаружил старый `packages/db/dist` без новых полей;
после сборки зависимостей полный typecheck прошёл. Эти попытки не считаются зелёными.

## Мутации: обе строки

Отдельные JSON/log каждой попытки находятся в `tests/artifacts/teaser-headline/mutations/`.
После каждой мутации исходник восстановлен. `skipped` от фильтра `-t` не считается PASS;
для PASS обязательны упавший тест на дефекте и выполненный зелёный тест после восстановления.

| Мутация | Дефект (red) | Восстановлено (green) | Итог |
|---|---|---|---|
| `width` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `glyph` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `textfile` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `center` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `normalization` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `newline` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `window` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `intersection` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `order` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `order-top` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `off` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `strict` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `conflict` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `ui` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `resume` | 1 failed, 2 passed | 0 failed, 3 passed | PASS |
| `contract` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `contract-lines` | 1 failed, 0 passed | 0 failed, 1 passed | PASS |
| `fallback-log` | 3 failed, 0 passed | 0 failed, 3 passed | PASS |
| `window-pixels` | 0 failed, 0 passed | 0 failed, 0 passed | NOT_EXECUTED |

`window-pixels`: оба запуска пропущены, это **не доказанная мутация**. Медиатест явно выводит
«НЕ ВЫПОЛНЕН: ffmpeg < 6.1». Он пишет измеренные Δ в `teaser_pixel_delta`; сравнение при t=3
и в непрозрачной области метки использует допуск <1, при t=1 ожидает Δ>5.
Измерения Δ для приманки и для `lt(t,25)` на текущем хосте отсутствуют; их нельзя выдавать
за выполненные. Строковый страж окна и перестановки приманки после метки испытан мутацией.

## Границы подтверждения и передача координатору

Хост: ffmpeg 4.4.2. Новая опция `text_align` требует ≥6.1; полный медиапрогон приманки
и `window-pixels` нужно выполнить в согласованном образе 8.1.
Три новых PostgreSQL-теста (default/persistence/409/422, конкурентный конфликт, чтение
рендер-входа) написаны, но не выполнены: нет `DATABASE_URL`. Попытка подготовить отдельную
локальную PostgreSQL 16 только с Unix socket заблокирована окружением (`runuser: cannot set groups`).
Живой стенд, Cloud.ru, CJM и полная интеграционная приёмка здесь не заявляются.

Независимое ревью Anthropic — следующий этап координатора по OWN-002;
этот отчёт завершает реализацию, а не заменяет его вердикт.
После миграции уже загруженной записи понадобится адресный `UPDATE video SET teaser=true`
и перерендер; это операционный шаг **координатора**, здесь SQL на рабочей БД не выполнялся.
Публикации, изменения глобальных настроек и коммита нет. Появившийся параллельно
`scripts/acceptance-upload.mjs` не изменялся этой работой.

## Телеметрия и процесс

- RUN_ID: `20260924T161410Z-teaser-headline`, work unit: `teaser-headline-implement`.
- Профиль `compact-quality-first-v2`, тир **L**: новая схема и пересечение web/worker.
  Механический ROUTE с тремя путями: exit 1, L. Повторная содержательная оценка перед кодом: L.
- PLAN/VALIDATE взяты из переданного брифа (READY WITH FIXES); пользователь явно разрешил
  реализацию с приоритетом обязательных исправлений. Повторное согласование не требовалось.
- Навыки: project-work-companion, coding-standards, security-patterns.
  Scope: бриф и «Попутно»; исключения: музыка/пэк-шот/модель/публичные пути вне этих правок.
  Доноры: текущие music/pack-shot тесты и сохранённые эталоны этой базы, совместимы.
- Исполнитель: текущая сессия **OpenAI Codex / GPT-6**. Точный model ID и effort не раскрыты
  метаданными инструментов: `null`. Другие модели не запускались, fallback/делегирование отсутствуют.
- Токены input/output/cache, стоимость: `null`, провайдер не предоставил счётчики.
  Прогноз: insufficient_data, срок не оценивался.
- Телеметрия находится **в этом отчёте**; отдельный `docs/telemetry` не создавался, поскольку
  явный бриф разрешает менять в `docs/` только отчёт. Артефакты проверок находятся в `tests/artifacts`.
- Начало измерения: 2026-09-24T16:14:10Z. Чтение до этой отметки не измерено,
  поэтому длительность всей задачи и время до принятия: `null`.
- Журнал: 16:14 ROUTE/IMPLEMENT; 16:17 первый узкий тест и исправление входа;
  16:18 расширенные проверки; 16:20 новые тесты зелёные с явными пропусками;
  16:21–16:22 мутации; 16:22 общий прогон, build/typecheck/lint и проверки окружения.
- E2E readiness: not_applicable для реализации; развёрнутый E2E не запускался.
  Нет утверждения delivered/accepted до независимого ревью и проверок координатора.

- Завершение IMPLEMENT: 2026-09-24T16:27:44Z; измеренный интервал
  ROUTE→передача: 814 с (13 мин 34 с). Это не полное время до принятия;
  предварительное чтение и будущее ревью не измерены.
- Последнее событие: общий прогон завершён, исправлен единственный устаревший UI-страж,
  адресный повтор exit 0; код и отчёт переданы без коммита.

Status: completed

## Правки после REVIEW

- RUN_ID: `20260924T163751Z-teaser-review-fixes`; attempt: `review-fixes-1`.
  Начало измерения 2026-09-24T16:37:51Z; предварительное чтение не измерено.
- База: `10333f650a2e69cdd2a9d65d29d248c5fa67a9b3`, содержит переданный `e4d06ba`.
  Существующие сторонние изменения документации и `scripts/acceptance-upload.mjs` вне scope.
- ROUTE/IMPLEMENT: S, механический роутер exit 0 по пяти целевым файлам;
  содержательно — локальные исправления рендера и тестов без схемы, API и новых вызовов.
  AC и согласованный план: пять пунктов `08_review_fixes_codex.md`.
  Донор: существующие teaser-тесты этой базы; адаптация совместима.
- Профиль `compact-quality-first-v2`; исполнитель OpenAI Codex / GPT-6 (текущая сессия).
  Точный actual model ID, effort, usage input/output/cache и стоимость: `null`,
  хост не предоставляет подтверждающие счётчики. Делегирование и fallback отсутствуют.
  Forecast: `insufficient_data`; полная длительность до принятия: `null`.
- Телеметрия этого корректирующего прохода ведётся в данном разделе, как и исходного
  прогона; исходная история и артефакты сохраняются. E2E: `not_applicable` —
  задание на адресные тесты, медиамутация в образе передана координатору.
- 16:37:51Z: начало IMPLEMENT; разрешение — явное поручение выполнить review fixes,
  без коммита. Независимый повторный Anthropic REVIEW остаётся у координатора.

Внесены все пять исправлений:

1. `TEASER_FADE_SECONDS = 0.3`; обе временные границы alpha и делитель вычисляются
   из констант. Строковое ожидание alpha также использует экспортируемые константы.
   Фиксированное ожидание окна 2,5 с сохранено как независимый контрактный страж.
2. При `NOT_EXECUTED` runner выставляет `process.exitCode ||= 2`, сохраняя exit 1
   при наличии FAIL. Реальный пропуск `window-pixels` подтвердил exit 2.
3. `music_track_fallback` требует `options.music`; тесты NaN/Infinity/1.5 проверяют
   запись при `music: true` и отсутствие при false/undefined. Подготовка музыки
   в этих unit-тестах замокана, платных/внешних вызовов нет.
4. Граница безопасной зоны вычисляется из `TEASER_MAX_LINES`, `TEASER_FONT_SIZE`,
   экспортируемой `TEASER_BOX_BORDER_WIDTH`; прямое ожидание `TEASER_Y === 0.17` удалено.
5. Медиатест измеряет Δ в t=2,4: наложение ещё видно (`fading > 1`), но заметно
   слабее t=1 (`early - fading > 5`). Δ выводится вместе с early/late/watermark.
   Громкий пропуск на ffmpeg < 6.1 сохранён.

Проверки и журнал:

- 16:38:43Z, адресный `npx vitest run tests/teaser.test.ts tests/teaser-media.test.ts`:
  exit 0, **13 passed, 1 skipped**.
- Мутации `window`, `intersection`, `fallback-log`: соответственно 1/1/3 failed
  на дефекте и 1/1/3 passed после восстановления — **3 PASS**.
  `window-pixels`: обе фазы по 1 skipped, **NOT_EXECUTED**, общий runner **exit 2**.
- Дополнительный прогон пяти наборов рендера/музыки/контракта: 58 passed, exit 0.
  Он пересёкся по времени с мутациями, поэтому не используется как итоговое
  доказательство неизменного снимка. После восстановления выполнен последовательный
  итоговый прогон семи файлов:
  `npx vitest run tests/teaser.test.ts tests/teaser-media.test.ts tests/render.test.ts tests/render-audio.test.ts tests/music.test.ts tests/pack-shot.test.ts tests/teaser-contract.test.ts`.
  Начало 16:39:34Z, длительность Vitest 27,47 с, exit 0:
  **71 passed, 1 skipped**. `git diff --check`: exit 0.
- Свежие доказательства, не заменяющие исходные:
  `tests/artifacts/teaser-headline/review-fixes-mutations/` — results.json,
  red/green JSON и логи, `final-tests.log`, `source-manifest.json` с SHA-256 пяти файлов.
- Медиатест fade и красная `window-pixels` на ffmpeg 8.1 здесь **не подтверждены**;
  по заданию это проверяет координатор в образе. Полный интеграционный прогон,
  build и повторное независимое Anthropic REVIEW в этом проходе не запускались.
- Работа завершена без коммита. `scripts/acceptance-upload.mjs` не читался и не менялся.

Завершение IMPLEMENT: 2026-09-24T16:40:36+00:00; измеренный интервал 165 с. Чтение до начала измерения и будущее принятие
не включены; токены и стоимость недоступны (`null`). Телеметрия — этот раздел.

Status: completed
