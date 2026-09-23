# adr-architect — квитанция

RUN_ID: 20260923T173212Z-replicate-05a-475b · WORK_UNIT_ID: adr-architect · исполнитель: Claude Opus 5.5

## Сделано
- Написан `docs/ADR-forks.md` (363 строки): 17 развилок ADR-001…017, сводная таблица, 5 вопросов владельцу (В1–В5).
- СПРОСИТЬ ВЛАДЕЛЬЦА: ADR-001 (STT: караоке или диаризация), ADR-003 (маршрут к моделям из РФ), ADR-006+011 (вход и потолки расхода),
  ADR-009 (кадрирование 9:16), ADR-017 (имя и домен на знаке). Остальные 12 решены с уверенностью и обоснованием.
- Других файлов не менял. `projects/05-*` не читал.

## Новые находки по донору (статически, не запускалось)
- `ffmpeg.ts:90` getScaleFilter — scale+pad черными полями, это НЕ кроп; R3 назвал модуль «вертикальный кроп, брать как есть».
- watermark донора: правый нижний угол, 2,2 % ширины, white@0.4 (`ffmpeg.ts:253-271`) — в UI-зоне всех площадок по R2 §3.
- compose: команды воркеров `dist/apps/worker/workers/{stt,video}.js`; файла video.ts нет; очередь video-download никто не читает.
- `workers/index.ts:28` — process.exit(0) по SIGTERM без worker.close(): повтор начинается заново (двойная оплата STT).
- `queues.ts:7` — REDIS_URL по умолчанию localhost (тихий фолбэк).
- lock-файл: next 15.5.12, react 19.2.4 — после патчей CVE-2025-29927 и CVE-2025-55182.

## Внешние источники (обращение 2026-09-23)
- developers.openai.com: speech-to-text guide (только whisper-1 даёт timestamp_granularities; 25 МБ; diarized_json), pricing
  (whisper и diarize $0.006/мин, gpt-transcribe $0.0045), модель diarize (16k контекст, 2 000 выходных токенов).
- anthropic.com/supported-countries (Россия отсутствует); claude.com/pricing (Sonnet 5 $2/$10 и др.).
- help.openai.com supported countries — по поиску; WebFetch первоисточника вернул нерелевантный текст → дословно НЕ ПРОВЕРЕНО.
- proxyapi.ru/docs (форматы, оплата рублями; word-метки не упомянуты).
- cloud.ru/docs/s3e: methods (CORS, lifecycle, multipart есть; PostObject нет), lifecycle, SigV4.
- NVD/Datadog по CVE; whois (.ru/.com) + веб-поиск для имён.

## Неуверенности
- Предел длительности diarize (1400 с) — только вторичные источники.
- Пословные метки через ProxyAPI и Cloud.ru Whisper — не проверены; нужна проба дня 1.
- Наценка/логирование шлюза, 152-ФЗ трансграничная передача, ToS провайдеров — не проверено, юрист.
- Объём токенов LLM, стоимость рендера, поведение CORS/presigned на реальном бакете Cloud.ru — не измерены.
- Числа потолков (ADR-006) — предложение, не решение.
- Товарный знак (ФИПС) и handle в соцсетях — не проверены.
- ADR-016 (трактовка «AI integration: MCP servers») — нужна реакция координатора.


## Задание 2 (после СТОП 2)

### Сделано
- `docs/ADR.md` (384 строки): ADR-001…017 со статусом «Принято», контекстом, решением, последствиями, отвергнутыми
  вариантами, ссылками на OWN-05A-002…010 и разделом «Как проверить».
- `docs/canon.md` (229 строк): 12 нумерованных разделов — 8 сервисов compose, 9 пакетов, 3 очереди, 14 таблиц,
  закрытые списки значений (3 состояния задачи, 9 причин отказа), переменные окружения (у 7 потолков нет дефолта),
  маршруты, ключи S3, 16 событий и метрики i/conv%, машинные ключи из Specification (14 FR-clips, 5 FR-GROWTH, 8+5 FR-LOOK,
  8 NFR, 20 AC), единицы; раздел 12 — 11 расхождений со Specification.
- `docs/dispatch-plan.md`: хеш канона 85133ca576cf143718c85f0caa38a3d39fcab0f457da831b4a00d3aa1108828d, 3 единицы.
- Проверка: `node .claude/hooks/check-canon.cjs projects/05a-podcast-clips-opus` → exit=0
  («канон зафиксирован и цел… 3 параллельных пишущих единиц; 13 заголовков; перечни держат своё число (10)»).
  Испытание на падение: копия с изменённым каноном в scratchpad → exit=1 «канон изменился после фиксации».

### Источники (2026-09-23)
- `https://openrouter.ai/api/v1/models`: `anthropic/claude-sonnet-5` существует ($2/$10 за 1 млн, `structured_outputs`).
- `https://openrouter.ai/api/v1/models?output_modalities=transcription`: 22 модели; `gpt-4o-transcribe-diarize` нет;
  диаризацию заявляют `x-ai/grok-stt-1.0` (кандидат, которого не было в списке координатора) и `meta/muse-voice-transcribe-1.0`.
- `openrouter.ai/docs/guides/overview/multimodal/stt`: endpoint, 25 МБ, обрыв после ~60 с, `provider.options` для диаризации.
- whois `clipmkr.ru`: зарегистрирован 2026-09-23 (REGRU-RU), NS yandexcloud.
- Проект 04 (прочитано только про оплату и вход): decisions-owner OWN-006…012, ADR-008, subscription-and-commission/03, 04.

### Неуверенности
- Единица `pricing.prompt` STT на OpenRouter (доллары за секунду) — вывод, сверенный только по whisper-1; у
  `microsoft/mai-transcribe-2` значение 0,1 не объясняется этой единицей.
- Приходят ли метки спикера через нормализованный ответ OpenRouter — проверит только проба дня 1.
- Эвристика сшивки спикеров (ADR-002) не испытана; при сомнении подписи спикеров не печатаются.
- Трафик между сервером в Нидерландах и бакетом Cloud.ru (задержка и цена) не измерен.
- Решения, которые меняют Specification: размытый фон заменён чёрными полями, подтверждение почты теперь обязательно,
  потолки изменены, `/w` снят, исходник хранится 72 ч, LLM возвращает индексы. Все 11 перечислены в canon §12; их
  нужно передать spec-author.
- Для `minio` конкретный тег не выбран: выбирается при первой сборке.

Status: completed
