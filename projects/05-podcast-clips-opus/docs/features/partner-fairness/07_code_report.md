# partner-fairness — отчёт Codex

Телеметрия хранится здесь: запрет менять остальные docs имеет приоритет.

```json
{
  "run_id": "20260924T173517Z-partner-fairness",
  "started_at": "2026-09-24T17:35:17.884295+00:00",
  "baseline_revision": "ae8d42d2b5a1d3ec95105d74435f5564f2b57621",
  "profile": "compact-quality-first-v2",
  "tier": "XL",
  "mechanical_tier": "L (exit 1)",
  "status": "implementation_completed_pending_coordinator_validation",
  "actual_model": null,
  "usage": null,
  "missing_data": [
    "Exact model ID, effort and usage not exposed; current Codex executor",
    "Initial instruction-reading duration not measured"
  ],
  "scope": "RT-002 / RT-009 per validated brief",
  "approval": "User explicitly requests implementation of validated brief; no commit",
  "preflight": "not_applicable: no E2E, Docker checks delegated to coordinator by brief",
  "events": [
    {
      "stage": "IMPLEMENT",
      "timestamp": "2026-09-24T17:35:17.889421+00:00",
      "reason": "PLAN / VALIDATE supplied in brief; invariant change authorized"
    },
    {
      "stage": "IMPLEMENT",
      "status": "completed",
      "timestamp": "2026-09-24T17:41:09.731140+00:00",
      "checks": "39 focused tests pass; 29 PostgreSQL tests skipped; 10 unit mutations red/green; typecheck/lint pass"
    },
    {
      "stage": "INTEGRATE",
      "status": "running",
      "timestamp": "2026-09-24T17:41:09.731180+00:00",
      "reason": "Full local suite and production build; Anthropic review handed to coordinator"
    },
    {
      "stage": "INTEGRATE",
      "timestamp": "2026-09-24T17:44:59.812605+00:00",
      "status": "completed",
      "checks": "full suite exit 0: 542 passed / 155 skipped; build, typecheck, lint exit 0; review/integration handed off"
    }
  ],
  "ended_at": "2026-09-24T17:44:59.812605+00:00",
  "model_family": "OpenAI GPT-6 / Codex (session instructions; exact model ID unavailable)",
  "actual_effort": null,
  "requested_model": "current session",
  "fallback_reason": "No model switch; Anthropic review unavailable and delegated to coordinator",
  "elapsed_wall_ms": 581928,
  "active_wall_ms": null,
  "cost": null,
  "telemetry_status": "partial",
  "comparison_id": null,
  "final_revision": "uncommitted; tests/artifacts/partner-fairness/source-manifest.json",
  "source_manifest_sha256": "138a2da312762d60edc855d6090ec14078a125691cc661780250575261f172b3"
}
```

## Реализация

Выполнен приоритетный раздел «ОБЯЗАТЕЛЬНЫЕ правки после VALIDATE» брифа.

- `packages/db/migrations/016_partner_fairness.sql`: поля разблокировки, nullable FK с `ON DELETE SET NULL`, замена именованного CHECK статуса и защитный CHECK для NULL. Порядок ALTER сохранён; 001–015 не менялись.
- `apps/web/src/server/partner.ts`: `count(DISTINCT account_id)`, прежние 50/10 минут, `unblocked_at` читается под прежним блокирующим SELECT. Значение из заблокированной строки передаётся в `$4`, SQL-псевдоним `c` позволяет вычислить требуемый `GREATEST`. Терминальный `partner_deleted` проверяется первым в `replacementAllowed` и исключён условием UPDATE. Dashboard сериализует дату в `string | null`.
- `packages/db/scripts/partner-code-unblock.mjs`: экспорт `unblockPartnerCode(pool, code, reason, now)`, один условный UPDATE RETURNING; trim, 1–500 символов, обе причины блокировки. CLI: успех 0, некорректный запрос/активный/отсутствующий код 1, отсутствующий DATABASE_URL 2. Причина видна партнёру; не включать чужие адреса/IP.
- `apps/web/src/server/retention.ts`: чужие атрибуции обновляются до удаления собственных атрибуций и кодов; стираются `partner_code_id` и `reject_reason`, сохраняются остальные поля, включая `activated_at`.
- `PartnerPanel.tsx`: уведомление активного разблокированного кода, дата Europe/Moscow, текстовое React-экранирование причины, словарь четвёртого статуса.

Команда оператора после применения миграции и сборки образа:

```bash
docker compose --project-directory . --env-file .env exec web node packages/db/scripts/partner-code-unblock.mjs <код> "<причина>"
```

Размещение в образе подтверждено чтением `Dockerfile`: цель `web` копирует `/app/packages`; `.dockerignore` не исключает скрипт. Сам образ здесь не собирался.

## Проверки и свидетельства

Свидетельства: `tests/artifacts/partner-fairness/`. `source-manifest.json` содержит SHA-256 изменённых исходников и тестов; исходная ревизия указана в телеметрии выше.

