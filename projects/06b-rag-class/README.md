# N6b — RAG-бот для сайта

Чат-бот по страницам и PDF владельца малого сайта: каждый ответ со ссылкой на источник, нет ответа — «не знаю» и контакт
владельца. Виджет одним `<script>`, бейдж на Free, демо-страница бота, подаккаунты студий. Повтор проекта N6 для занятия
30.09 (код N6 не используется; модули N1–N5 — по инвентарю переиспользования).

**Статус:** документы пройдены (`/replicate` Фазы 0–2, вердикт 🟡 CAVEATS 88/100), тулкит сгенерирован (Фаза 3),
скелеты развёртывания (Фаза 4). Кода продукта ещё нет — первая фича `foundation`.

## Стек

TypeScript / Node 22 монорепо · Next.js 15 · Postgres 16 + pgvector 0.8.6 (HNSW, 1536) · очередь в Postgres без Redis ·
OpenRouter (`openai/gpt-4.1-mini`, `openai/text-embedding-3-small`, исполнитель закреплён) · Docker Compose на VPS за
существующим TLS-прокси.

## Структура (целевая)

```
apps/web  apps/widget  services/worker  packages/db  packages/rag  scripts/
docs/     — SPARC-документы, контракты, решения владельца, отчёт валидации
.claude/  — агенты, правила, навыки, команды, хуки, feature-roadmap.json
```

## Быстрый старт

1. `.env` по `.env.example` (секреты не коммитить).
2. `node .claude/hooks/check-ports.cjs .` и корневой `bash scripts/check-port-conflicts.sh projects/06b-rag-class`.
3. `/start` — бутстрап монорепо; далее `/next` → `/go <feature>`.

Стенд (после разрешения владельца): `https://n6b.194.85.249.105.sslip.io`.

## Документы

[PRD](docs/PRD.md) · [Specification](docs/Specification.md) · [Pseudocode](docs/Pseudocode.md) ·
[Architecture](docs/Architecture.md) · [ADR](docs/ADR.md) · [Refinement](docs/Refinement.md) ·
[Completion](docs/Completion.md) · [BDD](docs/test-scenarios.md) · [Валидация](docs/validation-report.md) ·
[Решения владельца](docs/decisions-owner.md) · [Инвентарь N1–N5](docs/discovery/reuse-inventory.md) ·
[Руководство разработчика](DEVELOPMENT_GUIDE.md) · [Контекст для Claude](CLAUDE.md)
