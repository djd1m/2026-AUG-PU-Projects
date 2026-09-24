# music-library — отчёт реализации

Реализованы все обязательные правки брифа после VALIDATE. Код готов к передаче
на Anthropic REVIEW. Коммитов, Docker-запусков и развёртывания исполнитель не делал.

## Изменения и соответствие AC

- Закрытый каталог содержит 11 треков в заданном порядке, прежний трек первый.
  Все 11 файлов проверены по SHA-256 и ffprobe: длительность каждого ≥75 с.
- `getRenderInput` выбирает `c.index`, `RenderInput.index: number` передаётся через
  `handleRenderJob` в `RenderOptions.clipIndex`. На границе рендера выполняется
  перевод к нулевой нумерации: `selectTrack(index - 1)`.
- Чистый `selectTrack` использует безопасные целые и циклическое взятие остатка.
  Индексы 0…21 проходят весь каталог дважды; −1 выбирает последний трек.
  1.5, '3', Infinity, NaN, undefined, null, −Infinity и небезопасное целое дают первый.
- `prepareMusic` принимает выбранный трек, меряет именно его и возвращает путь.
  ffmpeg получает этот путь; контракт получает id:sha256 из результата рендера.
  Проверены индексы 2, 5 и 12; через настоящий `handleRenderJob` — index=2,
  ожидаемый SHA-256 контракта и второй вход `-i`.
- Для `music=false` сохранены точные аргументы и контракт из baseline.json;
  для index=1 — аргументы и контракт music-only.json. Эталоны не изменены.
  Все моки `getRenderInput` с исходными данными получили явный `index: 1`.
- README ассетов содержит названия, номера в альбоме, длительности, хеши и два
  источника CC0 из брифа. Строка источников Uploader обновлена и проверяется
  точным сравнением текста элемента.
- Громкость, вспышка, пэк-шот, схема и процедуры БД не менялись.

## Проверки

| Проверка | Результат | Квитанция в tests/artifacts/music-library/ |
|---|---|---|
| `npx vitest run tests/music.test.ts tests/render-worker.test.ts tests/pack-shot-contract.test.ts tests/pack-shot.test.ts tests/pack-shot-uploader.test.ts` | exit 0, 45/45, 4.76 s | unit.log |
| `npx vitest run tests/music-media.test.ts tests/pack-shot-media.test.ts` | exit 0, 9/9, 112.59 s | media.log |
| `npx vitest run tests/render-failure.test.ts tests/render-audio.test.ts` | exit 0, 6/6, 31.82 s | render-regression.log |
| `npm run build` | exit 0, все workspace | build.log |
| `npm run typecheck` после build | exit 0 | typecheck.log |
| `npm run lint` | exit 0 | lint.log |
| `git diff --check` | exit 0 | выполнено перед передачей |

Итого 60 тестов в перечисленных наборах. После уточнения проверки порядка каталога
и явного clipIndex=1 повторены соответствующие тесты в зелёных фазах мутаций.
Полный интеграционный набор с PostgreSQL/Redis/MinIO не запускался, как разрешено брифом.

Медиа-стражи Г-2/Г-3 используют настоящий выбор по индексам 1 и 5. Рендеры дали
`music_mix`; Г-2: речь −27.2 LUFS, подложка −45.5 / −45.6 LUFS (порог −44.7).
Г-3: пики −3.3 / −5.2 dBTP (потолок −1). Г-1, длительность/кадры, тайминг вспышки,
непрозрачность метки, уровни и пики пэк-шота также прошли. RD-001 и SL-008 зелёные.
Среда: Node v22.22.0, ffmpeg/ffprobe 4.4.2; это локальное доказательство, не прогон
контейнера с ffmpeg 7 и не приёмка на clipmkr.ru.

## Мутации: дефект → восстановленный код

Команда: `MUSIC_MUTATION_DIR=tests/artifacts/music-library/music-mutations node tests/run-music-mutations.mjs`.
19 случаев; первоначально 18 подтверждены. Для Г-1 обнаружена устаревшая цель:
первое `normalize=0` теперь относится к пэк-шоту, а тест Г-1 использует music-only.
Первоначальная пара: дефект → exit 0, 1 passed; восстановление → exit 0, 1 passed.
Общий первый прогон завершился exit 1, это сохранено в music-mutations.log и JSON.
Цель уточнена до `inputs=2:duration=first:normalize=0`, аудиограф не изменён.
Повтор: `MUSIC_MUTATION_DIR=tests/artifacts/music-library/music-mutations-retry node tests/run-music-mutations.mjs G1`, exit 0.
Ниже итоговые пары, для Г-1 — отдельная повторная квитанция.

