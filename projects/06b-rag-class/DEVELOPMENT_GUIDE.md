# Development Guide — N6b «RAG-бот для сайта»

## 1. Подготовка

- Node 22, Docker Compose v2, доступ к ветке `feature/06b-rag-class`.
- `.env` по `.env.example` (только имена; значения — на машине, ключ OpenRouter из N6 не выводить).
- Прочитать: `CLAUDE.md`, `docs/Specification.md`, `docs/Pseudocode.md`, `docs/ADR.md`, `docs/decisions-owner.md`.
- Код `projects/06-rag-sales-chatbase` не открывать; модули N1–N5 — по `docs/discovery/reuse-inventory.md`.

## 2. Цикл разработки

```
/next                → выбрать фичу (feature-roadmap.json, порядок зависимостей)
bash ../../scripts/complexity-router.sh <файлы>   → тир (0: T/S/M · 1: L/XL · 2: проверка не выполнена)
/go <feature>        → /plan (S/M) | /feature (L) | /feature + остановка на плане у владельца (XL)
тесты + мутация стража + полный прогон всех наборов
/next <feature-id>   → done, каскад разблокирования
```

Порядок MVP: foundation → spend-ceilings (XL) → index-jobs → chunk-embed → crawl-site → pdf-source → rag-answer-sandbox →
publish-bot → widget → badge-referral → weekly-metric → release-gate. Should: demo-page, studio-subaccounts, handover (XL),
source-management.

Политика моделей и телеметрии прогона обязательна для `projects/*`: `../../docs/development/model-routing.md`,
`../../docs/development/model-routing-telemetry.md` (журнал до первой стадии; ревью кода — другое семейство, не автор).

## 3. Команды

| Команда | Назначение |
|---|---|
| `/start` | бутстрап монорепо по документам (Phase 2 — параллельные Task с файловыми квитанциями) |
| `/next`, `/next update`, `/next <id>` | дорожная карта |
| `/go <feature>` | выбор пайплайна и реализация |
| `/feature <name>` | PLAN → VALIDATE → IMPLEMENT → REVIEW |
| `/plan <name>` | лёгкий план в `docs/plans/` |
| `/run mvp` · `/run all` | цикл по дорожной карте |
| `/deploy` | по `docs/Completion.md`; подъём стенда — только с разрешения владельца |
| `/docs` · `/myinsights` · `/harvest` | документация, грабли, извлечение знаний |

## 4. Агенты и навыки

Агенты: `planner` (декомпозиция по Pseudocode), `architect` (ADR, схема, границы), `code-reviewer` (Edge Cases Matrix,
мутация стражей). Навыки: `project-context`, `coding-standards`, `testing-patterns`, `security-patterns`,
`feature-navigator` + pre-shipped навыки жизненного цикла.

## 5. Тесты

`npm test` (unit + contract на адаптере `fake`; `pretest` сам собирает `@n6b/db`) · `npm run test:int` (интеграция,
только против БД тестового стека ниже) · `npm run test:e2e` (Playwright по адресу стенда, виджет на ЧУЖОМ origin). Каждый
SC-US — тест с идентификатором в имени. Правило: `.claude/rules/testing.md`.

**Полный прогон всех наборов (typecheck + unit + integration) — одной командой в контейнере.** Стек `compose.test.yml`
(`name: n6b-test`): Postgres + pgvector без `ports:` во внутренней сети, данные в tmpfs, раннер собирается из
`tests/compose/Dockerfile`. Пароли — случайные, в env-файле ВНЕ репозитория; без них compose не стартует (`${VAR:?}`).

```bash
cd projects/06b-rag-class
ENV_FILE="$(mktemp)"; chmod 600 "$ENV_FILE"
printf 'TEST_DB_PASSWORD=%s\nTEST_TENANT_PASSWORD=%s\nTEST_SERVICE_PASSWORD=%s\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > "$ENV_FILE"
docker compose --env-file "$ENV_FILE" -f compose.test.yml config | grep -cE '^ +(published|host_ip):'   # 0 — стек ничего не публикует
docker compose --env-file "$ENV_FILE" -f compose.test.yml run --rm --build tests; echo "exit=$?"
docker compose --env-file "$ENV_FILE" -f compose.test.yml down -v; rm -f "$ENV_FILE"
```

Портов тестовый стек не публикует, поэтому `check-port-conflicts.sh` (он читает `docker-compose.yml`) здесь не нужен —
вместо него строка `config | grep` выше. Код возврата `run` — код прогона: 0 только если прошли все три набора. Без БД `npm run test:int` падает с «интеграционная
проверка НЕ выполнена», а не пропускается.

## 6. Локальный стек и стенд

```bash
node .claude/hooks/check-ports.cjs .                                  # 0/1/2 — Правило №0
(cd ../.. && bash scripts/check-port-conflicts.sh projects/06b-rag-class)   # занятость портов машины
docker compose build && docker compose run --rm migrate && docker compose up -d db web worker
```

Стенд: `https://n6b.194.85.249.105.sslip.io` через сеть `talk-ai-public`. Перед открытием посетителям — ворота
`docs/Completion.md` → Pre-Deployment (калибровка SC-US-006-4, `check-cjm.sh` по выданному адресу, `is_test` у
проверочных аккаунтов). Откат — предыдущие теги `N6B_WEB_TAG`/`N6B_WORKER_TAG`.

## 7. Autonomous development

```
/run → /start → /next → /go → /plan | /feature
```

- Одна фича: `/go <id>`; весь MVP: `/run mvp`; всё: `/run all`.
- XL-фичи (`spend-ceilings`, `handover`) останавливаются на плане — `/run` их не проходит без владельца.

## 8. Troubleshooting

| Симптом | Причина | Что делать |
|---|---|---|
| сервис не стартует, в журнале имя переменной | Boot config check: не задан `LIMIT_*`/секрет/`PUBLIC_BASE_URL` | задать в `.env`; дефолтов нет намеренно |
| `docker compose config` падает «… не задан» | `${VAR:?}` в compose | то же |
| виджет виден, ответов нет, в консоли CORS | origin не в `allowed_origins` или двойной CORS от прокси | список бота; прокси CORS не ставит |
| top-5 пусто при наличии фрагментов | фильтр `bot_id` после HNSW | `SET LOCAL hnsw.iterative_scan = strict_order` |
| 429 у офиса за NAT | единица /24 | см. Refinement → Technical Debt (порог 5 %) |
| 503 «сервис ответа временно недоступен» | OpenRouter/исполнитель OpenAI недоступен | ждать; к другому исполнителю не переключаемся (ADR-004) |
| стенд не открывается из части сетей Москвы | известная блокировка IP сервера | проверять из нескольких сетей |
