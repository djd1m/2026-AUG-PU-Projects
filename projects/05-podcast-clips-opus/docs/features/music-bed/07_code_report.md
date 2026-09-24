# music-bed — отчёт реализации

Реализованы пункты 1–4 с приоритетом 12 исправлений VALIDATE. Коммит не создан.
Полная приёмка не заявляется: недоступны контейнерный ffmpeg 8.1 и интеграционное окружение.

## Изменения

1. **Загрузка:** новая `014_music.sql`, `video.music NOT NULL DEFAULT false`;
   необязательный boolean в строгой Zod-схеме; INSERT в прежней транзакции.
   Другой `music` с прежним ключом даёт 409 без изменения первой записи.
   Галочка выключена по умолчанию, блокируется при загрузке и незавершённом Resume
   того же файла. Resume сохраняет music; старые Resume без поля трактуются как false.
   Подпись: «Komiku — Everything is groovy, CC0».
2. **Рендер:** `getRenderInput` читает `v.music`. Замер вынесен в `render/loudness.ts`;
   RD-001 не изменён, в `render/ffmpeg.ts` ровно один вызов кодирования.
   Замер после геометрии и probe, с signal, ограничением stderr и таймаутом.
   Парсер берёт I только из последнего Summary. Нечисла и значения ≤ −60 LUFS
   пропускают музыку. FFmpegError(ffmpeg_failed) даёт measure_failed;
   отмена/таймаут пробрасываются. Усиление S−18−T, потолок +12 dB.
   Второй вход без собственного seek, atrim/reset timestamps/fades, stereo 44100
   до amix на обеих ветвях, normalize=0, общий filter_complex для видео и audio-only.
   Каталог закрыт одним треком; путь через resolve, README с предоставленными данными CC0.
3. **Контракт:** renderClip возвращает фактическое music или null. Только при
   смешении в JSON добавляются track-id:sha256, margin и gain_db (фактическое усиление
   также влияет на файл). При пропуске/выключении ключей нет.
   Эталон прежнего хеша: `e92b76aff65e08caa1eb4ac7d22732a428a3428290667f264f3bc427a9d69b2e`.
   Эталон argv и хеша снят тестом ДО правок на ревизии
   `345fdbd1c5e00ce5c50d02993c866c47a2e6ed69`, сохранён в `tests/fixtures/music-bed/baseline.json`.
4. **Гостевые и paid:** `guest-pack` не менялся, гостю выдаётся тот же файл.
   Тариф paid не отключает музыку; управляет только сохранённая галочка.
   Новых публичных путей, процедур, env, ducking, пэк-шота и выбора трека нет.

## Измерения настоящего ffmpeg

Хост: ffmpeg 4.4.2; настоящий mp3 каталога, 20-секундные синтетические входы.
Фикстуры stderr `sine-ffmpeg4.txt` и `silence-ffmpeg4.txt` сняты командами
`ffmpeg -hide_banner -f lavfi -i <sine/anullsrc> … -af highpass=f=300,lowpass=f=3400,ebur128 -f null -`.
Сохранены покадровые строки и Summary: sine −21,1 LUFS, тишина −70,0 LUFS.
Формат 8.1 из образа НЕ сверён: Docker socket permission denied.

| Проверка | Измерение | Результат |
|---|---|---|
| Г-1, одинаковое -ac 2 | без музыки −27,1; беззвучная музыка −27,1 LUFS | разность 0,0 ≤ 0,1 |
| Г-2, производственный граф | S=−27,2; T=−28,2; gain=−17,0 dB; подложка −45,5 LUFS | ≤ S−18+0,5=−44,7 |
| Г-3, пиковая заглушка | S=−16,3; gain=−6,1 dB; пик −3,3 dBTP | ≤ −1,0 |
| renderClip music=true | вне тона: off −48,1; on −37,5 LUFS | энергия музыки +10,6 LU; music_mix, результат music≠null |
| Длительность | 20,0 с | прежний предел 20–75 с |
| Каталог | SHA-256 соответствует; 116,035918 с; 2 381 126 байт | pass; README тестом не читается |