| Мутация | Дефект | Восстановление |
|---|---|---|
| selection | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| selected-measure | exit 1, 2 failed / 1 passed | exit 0, 0 failed / 3 passed |
| selected-input | exit 1, 2 failed / 1 passed | exit 0, 0 failed / 3 passed |
| selected-contract | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| index-passing | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| index-origin | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| gain-rounding | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| measure-timeout | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| timeout-skip | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| G1 | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| G2 | exit 1, 2 failed / 0 passed | exit 0, 0 failed / 2 passed |
| G3 | exit 1, 2 failed / 0 passed | exit 0, 0 failed / 2 passed |
| parser-NaN | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| off-input | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| contract | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| strict | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| skip-throws | exit 1, 4 failed / 0 passed | exit 0, 0 failed / 4 passed |
| catalogue | exit 1, 1 failed / 1 passed | exit 0, 0 failed / 2 passed |
| gain-ceiling | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |

Совместимость пэк-шота: `PACK_SHOT_MUTATION_DIR=tests/artifacts/music-library/pack-mutations node tests/run-pack-shot-mutations.mjs off-input music-catalogue catalogue contract contract-absent envelope-contract skip off ui`, exit 0.
Добавлены актуальные цели музыкального входа и второго трека; сохранён страж
каталога стингера. Все обычные медиа-стражи пэк-шота пройдены выше; остальные
неизменённые мутации пэк-шота повторно не запускались.

| Мутация | Дефект | Восстановление |
|---|---|---|
| envelope-contract | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| off-input | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| music-catalogue | exit 1, 1 failed / 1 passed | exit 0, 0 failed / 2 passed |
| off | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| skip | exit 1, 2 failed / 0 passed | exit 0, 0 failed / 2 passed |
| contract | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| contract-absent | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| catalogue | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |
| ui | exit 1, 1 failed / 0 passed | exit 0, 0 failed / 1 passed |

Итог: 28 подтверждённых пар, включая один исправленный повтор Г-1.
Каждая JSON/лог-квитанция сохранена в соответствующем каталоге, исходники восстановлены.

## Учёт прогона и передача

RUN_ID: `20260924T155105Z-music-library`; профиль `compact-quality-first-v2`,
протокол `feature-telemetry-v1`. Телеметрия встроена в этот отчёт: прямой запрет
брифа изменять другие docs/ имеет приоритет над стандартным путём docs/telemetry/.
Рабочая запись project-work-companion представлена здесь в формате отчёта;
его JSON-валидатор не запускался и не объявляется пройденным.

- ROUTE: смысловой тир M, существующий рендер без новой границы доверия,
  схемы, разделяемого ресурса или внешнего вызова; механический ROUTE по пяти
  производственным файлам — S, exit 0 (скрипт также вывел Broken pipe).
  PLAN/VALIDATE взяты из брифа READY WITH FIXES; область перед IMPLEMENT та же.
- IMPLEMENT: один исполнитель, текущая сессия OpenAI Codex. Точный model ID,
  effort, токены, стоимость: `null`, хост не предоставил достоверных счётчиков.
  Запроса смены модели, fallback и делегирования не было. Anthropic REVIEW
  остаётся отдельной стадией координатора; независимое ревью здесь не заявляется.
- CHECK: первая попытка typecheck не прошла из-за старого packages/db/dist,
  где не было index. Штатная сборка обновила типы; повтор typecheck прошёл.
  Первоначальный лог сохранён как typecheck-before-build.log.
- CHECK: исходная мутация Г-1 не поймала дефект; конкретная цель исправлена,
  одна повторная попытка прошла. История не перезаписана.
- Локальный preflight: ассеты и ffmpeg/ffprobe доступны, входы синтетические,
  результат — временные медиа и локальные квитанции. E2E стенда: not_applicable,
  внешних действий нет. Полный тестовый образ, живой длинный выпуск и субъективное
  прослушивание не проверялись.
- Учёт времени: 2026-09-24T15:51:05+00:00 → 2026-09-24T16:01:16.591972+00:00, **612 s**.
  Первичное чтение инструкций началось раньше; его начало не измерено, поэтому
  полная длительность с подготовкой — `null`, известный интервал указан отдельно.

Исходная ревизия: `1754bb4286d950c126b262776227cab1dc417406`; дерево в начале было чистым.
Во время работы другой процесс передвинул HEAD до `e66bdf14ee66cb4913bf178d64e91bd484b7f611`:
коммиты b9b93ae и e66bdf1 затронули только документацию, включая промежуточную
версию этого отчёта. Исполнитель их не создавал и не откатывал. Сверка diff
между ревизиями не нашла изменений проверяемого кода, тестов или ассетов;
повтор проверок из-за этой смены HEAD не требуется.

Снимок изменённого кода и тестов относительно исходной ревизии:
`tests/artifacts/music-library/source.diff`; хеши — `source-sha256.json`.
SHA-256 файла манифеста: `284452e2fd6b54965ba919afbca435c933832254025f4359b51f447147ebfad4`. Отчёт исключён из манифеста,
чтобы финальное заполнение не меняло идентичность проверяемых исходников.
Все материалы: `tests/artifacts/music-library/`; итоговый отчёт:
`docs/features/music-library/07_code_report.md`.

Status: completed
