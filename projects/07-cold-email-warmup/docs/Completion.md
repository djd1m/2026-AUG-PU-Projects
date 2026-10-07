# Completion — Грелка (N7)

Дата: 2026-10-07. Деплой-контур наследует курсовые уроки (N4–N6): Docker Compose на VPS.

## Deployment Plan

### Pre-Deployment checklist

- Все тесты зелёные: `npm test` (unit+интеграция) и E2E-профиль Playwright зелёный.
- Безопасность: аудит логов (нет plaintext секретов), облачный master key в secrets-менеджере VPS
  (env, не репо), webhook-ключи провайдеров актуальны.
- Документы обновлены (Specification/Architecture/ADR), телеметрия прогона завершена.
- Rollback протестирован на стенде: откат compose-стека и БД (pg_dump → restore) на предыдущую
  версию образа.

### Deployment Sequence

1. `docker compose pull && docker compose up -d` — api/web/worker-* + postgres + redis + caddy;
  healthz-проверки каждого контейнера (/healthz → 200).
2. Миграции `packages/db`: `npm run migrate` (транзакционные, forward-only), сид seed-ящиков
  dogfooding (3 домена × 2–3 ящика).
3. Скрипт post-check: DNS-проверка доменов сид, «Channel smoke»: тестовое прогрев-письмо на
  dogfood-ящик, вебхук-эндпойнты читают заголовки (curl-санити).

### Rollback Procedure

`docker compose down && git checkout <prev-tag> && docker compose up -d` + восстановление дампа БД
(если миграция была необратимой); платёжные вебхуки в период отката — сохраняются и переигрываются
по журналу (дедуп по payload_id делает это безопасно).

## CI/CD

| Стадия | Команды | Гейт |
|---|---|---|
| test | `npm ci && npm run lint && npm test` | зелёные юнит+интеграция (Testcontainers) |
| build | `npm run build` (web, api) + docker build multi-stage | образы тегируются git-sha |
| deploy | `deploy.sh`: push образов, `docker compose up -d --force-recreate`, миграции, smoke | healthz + smoke-письмо |

## Monitoring

| Metric | Порог | Действие |
|---|---|---|
| Response time p99 (API) | > 500 мс | алерт (панель/канал), инцидент-процедура |
| Доля неудач queue jobs | > 1 % | Slack-канал.ops + смотри diag |
| CPU usage | > 80 % 15 мин | пользователя уведомляем о задержках, авто-скейл воркеров нет в MVP |
| Спам-рейт платформы | > 0,3 % | мгновенная проверка: связаны с кампаниями; автопауза прорабатывается (FR-SEC-003) |
| Queue backlog | > 5000 задач 5 мин | масштаб worker-реплик вручную |
| SMTP failures по ящику | 3 подряд | ящик → paused + diag |

Источники значений: наша БД / очередь Redis / системные метрики контейнеров (каждое —
проверяемое измерение, «из аналитики» не написано).

## Logging

pino в JSON stdout; уровни: error (нужен action), warn (ячщик diag), info (жизненный цикл jobs),
debug (выключен по default). Retention 30 дней (log-rotation Docker). Агрегация — Loki (v1.0),
в MVP — journalctl/файл. В логи ЗАПРЕЩЕНО: plaintext секретов, адреса получателей в error-level
(только id).

## Handoff

**Development:** репо = этот worktree, ветка kilocode-07-cold-email-warmup-replicate; env
шаблон — `.env.example`; спецификация — Specification.md; доноры — Architecture §Reuse.
**QA:** стенд-профиль compose.test.yml; fake-SMTP/IMAP контейнеры; баги — c ID сценария SC-US-*;
воспроизводим с curl команды.
**Operations:** runbook: деплой (выше), rollback (выше), ночные пересчёты health (cron),
реакции на алерты (таблица Monitoring); доступ к VPS — у владельца.
