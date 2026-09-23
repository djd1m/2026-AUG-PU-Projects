# ClipMkr

Длинная запись подкаста или интервью → короткие вертикальные клипы (1080×1920) с вшитыми
субтитрами (фразами, с подписью говорящего), объяснимой оценкой потенциала (хук, завершённость
мысли, длина — и почему) и знаком `clipmkr.ru` на бесплатном плане. Рост — content-driven: автор
публикует клип сам, зритель видит знак и приходит.

**Статус: Phase 1 (SPARC) + Phase 2 (валидация) завершены, 🟡 CAVEATS. Реализация не начиналась.**
Полный контекст — [`CLAUDE.md`](CLAUDE.md); документация продукта и архитектуры — [`docs/`](docs/);
пошаговый цикл разработки — [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md).

## Что уже готово

- [`docs/PRD.md`](docs/PRD.md) — продукт, метрика недели (≥5 подтверждённых внешних клипов от ≥3
  разных авторов), очереди поставки.
- [`docs/Specification.md`](docs/Specification.md) — 16 FR-clips, 5 FR-GROWTH, 8 принятых FR-LOOK,
  8 NFR, 30 AC, 69 сценариев.
- [`docs/Architecture.md`](docs/Architecture.md) + [`docs/Architecture-compose.md`](docs/Architecture-compose.md) —
  8 сервисов Docker Compose, границы доверия, внешние зависимости (OpenRouter, Cloud.ru, Resend).
- [`docs/ADR.md`](docs/ADR.md) — 17 архитектурных решений с проверками.
- [`docs/Pseudocode.md`](docs/Pseudocode.md) — 45 алгоритмов.
- [`docs/Refinement.md`](docs/Refinement.md) — 20 edge cases, 13 обязательных конкурентных
  тестов, 15 мутационных стражей.
- [`docs/Completion.md`](docs/Completion.md) — Definition of Done, честная оценка 14–19 рабочих
  дней + 7 дней беты, чек-лист развёртывания на VPS в Нидерландах.
- [`docs/canon.md`](docs/canon.md) — единственный источник имён, чисел и единиц.

## Стек (целевой, не подтверждён исходником)

Next.js 15.5.12 (REST route handlers) + Prisma/PostgreSQL 16 + BullMQ/Redis 7 + Cloud.ru S3
(MinIO в тесте) + ffmpeg; модели — OpenRouter (STT с диаризацией, `anthropic/claude-sonnet-5`) с
сервера в Нидерландах; почта — Resend. Монорепо npm workspaces, Docker Compose, VPS.

## Как начать

1. Прочитать `CLAUDE.md` целиком.
2. `.claude/feature-roadmap.json` — первая фича `stt-probe` (проба STT дня 1, без развёрнутого
   стека).
3. `DEVELOPMENT_GUIDE.md` §0–2 — предусловия и день 0 владельца.

## Лицензия и данные

Внутренний прототип; правовые вопросы РФ (152-ФЗ, 38-ФЗ, маркировка) отложены владельцем
(OWN-05A-004) и остаются в реестре рисков `docs/PRD.md` §7.1 до консультации с юристом.
