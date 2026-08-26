# services/mcp-claude

Единственная точка входа к Claude API в продукте Proofwall. Читай вместе с
[`docs/ADR.md`](../../docs/ADR.md) (ADR-005), [`docs/Architecture.md`](../../docs/Architecture.md)
§5 и §7, [`docs/Pseudocode.md`](../../docs/Pseudocode.md) §1.1,
[`docs/Specification.md`](../../docs/Specification.md) FR-003 / FR-NFR-SEC-002 и
[`.claude/rules/security.md`](../../.claude/rules/security.md) §5.

## Почему у сервиса ровно один tool

FTC Rule (16 CFR Part 465, действует с 21.10.2024) запрещает AI-сгенерированные отзывы —
штраф до **$53,088** за нарушение. Вместо того чтобы полагаться на промпт-инструкцию «только
транскрибируй, не переписывай», граница проведена **на уровне интерфейса**: в кодовой базе
физически не существует MCP-инструмента, который принимал бы текст отзыва на вход. Единственный
экспортируемый tool — `transcribe_video`, вход — presigned URL на видео, выход — текст.

Промпт-инструкция (см. `src/transcribe.ts`, системный промпт в `callClaudeTranscription`) —
**вторая линия защиты**, не первая. Первая — сам факт отсутствия альтернативного tool'а: это
единственная гарантия, которую нельзя случайно сломать рефакторингом промпта. Это дословно
решение ADR-005 (раздел «Альтернативы» explicitly отвергает «полагаться на промпт-инструкцию»).

**Исполняемая форма этой гарантии** — `tests/contract.test.ts`: тест собирает реальный
`McpServer` из `src/server.ts`, подключает клиента через `InMemoryTransport` и проверяет, что
`client.listTools()` возвращает **ровно** `['transcribe_video']`. Тест обязан упасть, если
кто-то зарегистрирует второй tool.

## `ANTHROPIC_API_KEY` — секрет только этого сервиса

`apps/web` и `services/worker` не получают `ANTHROPIC_API_KEY` (docker-compose.yml, `.env.example`).
Единственный способ вызвать Claude API из продукта — HTTP-запрос к этому сервису на порт `7331`
(канон `MCP_CLAUDE_URL=http://mcp-claude:7331`, Architecture §7). Секрет физически недостижим
из кода, который принимает пользовательский ввод (форма, дашборд) — компрометация `apps/web` не
даёт доступа к Claude API.

## Транспорт

MCP поверх Streamable HTTP (`POST /mcp`), stateless-режим (`sessionIdGenerator: undefined`) —
каждый вызов `transcribe_video` независим, воркеру не нужно поддерживать сессию между задачами
очереди. `GET /health` — для docker-compose healthcheck (в текущей compose-конфигурации не
подключен, см. Architecture §7 «нет healthcheck на этой неделе» — оставлено для будущего).

## Что делает `transcribe_video`

1. Скачивает видео по presigned GET URL (живёт только на время вызова — не сохраняется, не
   логируется целиком).
2. Извлекает звуковую дорожку через `ffmpeg` (моно, 16 кГц, обрезка по 120 сек — вторая линия
   защиты поверх лимитов FR-003, уже проверенных на приёме в `apps/web`).
3. Отправляет звук в Claude API с промптом «только дословная расшифровка».
4. Возвращает текст. Если что-то пошло не так — `isError: true` в результате tool-вызова;
   `services/worker` переводит `transcript_status` в `failed` (Pseudocode §1.1).

**Единственный исход при неудаче — читаемая ошибка, не переписанный текст.**

## Исправление Dockerfile (Phase 2)

Исходный `services/worker/Dockerfile` ставил `ffmpeg` с комментарием «для извлечения
аудиодорожки перед транскрипцией». Это противоречило `Architecture.md` §5 (шаги 3-4), где
извлечение звука явно закреплено за `mcp-claude`, а не за `worker`. При расхождении между
Pseudocode.md и Architecture.md канон — Architecture.md (см. Architecture §10). Правка:
`ffmpeg` перенесён в `services/mcp-claude/Dockerfile`, `services/worker/Dockerfile` больше его
не ставит (worker передаёт только presigned URL, ничего не скачивает и не декодирует сам).

## [GAP] Модель Claude и точная схема аудио-входа

Ни один документ проекта не называет конкретную модель Claude для транскрипции — везде
фигурирует общее «Claude API» (Architecture §5, Pseudocode §1.1, ADR-005, Specification
FR-003/FR-NFR-SEC-002). Задание фазы 2 прямо запрещает подставлять модель наугад. Поэтому:

- `ANTHROPIC_TRANSCRIBE_MODEL` — **обязательная** переменная окружения, дефолта нет
  (`src/config.ts` бросает ошибку конфигурации при старте, если она не задана).
- Точная форма content-блока для передачи звука в Anthropic Messages API (`src/transcribe.ts`,
  `callClaudeTranscription`) реализована через `document`-блок с base64 — это ближайший
  документированный механизм передачи произвольного бинарника, но для аудио он **не
  подтверждён**. Перед продакшн-использованием — сверить с актуальной документацией Anthropic
  (возможно, потребуется отдельный endpoint/модель для распознавания речи, не Messages API).

Оба места отмечены комментариями `[GAP: ...]` прямо в коде.

## Разработка

```bash
npm install
cp ../../.env.example ../../.env   # заполнить ANTHROPIC_API_KEY, ANTHROPIC_TRANSCRIBE_MODEL
npm run dev      # tsx watch, локально без Docker
npm test         # vitest — контрактный тест + юнит-тесты transcribe.ts
npm run build    # tsc → dist/server.js (то, что запускает Dockerfile)
```

## Известные ограничения (не блокируют MVP-неделю)

- Политика повторных попыток при `ClaudeApiError` не определена в документах —
  `[GAP: retry policy — вне scope MVP-недели]` (Architecture §5, дословно).
- `document`-блок для аудио — рабочая заготовка, не проверенная против реального Claude API
  (см. раздел `[GAP]` выше).