Г-3 первоначально проверял AAC-аудиофайл через тот же граф, затем усилен до
готового MP4 через renderClip; соответствующая проверка и мутация повторены.
Г-2 не повторяет формулу графа: тест вызывает экспортированную buildMusicAudioGraph.

## Мутации: обе строки

Команда: `node tests/run-music-mutations.mjs`. JSON-отчёты Vitest и итог
`tests/artifacts/music-bed/mutations.json` содержат реальные assertion failures,
а не только ненулевой exit. Код восстанавливается в finally.
Первый запуск сохранил только exit (stdout дочернего процесса был пуст), поэтому
доказательства пересняты с JSON reporter; это повтор измерения, не новый дефект кода.

- `G1` с дефектом → exit 1, 1 failed.
- `G1` после восстановления → exit 0, 1 passed, 0 failed.
- `G2` с дефектом → exit 1, 1 failed.
- `G2` после восстановления → exit 0, 1 passed, 0 failed.
- `parser-NaN` с дефектом → exit 1, 1 failed.
- `parser-NaN` после восстановления → exit 0, 1 passed, 0 failed.
- `off-input` с дефектом → exit 1, 1 failed.
- `off-input` после восстановления → exit 0, 1 passed, 0 failed.
- `contract` с дефектом → exit 1, 1 failed.
- `contract` после восстановления → exit 0, 1 passed, 0 failed.
- `strict` с дефектом → exit 1, 1 failed.
- `strict` после восстановления → exit 0, 1 passed, 0 failed.
- `skip-throws` с дефектом → exit 1, 4 failed.
- `skip-throws` после восстановления → exit 0, 4 passed, 0 failed.
- `catalogue` с дефектом → exit 1, 1 failed.
- `catalogue` после восстановления → exit 0, 1 passed, 0 failed.
- `gain-ceiling` с дефектом → exit 1, 1 failed.
- `gain-ceiling` после восстановления → exit 0, 1 passed, 0 failed.
- `G3` с дефектом → exit 1, 1 failed.
- `G3` после восстановления → exit 0, 1 passed, 0 failed.

Наблюдаемые нарушения: Г-1 разность 6,0 LU; Г-2 −28,6 > −44,7;
Г-3 +8,9 > −1 dBTP при +20 dB; NaN → music=null (падает сквозной тест);
лишний вход → argv отличается; удаление music из контракта → одинаковые хеши;
снятие strict → принят лишний ключ; throw при тишине → отказ рендера;
подменённый sha256 → несовпадение; снятый потолок → чрезмерное усиление.

## Команды и ограничения

| Команда | Exit / результат |
|---|---|
| ROUTE по 3 путям до реализации и повторно | 1 = тир L, не ошибка проверки |
| baseline capture test до правок | 0; 1 passed |
| npx vitest run tests/music.test.ts tests/render-worker.test.ts | 0; 24 passed |
| npx vitest run tests/music-media.test.ts | 0; 4 passed |
| npx vitest run tests/music-uploader.test.ts tests/music-upload.integration.test.ts | 0; 4 passed, 2 skipped |
| npm run build | 0; все workspaces, Next.js production build |
| npm run typecheck (после сборки db) | 0 |
| npm run lint | 0 |
| npx tsc --noEmit -p tests/tsconfig.json (финальные тесты) | 0 |
| git diff --check | 0 |
| node tests/run-music-mutations.mjs | 0; 10/10 red→green по JSON Vitest |
| npx vitest run | 0; 487 passed, 144 skipped, 59 suites passed / 17 skipped; 147,99 с |
| npx vitest run tests/music-media.test.ts -t G3 (готовый MP4) | 0; 1 passed, остальные 3 отфильтрованы |
| node tests/run-music-mutations.mjs G3 (готовый MP4) | 0; red 1 failed/exit 1, green 1 passed/exit 0 |
| docker version --format … | 1; permission denied к Docker socket, compose не запускался |

Полный набор проверял финальный продуктовый код; после него изменён только
тест Г-3 (AAC→MP4) и его mutation runner, поэтому повторена относящаяся проверка.
Журналы: `tests/artifacts/music-bed/{full,media,build,typecheck-final,lint-final}.txt`.
Бриф разрешает локальный fallback при отсутствии .env; exit 0 с 144 skipped
не трактуется как прохождение всех 631 теста.