- Затронутые наборы (`npx vitest run tests/partner.test.ts tests/partner-unblock.test.ts tests/enums.test.ts tests/partner.integration.test.ts tests/retention.integration.test.ts`): **39 passed, 29 skipped**, exit 0. Пропуски — PostgreSQL, это не полный интеграционный успех.
- `npm test`: **542 passed, 155 skipped, 0 failed**, 68 passed / 19 skipped файлов, exit 0; длительность самого раннера 272,49 с. Пропуски: PostgreSQL/Redis/MinIO и teaser-media (локальный ffmpeg < 6.1). Полный лог — `tests/artifacts/partner-fairness/full.log`.
- `npm run typecheck`, дополнительный `tsc --noEmit -p tests/tsconfig.json`, `npm run lint`, `npm run build`: exit 0. Сборка Next.js и preflight завершилась.
- `git diff --check` и синтаксис трёх изменённых/новых `.mjs`: exit 0.
- `node scripts/test-partner-mutations.mjs`: **10 unit red=1 / green=0**, итоговый exit 2 из-за недоступных интеграций. Среди новых: запрет замены `partner_deleted`, снятие валидации причины, устаревший CHECK из 001 при четырёх значениях enums. Исправлен прежний несовпадающий фильтр названия теста `burst-50`.
- Мутации DISTINCT→count(*), удаление границы `unblocked_at`, снятие NULL-CHECK, интеграционный запрет повторной атрибуции: добавлены; PostgreSQL-прогон НЕ ВЫПОЛНЕН. В артефактах обе фазы отмечены NOT RUN.
- `node scripts/test-retention-mutations.mjs partner-deleted-preserved`: exit 2, PostgreSQL недоступен; мутация UPDATE→DELETE и обе квитанции NOT RUN находятся в `tests/artifacts/retention-and-erasure/mutations-retry-partner-deleted-preserved/`.
- `bash scripts/check-env-wiring.sh`: exit 2, compose config недоступен. Docker/E2E/живой CJM не запускались.

Новые PostgreSQL-сценарии: 17 аккаунтов × cookie→guest_link→explicit = 51 событие без блокировки; границы 49/50; 60 параллельных запросов 55 аккаунтов с ровно 50 успехами, остальные 409/422 code_blocked, единственное изменение blocked_at; 50 событий до разблокировки + 1 после; повторная блокировка на 50 новых аккаунтах; ручная разблокировка и ошибки; терминальный статус без изменения строки; pg_constraint — один CHECK только на status и FK SET NULL; fail-closed прямое удаление кода; удаление партнёра с тремя приглашёнными и собственной атрибуцией.

Один локальный тест сначала упал на захвате stderr дочернего CLI. Прямой запуск вывел правильное сообщение; тест переведён на файловые дескрипторы, как существующий `tests/config.test.ts`. Исправленная проверка прошла. Это исправление тестовой инфраструктуры, не дефект CLI.

## Закрытые наборы и числа для координатора

- `packages/shared/src/enums.ts`: `ATTRIBUTION_STATUS`, `AttributionStatus`, `readAttributionStatus`, `SQL_ENUMS['attribution.status']`.
- `apps/web/src/server/partner.ts`: тип Attribution, первая проверка replacementAllowed, SQL NOT IN; `apps/web/src/app/dashboard/PartnerPanel.tsx`: словарь подписей статусов.
- `packages/db/migrations/001_init.sql`: исторический CHECK из трёх значений, оставлен неизменным. Актуальное определение — 016.
- `tests/enums.test.ts`: теперь последнее определение CHECK для каждой table.column по всем упорядоченным миграциям; явные четыре значения, fail-closed и мутация возврата к трём. Особого исключения для 013 больше нет.
- `tests/partner.test.ts`: поведение terminal, 50-й успех, отображение статусов и уведомления; `tests/partner.integration.test.ts`: 17/51, 49/50, 60/55, окно 10 минут и pg_constraint.
- `tests/retention.integration.test.ts`: три исходных статуса — набор входных данных pending/activated/rejected; ожидаются три сохранённые строки partner_deleted. Это не утверждение, что закрытый набор содержит три значения.
- `scripts/test-partner-mutations.mjs`: актуальные якоря порога, SQL, terminal, причины и CHECK; `scripts/test-retention-mutations.mjs`: сохранение атрибуций.

Других тестовых утверждений «ATTRIBUTION_STATUS ровно 3» поиск по apps/packages/tests не обнаружил. Канон и остальные документы не редактировались: обновление §4/§7 остаётся координатору по брифу.

## Передача

Кодирование завершено; это не приёмка PostgreSQL-поведения и не независимое REVIEW. По OWN-002 ревью должно выполнить семейство Anthropic, недоступное здесь; подмена самопроверкой не выполнялась. Координатору остаются полный прогон в пересобранном Docker-образе, интеграционные мутации и cross-family review. Коммитов и развёртывания нет.

Профиль: `compact-quality-first-v2`, фактический исполнитель — текущая сессия OpenAI/Codex, без дочерних агентов и переключений моделей. Точный ID модели, effort, токены и стоимость недоступны (`null`); экономия пока не установлена. Измеренный интервал от записи прогона до отчёта: 581.9 с. Начальное чтение инструкций было до записи и не измерено; полная длительность задачи и active time неизвестны. Телеметрия встроена в этот отчёт вместо отдельных docs/telemetry файлов, чтобы соблюсти явную границу брифа.

Status: completed
