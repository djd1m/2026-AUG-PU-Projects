# services/transcribe

Единственная точка входа к внешнему STT-провайдеру (OpenAI) в продукте Proofwall. Читай вместе с
[`docs/ADR.md`](../../docs/ADR.md) (ADR-005), [`docs/Architecture.md`](../../docs/Architecture.md)
§5 и §7, [`docs/Pseudocode.md`](../../docs/Pseudocode.md) §1.1,
[`docs/Specification.md`](../../docs/Specification.md) FR-003 / FR-NFR-SEC-002,
[`.claude/rules/security.md`](../../.claude/rules/security.md) §5 и
[`decisions/D-007-transcription-engine.md`](../../decisions/D-007-transcription-engine.md).

## История: почему это не mcp-claude (D-007)

До этой правки сервис назывался `services/mcp-claude` и говорил по MCP-протоколу с Claude API —
единственный экспортируемый MCP-tool `transcribe_video`. **Claude API не принимает аудио вообще**:
поддерживаемые типы content-блоков Messages API — `text`, `image`, `document`; аудио прямо названо
неподдерживаемым. Вся ветка транскрипции была построена на пути, которого не существует —
подробный разбор в `decisions/D-007-transcription-engine.md`.

Решение владельца: транскрипция переезжает на **OpenAI STT**, модель `gpt-4o-mini-transcribe`
(таймкоды проекту 01 не нужны — это требование проекта 05, не 01; расчёт цены и альтернатив —
`research/openai-footprint/01-speech.md`).

## Почему у сервиса нет ни одного пути, принимающего текст отзыва

FTC Rule (16 CFR Part 465, действует с 21.10.2024) запрещает AI-сгенерированные отзывы —
штраф до **$53,088** за нарушение. Граница проведена **на уровне интерфейса**, не только
промпт-инструкцией: в кодовой базе физически не существует HTTP-пути, который принимал бы текст
отзыва на вход. Единственный путь, принимающий вход, — `POST /transcribe`: вход — presigned URL
на видео, выход — текст.

Эта граница ТЕПЕРЬ ЕЩЁ СИЛЬНЕЕ, чем была с Claude: раньше гарантия опиралась на «этому tool'у
нечем принять текст», но модель за интерфейсом всё же была способна порождать текст вообще (была
бы порождающей моделью, если бы кто-то дал ей такой вход). OpenAI STT физически делает
**speech-to-text** — расшифровку уже сказанного, а не генерацию текста. Это конструктивная
гарантия на уровне САМОЙ МОДЕЛИ, а не только запрет на уровне интерфейса вокруг неё.

**Исполняемая форма этой гарантии** — `tests/contract.test.ts`: тест собирает реальное
Express-приложение через `createTranscribeApp()`, проверяет реестр `routes` и Zod-схему
`transcribeRequestSchema`, и убеждается, что зарегистрирован **ровно** один путь, принимающий
вход — `POST /transcribe` с единственным полем `video_url`. Тест обязан упасть, если кто-то
зарегистрирует второй путь, принимающий вход, или добавит в схему поле, похожее на текст отзыва.

## `OPENAI_API_KEY` — секрет только этого сервиса

`apps/web` и `services/worker` не получают `OPENAI_API_KEY` (docker-compose.yml, `.env.example`) —
ровно та же граница, что раньше была вокруг `ANTHROPIC_API_KEY`. Единственный способ вызвать
внешний STT из продукта — HTTP-запрос к этому сервису на порт `7331` (канон
`TRANSCRIBE_SERVICE_URL=http://transcribe:7331`, Architecture §7). Секрет физически недостижим
из кода, который принимает пользовательский ввод (форма, дашборд) — компрометация `apps/web` не
даёт доступа к OpenAI API.

## Транспорт

Обычный HTTP/JSON поверх Express — **не MCP**. MCP-протокол убран сознательно (см. «Что
изменилось» ниже): его ценность — tool-discovery для агента, который сам решает, какой
инструмент вызвать. Единственный вызывающий этого сервиса — `services/worker`, у которого нет
выбора между инструментами: ему нужен один синхронный HTTP-запрос "аудио → текст". Plain HTTP
проще, не тянет MCP SDK как зависимость и не усложняет контрактный тест транспортным слоем.

- `POST /transcribe` — тело `{ "video_url": "..." }`, ответ `200 { "text": "..." }` либо
  `502 { "error": "..." }` на неудачу STT (сеть, ffmpeg, лимиты, ответ провайдера).
  `400 { "error": "invalid_request", "details": ... }` — тело не прошло Zod-валидацию
  (отсутствует `video_url` либо есть посторонние поля — схема `.strict()`).
- `GET /health` — для docker-compose healthcheck (в текущей compose-конфигурации не подключен,
  см. Architecture §7 «нет healthcheck на этой неделе» — оставлено для будущего).

## Что делает `POST /transcribe`

1. Скачивает видео по presigned GET URL (живёт только на время вызова — не сохраняется, не
   логируется целиком).
2. Извлекает звуковую дорожку через `ffmpeg` (моно, 16 кГц, обрезка по 120 сек — вторая линия
   защиты поверх лимитов FR-003, уже проверенных на приёме в `apps/web`).
3. Отправляет звук в OpenAI STT (`model=OPENAI_TRANSCRIBE_MODEL`, дефолт `gpt-4o-mini-transcribe`).
4. Возвращает текст. Если что-то пошло не так — HTTP 502 с телом ошибки, не переписанный текст;
   `services/worker` переводит `transcript_status` в `failed` (Pseudocode §1.1).

**Единственный исход при неудаче — читаемая ошибка, не переписанный текст.**

## [GAP] Точная форма REST-запроса к OpenAI Audio API

`research/openai-footprint/01-speech.md` фиксирует официально подтверждённые модель, цену,
лимиты и поддерживаемые форматы (разделы 1, 4, 8), но НЕ цитирует дословно тело запроса/ответа
REST API — только ссылки на страницы документации OpenAI. Задание фазы прямо запрещает
подставлять параметры API наугад, поэтому:

- `src/transcribe.ts`, `callOpenAiTranscription()` — реализована через общепринятый REST-контракт
  (`POST https://api.openai.com/v1/audio/transcriptions`, multipart-поля `file`+`model`, ответ
  `{ "text": "..." }`) — это **не подтверждено дословно** research-документом и должно быть
  сверено с https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
  перед продакшн-использованием.
- `OPENAI_TRANSCRIBE_MODEL` — переменная окружения, дефолт `gpt-4o-mini-transcribe`
  (research §8: рекомендация для проекта 01, таймкоды не нужны).

Оба места отмечены комментариями `[GAP: ...]` прямо в коде (`src/transcribe.ts`).

## Разработка

```bash
npm install
cp ../../.env.example ../../.env   # заполнить OPENAI_API_KEY; OPENAI_TRANSCRIBE_MODEL опционален
npm run dev      # tsx watch, локально без Docker
npm test         # vitest — контрактный тест + юнит-тесты transcribe.ts
npm run build    # tsc → dist/server.js (то, что запускает Dockerfile)
```

## Известные ограничения (не блокируют MVP-неделю)

- Политика повторных попыток при `SttApiError` не определена в документах —
  `[GAP: retry policy — вне scope MVP-недели]` (Architecture §5, дословно).
- Точная форма REST-запроса к OpenAI — рабочая заготовка, не проверенная против реального API
  (см. раздел `[GAP]` выше).