`tests/music-upload.integration.test.ts` содержит проверки default/true в БД,
409 при другом флаге, отсутствие лишнего списания и конкурентные opposite flags.
Они НЕ выполнены без DATABASE_URL. UI проверен через обработчики настоящего компонента
с тестовым host React hooks, включая восстановление и отправку сохранённого флага;
это не браузерный E2E. Полный настоящий пользовательский сценарий не запускался.

Не проверены: ffmpeg 8.1 в образе, PostgreSQL/Redis/MinIO, Cloud.ru, мобильный браузер,
прослушивание человеком и разборчивость речи. M=18 LU остаётся оценкой до В-8;
успех синтетических тестов не доказывает безопасность уровня на любой записи.
Независимое Anthropic REVIEW не выполнено: в callable моделях делегирования
этой сессии Anthropic отсутствует; обнаруженный CLI Claude не запускался.
Самопроверка тестами не выдаётся за cross-family review.

## Телеметрия и передача

RUN_ID: `music-bed-20260924T082334Z`; профиль `compact-quality-first-v2`, тир L.
Телеметрия размещена в этом отчёте (исключение из формата run.json/events.jsonl:
бриф запрещает менять остальные docs). Один исполнитель, текущий Codex; точная
actual model, effort, токены, кеш, reasoning и стоимость — null: хост не предоставил
подтверждённых метаданных/счётчиков. Модели не переключались, агенты не запускались.
PLAN/VALIDATE взяты из утверждённого брифа; повторного согласования не требовалось.
Область ограничена брифом; исходники донора — существующий рендер/загрузка текущей ревизии.
Прогноз: insufficient_data, численная оценка не выдавалась; экономия не установлена.

События:
- Начало учёта: первая UTC-метка 08:23:34Z; затем паспорт/ROUTE, исходное дерево чистое; механический и содержательный тир L (exit 1).
- 08:24:26Z — снят baseline до реализации; IMPLEMENT в разрешённых границах брифа.
- 08:27:36Z — первые 24 unit/worker tests прошли.
- 08:28:41Z — первые медиа-измерения; сборка прошла.
- После медиа-тестов — мутации; повтор из-за отсутствия stdout с JSON reporter.
- После восстановления — полный локальный набор, typecheck и lint; ROUTE повторён, L.
- Г-3 уточнён до готового MP4; конкретная проверка и мутация повторены.

Первичный typecheck показал устаревший packages/db/dist без music; штатная сборка
обновила пакет, итоговый typecheck прошёл. Никаких глобальных настроек не менялось.
E2E preflight: blocked — .env отсутствует, Docker socket недоступен. Локальный
PostgreSQL 16 найден, но chown/runuser запрещены песочницей; сервер не запущен,
порты не открывались. Полнота доказательств partial, required_gates_passed=false.

Последнее обновление: 2026-09-24T08:37:58.232935+00:00. Измеренный интервал от первой UTC-метки: 864 с.
Начальное чтение до первой метки не измерено; полная elapsed и active = null.
Снимок исходников и sha256 diff: `tests/artifacts/music-bed/source-manifest.json`.
Исходная ревизия сохранена, коммита/деплоя нет. Для закрытия приёмки нужен прогон
в доступном тестовом образе и независимое ревью; непроверенные пункты не объявлены пройденными.

## Правки после REVIEW

Прогон `music-bed-review-fixes-20260924T084704Z`, начало измерения 08:47:04Z.
Профиль compact-quality-first-v2; ROUTE L по web + worker (exit 1).
Это корректирующая IMPLEMENT-попытка по утверждённому `08_review_fixes_codex.md`;
PLAN/VALIDATE/Anthropic REVIEW уже выполнены координатором согласно заданию.
Один исполнитель Codex, модель/effort и usage/cost = null: подтверждённых
метаданных исполнения и счётчиков нет. Переключений и делегирования нет.
Телеметрия здесь, согласно ограничению исходного брифа на остальные docs.
Начальное чтение до первой UTC-метки не измерено. Бюджет попытки: 15 минут;
область — только пять исправлений, затронутые проверки и мутации 3/4.
Исходная ревизия 345fdbd1c5e00ce5c50d02993c866c47a2e6ed69, дерево уже содержит фичу.
E2E preflight: not_applicable — локальные unit/media проверки; Docker-прогон
явно оставлен координатору. Самопроверка не заменяет Anthropic REVIEW.

