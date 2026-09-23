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

Status: completed
