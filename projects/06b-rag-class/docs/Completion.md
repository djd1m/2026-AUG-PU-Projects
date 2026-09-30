# Completion — N6b «RAG-бот для сайта»

**Фаза:** 1 · `sparc-prd-mini` внутренняя фаза 7 · **Дата:** 2026-09-30 · Стенд: `https://n6b.194.85.249.105.sslip.io`
Подъём стенда — **остановка у владельца** (00-task, «Объём сборки»). Оплата, выплаты, удаление аккаунта — вне сборки.

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All tests passing: unit, integration (тестовый compose `name: n6b-test`), contract (`fake`), E2E на стенде
- [ ] Security audit complete: RLS-тесты, SSRF-тесты, мусорный вход плана, origin-gate, XSS в ответе и имени источника
- [ ] Docs updated: `CLAUDE.md`, `docs/*-contract.md` с квитанциями ПРОВЕРЕН
- [ ] Rollback tested: откат на предыдущий тег образа web/worker на тестовом стеке
- [ ] `node .claude/hooks/check-ports.cjs .` → 0; `bash scripts/check-port-conflicts.sh projects/06b-rag-class` → 0
- [ ] `bash scripts/check-env-wiring.sh` → 0 (каждый `process.env.X` web/worker есть в `environment:` compose)
- [ ] `node .claude/hooks/check-model-cost.cjs .` → 0; `check-job-contract.cjs` и `check-embed-contract.cjs` → 0 после проверок на стенде
- [ ] Ключи из N6 подставлены в `.env` стенда, не выводились в сессию, журнал, коммит (условие владельца №2)
- [ ] Все пределы `LIMIT_*` (включая `LIMIT_SANDBOX_GLOBAL_DAY` и `LIMIT_AUTH_ADDR_HOUR`), `MIN_SIMILARITY`, `PUBLIC_BASE_URL`,
  `PROXY_NETWORK` заданы (иначе сервис не стартует — так и задумано); `PROXY_NETWORK=talk-ai-public` (OWN-06B-006)
- [ ] **Ворота выпуска «не знаю» (SC-US-006-4, V-7):** калибровка на 30 вопросах живой `gpt-4.1-mini` прошла (10/10 «не
  знаю», ≥ 17/20 со ссылкой), `docs/calibration-report.md` закоммичен. Не прошла — стенд посетителям не открывается
- [ ] Аккаунты E2E и проверок стенда помечены `is_test` через CLI оператора (иначе они попадут в метрику недели)
- [ ] Уведомление о внешней модели видно в виджете и на демо до первого вопроса (SC-US-008-4, OWN-06B-002)

### Deployment Sequence

1. **Step 1 — сборка и миграции:** `docker compose build` (контекст — корень монорепо); `docker compose run --rm migrate`
   (pgvector `CREATE EXTENSION vector`, таблицы, RLS, HNSW).
2. **Step 2 — подъём:** `docker compose up -d db web worker`; ждать `healthy` у db и web; в существующем TLS-прокси — маршрут
   `n6b.194.85.249.105.sslip.io → web:3000` через внешнюю сеть `${PROXY_NETWORK}`.
3. **Step 3 — проверка по ВЫДАННОМУ адресу:** `bash scripts/check-cjm.sh https://n6b.194.85.249.105.sslip.io` (регистрация →
   URL → ответ со ссылкой → код вставки → вопрос с чужого origin → клик бейджа → лендинг с `ref`); затем проверка виджета на
   странице ЧУЖОГО origin с CSP и враждебным CSS — квитанция в `docs/embed-contract.md`.

### Rollback Procedure

1. `docker compose stop web worker`.
2. Вернуть предыдущие теги образов в `.env` (`N6B_WEB_TAG`, `N6B_WORKER_TAG`), `docker compose up -d web worker`.
3. Миграции только расширяющие (новые колонки/таблицы, без удаления) — откат приложения не требует отката схемы; дамп БД
   перед миграцией: `docker compose exec db pg_dump -Fc > backup-<дата>.dump` (файл вне репозитория).

## CI/CD

| Stage | Команды | Условие перехода |
|---|---|---|
| test | `npm test`, `npm run lint`, `npm run typecheck` | всё зелёное |
| build | `npm run build`, `docker compose build` | образы собраны, бандл виджета ≤ 30 KB gzip (скрипт размера) |
| deploy | `deploy.sh` (ssh на VPS: pull, migrate, up, check-cjm) | ручной запуск владельцем |

## Monitoring

| Metric | Threshold | Alert | Реально в MVP |
|---|---|---|---|
| Response time p99 | > 500ms | PagerDuty | для кабинета; канал в MVP — журнал + `/admin/metrics`, PagerDuty не подключён |
| Error rate | > 1% | Slack | канал в MVP — журнал; Slack не подключён |
| CPU usage | > 80% | Email | `docker stats`, вручную; почты нет |
| Ответ посетителю p95 | > 6 с | `/admin/metrics` | NFR-n6b-1 |
| Отказы модели (`model_call_log.state=failed`) | > 5% за час | `/admin/metrics` | причина «сервис ответа недоступен» |
| Расход на сутки (попытки, токены) | ≥ 80% любого глобального предела | `/admin/metrics` + https://platform.openai.com/usage | ADR-010 |
| Задачи `failed` | > 20% за сутки | `/admin/metrics` | разбор причин |
| Доля `outcome=limited` среди вопросов виджета и демо | > 5 % за сутки при ≥ 100 вопросах | `/admin/metrics` | реакция: переход с единицы /24 на сессионную единицу посетителя новым ADR (ADR-010, M-4) |
| Доля «не знаю» среди вопросов посетителей | рост > 2× к результату калибровки | `/admin/metrics` | реакция: повторить калибровку SC-US-006-4 |
| Внешние виджеты с ≥1 вопросом (FR-n6b-15) | цель 15 за неделю | `/admin/metrics` после «перепроверить страницы» | PD-METRIC-001; в отчёт — только строки с `page_verified_at` |

## Logging

- Уровни: `error` (исключения, отказы провайдера), `warn` (пределы, 403 origin, отказ задачи), `info` (старт, публикация,
  передача аккаунта). Тексты вопросов в журнал приложения НЕ пишутся — только в `question_log`.
- Хранение: `question_log` 30 дней (уборщик, NFR-n6b-4); журналы контейнеров — `json-file` с ротацией `max-size=10m`,
  `max-file=3`.
- Агрегация: `docker compose logs`; централизованного сбора в MVP нет.

## Handoff Checklists

**Development:** доступ к ветке `feature/06b-rag-class` · окружение: Node 22, Docker Compose, `.env` по `.env.example` (секреты
не коммитятся) · правила ревью: Codex — ревью кода фич (профиль прогона), Claude Opus — валидатор документов.

**QA:** тестовый стек `name: n6b-test` · тестовые данные: тестовый сайт + PDF «Прайс» из фикстур, калибровочный набор 30
вопросов · баг-репорты: `docs/features/<фича>/review-report.md`.

**Operations:** доступ к VPS 194.85.249.105 (SSH владельца) · runbook: этот файл, раздел Deployment/Rollback · эскалация —
владелец; внимание: сервер закрыт из части сетей Москвы (заметка памяти от 29.09) — проверять стенд из нескольких сетей.

## Трассировка

PD-METRIC-001 → Monitoring (внешние виджеты) · PD-INSIGHT-003 → Monitoring (расход) · ADR-005 → Rollback (повтор задач
продолжает) · ADR-010 → Pre-Deployment (пределы) · ADR-014 → Deployment Step 2 (маршрут через существующий прокси).