### Выполнено по пяти пунктам

1. Нормализация заменяет `process.cwd() + '/'` на `'<ROOT>/'`: `/app/`
   больше не совпадает с `/apps/`. Сквозной поиск остальных тестов не нашёл
   аналогичных нормализаций. `baseline.json` не изменялся.
2. Добавлен настоящий видеовход `testsrc` + `sine` в MP4 (22 с), рендер участка
   2–22 с с music=true. Проверены music_mix, music≠null, длительность 20 с,
   видео 1080×1920 и аудиопоток через ffprobe.
3. `prepareMusic` округляет усиление до десятых перед журналом, возвратом
   результата и использованием в фильтре. Потолок +12 dB сохранён.
   Тест различает исходное −6,099999999999998 и требуемое −6,1 dB.
4. `MUSIC_MEASURE_TIMEOUT_MS = 120_000` задаёт таймаут по умолчанию.
   ffmpeg_timeout при замере теперь даёт music_skipped/measure_failed и
   успешное кодирование без музыки. Отмена внешним signal пробрасывается,
   в том числе при отмене во время замера; настоящий процесс завершается.
5. При выборе файла без совпадающего Resume галочка сохраняет текущее
   значение. Проверены true/false, переключение файлов и восстановление
   Resume (включая старую запись без music).

### Проверки корректирующего прохода

| Команда | Exit / результат |
|---|---|
| `npx vitest run tests/music.test.ts tests/music-uploader.test.ts tests/render-worker.test.ts` | 0; 33 passed |
| `npx vitest run tests/music-media.test.ts` | 0; 5 passed, 34,78 с |
| `npx tsc --noEmit -p tests/tsconfig.json` | 0 |
| `npm run lint` | 0 |
| `git diff --check` | 0 |
| `node tests/run-music-mutations.mjs gain-rounding measure-timeout timeout-skip` | 0; 3/3 red→green |

- gain-rounding с дефектом → exit 1, 1 failed.
- gain-rounding после восстановления → exit 0, 1 passed, 0 failed.
- measure-timeout с дефектом (900000 вместо 120000) → exit 1, 1 failed.
- measure-timeout после восстановления → exit 0, 1 passed, 0 failed.
- timeout-skip с дефектом (таймаут снова пробрасывается) → exit 1, 1 failed.
- timeout-skip после восстановления → exit 0, 1 passed, 0 failed.

Медиа-измерения на хостовом ffmpeg 4.4.2: Г-1 −27,1/−27,1 LUFS;
Г-2 S=−27,2, T=−28,2, gain=−17,0, bed=−45,5 LUFS;
видео-вход S=−21,1, T=−28,2, gain=−10,9 dB.
Логи: `tests/artifacts/music-bed/review-{unit,media,types,lint,mutations}.txt`;
мутации дополнительно имеют отдельные JSON/log с red/green.
Привязка исходников: `tests/artifacts/music-bed/review-source-manifest.json`.

08:48:20Z — запуск unit/UI/worker; 08:48:29Z — запуск media; затем три
мутации и передача. Все пять AC корректирующего задания выполнены.
Полный Docker-прогон, ffmpeg 8.1 и повторное независимое Anthropic REVIEW
этим проходом не заявляются: они оставлены координатору по заданию.
Предыдущие разделы отчёта сохраняют историю первой реализации; актуальный
статус ниже относится к пяти исправлениям REVIEW. Коммит не создан.

Завершение: 2026-09-24T08:50:11.909574+00:00; измеренный интервал 187.9 с.
Полное время с начальным чтением, токены, кеш и стоимость — null;
причина: начало чтения и usage хостом не измерены. Телеметрия partial.

Status: completed
