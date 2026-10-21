# integration — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### NFR-integration-1
Parent source requirement: NFR-performance-1.
Начальные guardrails (предложение команды, не benchmark): ≤20 проектов/account, ≤20 refs/project, ≤200 design objects/revision, ≤200 shopping lines/budget, ≤100 revisions/project. Списки ≤50/page. Цель обычного API p95≤500ms при 10 параллельных локальных клиентах на согласованном fixture; исключены bcrypt, upload/3D parse и provider. Цель пересчёта 200 строк ≤100ms в unit benchmark; фиксировать железо/данные и фактический результат, при превышении исправлять или явно пересматривать NFR. «25 секунд» не SLA.
US-024: Как оператор, хочу воспроизводимую оценку обычного API и расчёта200 строк.
- [SC-US-024-1] Given exact build/fixture/host; When 10 clients каждый выполняет20 warm-up+100 measured GET owned project/list requests; Then nearest-rank p95≤500ms для1000 ответов, status/body проверены, ошибки/timeouts не удаляются и валят проверку.
- [SC-US-024-2] Given immutable200-line fixture с Decimal/unknown/services/delivery/reserve; When 50 warm-up+1000 measured calculations; Then nearest-rank p95≤100ms и1000 canonical result hashes равны golden; exception/missing sample валит проверку.


### AC-integration-1
Source criterion SC-US-024-1: Given exact build/fixture/host; When 10 clients каждый выполняет20 warm-up+100 measured GET owned project/list requests; Then nearest-rank p95≤500ms для1000 ответов, status/body проверены, ошибки/timeouts не удаляются и валят проверку.

### AC-integration-2
Source criterion SC-US-024-2: Given immutable200-line fixture с Decimal/unknown/services/delivery/reserve; When 50 warm-up+1000 measured calculations; Then nearest-rank p95≤100ms и1000 canonical result hashes равны golden; exception/missing sample валит проверку.


### NFR-integration-2
Parent source requirement: NFR-operations-1.
Decision: ADR-010 — границы этой способности и обязательные guards.
Изолированный compose: web+worker+Postgres, DB только expose; web bind `127.0.0.1:${N8_HTTP_PORT:-3088}` после обязательного check-port-conflicts. Никакого внешнего домена/деплоя. `/health/live` без данных, `/health/ready` проверяет DB/schema/storage и config, не вызывает платные API. Startup/worker failures fail closed. Миграции versioned, rollback тестируется на ephemeral DB; не откатывать данные без backup.
US-017: Как оператор, хочу воспроизводимую безопасную локальную поставку.
- [SC-US-017-1] Given fresh isolated env; When migrate/build/start; Then health ready, DB не имеет published ports, project data переживают restart.
- [SC-US-017-2] Given incompatible config/schema/storage; When ready/start; Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются.



### AC-integration-3
Source criterion SC-US-017-1: Given fresh isolated env; When migrate/build/start; Then health ready, DB не имеет published ports, project data переживают restart.

### AC-integration-4
Source criterion SC-US-017-2: Given incompatible config/schema/storage; When ready/start; Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются.
