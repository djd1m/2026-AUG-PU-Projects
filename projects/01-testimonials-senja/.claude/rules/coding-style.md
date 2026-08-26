# Coding Style Rules — Proofwall

Источник: `docs/Architecture.md` §2, §4, §10. Стек: Next.js (`apps/web`) + vanilla TS-виджет
(`apps/widget`) + MCP-сервер (`services/mcp-claude`) + воркер (`services/worker`) на монорепо.

## 1. Разбиение монорепо — не смешивать пакеты

```
proofwall/
├── apps/
│   ├── web/            # Next.js: дашборд, /f/<slug>, /w/<slug>, все API-роуты, аутентификация
│   └── widget/          # ТОЛЬКО JS-виджет, отдельный esbuild/vite, БЕЗ React
├── services/
│   ├── mcp-claude/      # Единственная точка входа к Claude API — единственный tool transcribe_video
│   └── worker/           # Фоновый обработчик очереди видео (поллинг jobs-таблицы)
├── packages/
│   ├── shared-types/     # TS-типы: Testimonial, Project, AnalyticsEvent
│   ├── db/               # SQL-миграции, RLS-политики, сгенерированные типы, rate-limit-помощник
│   └── ui/                # Общие React-компоненты дашборда и формы (НЕ виджета)
├── docker-compose.yml
└── docker-compose.prod.yml
```

**Почему `apps/widget` отдельно от `apps/web`:** NFR требует ≤30 KB gzip и отсутствие блокировки
рендера хоста (FR-NFR-PERF-001); Next.js chunk неизбежно тянет фреймворк-рантайм. Не импортировать
ничего из `apps/web` или `packages/ui` (React) в `apps/widget` — это молча сломает бюджет бандла.

**Почему `services/mcp-claude` — отдельный сервис, а не библиотека в `apps/web`:** граница
FR-NFR-SEC-002 (ADR-005) выражена в наборе доступных tool'ов MCP-сервера, а не в промпте внутри
общего кода. Не вызывать Claude API напрямую из `apps/web`/`worker` — только через MCP-клиент к
`services/mcp-claude`.

## 2. Канонические имена (Architecture §10) — не переизобретать

Валидация Phase 2 нашла и устранила расхождения между Architecture.md и Pseudocode.md. Ниже —
канон; любой новый код, тест или миграция обязаны использовать именно эти имена:

| Сущность | Канон | НЕ использовать |
|---|---|---|
| Таблица установок виджета | `widget_installs` | `widget_install_events` |
| Путь конфигурации виджета | `GET /api/widget/config` | `/api/widget-config` |
| Поле файла видео | `testimonials.video_object_key` | `video_url` (это ключ объекта MinIO, не постоянная ссылка) |
| Поле текста транскрипта | `testimonials.transcript` | `video_transcript` |
| Поле статуса транскрипции | `testimonials.transcript_status enum(pending,completed,failed)` | `pending_transcription bool` |
| Поле источника транскрипта | `testimonials.transcript_source enum(machine)` | `video_transcript_is_machine bool` |
| Момент ценности | `widget_installed` + `invite_shown`, оба на `widget_installs` | отдельная таблица/поле под `invite_shown` |

## 3. Ограничения виджета (`apps/widget`)

- Бюджет: **≤ 30 KB gzip** — CI-гейт (`gzip -9` + сравнение с порогом), провал сборки при
  превышении. Не добавлять зависимости в `apps/widget` без проверки итогового размера бандла.
- Без фреймворк-рантайма: vanilla TypeScript, свой минимальный esbuild/vite-конфиг.
- Изоляция стилей — **Shadow DOM** (`attachShadow({mode:'open'})`), все стили — внутрь
  shadow-root через `<style>` (ADR-001). Не использовать глобальные CSS-классы для виджета.
- Рендер пользовательского текста — `textContent` или эквивалент, безопасный по умолчанию;
  никогда `innerHTML` на данных, пришедших с сервера как текст отзыва (см. `security.md` §1).
- Загрузка — `async`, не блокирует `window.onload` хоста; таймаут сетевого запроса конфигурации
  — 300мс (`fetchWidgetConfig`), при превышении — `renderEmptyPlaceholder`, не подвисание.

## 4. Данные и API

- Анонимные API-роуты (форма, `GET /api/widget/config`, Wall of Love) принимают **только `slug`**
  для резолва проекта — никогда `project_id` напрямую от клиента (см. `security.md` §2).
- Rate-limit — использовать общий помощник `packages/db` (`rateLimitCount`/`rateLimitRecord`/
  `rateLimitRevoke`), не писать отдельный стор под похожую задачу (см. `security.md` §4).
- Идемпотентные операции по внешнему `event_id`/ключу — уникальный constraint в БД
  (`webhook_events.event_id`, `commissions.payment_event_id`), не проверка `SELECT` перед
  `INSERT` (гонка, ADR-006).
- Атомарные вставки с уникальностью через `ON CONFLICT ... DO NOTHING RETURNING id`, где нужно
  разрешить гонку параллельных запросов на один и тот же ключ (`widget_installs`, Architecture §3.3)
  — не `exists()` + `insert()`.

## 5. Docker Compose

Сервисы: `postgres`, `minio`, `web`, `worker`, `mcp-claude`, `caddy`. Все — наши, managed-BaaS
(Supabase/Firebase/Neon) не используется — см. `CLAUDE.md` и Architecture §9. `depends_on` для
`postgres`/`minio` — `condition: service_healthy` (не короткий синтаксис `depends_on: [a,b]`,
который ждёт только старта контейнера, не здоровья — найденный и исправленный баг W-4).
