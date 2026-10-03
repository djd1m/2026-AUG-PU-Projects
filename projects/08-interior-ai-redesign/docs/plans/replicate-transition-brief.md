# N8 — Replicate transition: задание планировщику

Источник: dfb5d80984a4fdb3ad2abf77933ddcc49a2382cf; учёт: n8-20261002-1740, продолжение 2026-10-03, новая архитектура разрешена владельцем в docs/decisions-owner.md. Это briefing, не независимый принятый план.

## ROUTE и границы

Содержательный тир XL: меняется несущая граница приватного media/inference и внешний платный API; требуется PLAN → VALIDATE → IMPLEMENT → независимый REVIEW. Механический роутер на worker/engine.py, worker/runner.py, docs/Architecture.md вернул 0/S — нижняя граница по путям; runner.py пока не существует, реальные пути уточнит планировщик. Повторная owner plan-stop внутри прямо разрешённого перехода не нужна. Внешний spend ceiling остаётся 0 до конкретного разрешённого лимита. E2E preflight сейчас not_applicable: build с новым adapter ещё не существует.

Переиспользовать существующие очередь PostgreSQL, leases/fencing/deadlines, credits/refund/hold, private media, UI и quality gate. Не перерабатывать auth/payment и не создавать новый scheduler/validator. Проверить актуальную официальную Replicate API схему, version/license, input/output retention, cancellation/idempotency и безопасную передачу media. Не считать hosted predictions идемпотентными без подтверждения; при неопределённом create-outcome не делать слепой повтор с новой оплатой.

## Требуемый результат

1. Astra high: ограниченный план/ADR/AC с точными файлами и проверками, отдельная независимая валидация при необходимости по локальному feature contract.
2. Sol6.1 high: серверный adapter и worker wiring, конфигурация fail-closed без ключа/версии/лимитов; provider token только runtime, не browser/log/Git/dz.
3. Проверки transport/status/failure/timeout/cancellation и повторов; конкурентная lease/fencing защита, отсутствие повторного credit settlement и публикации чужих результатов. Удалённые outputs копировать в private storage с ограничениями размера/типа/host и не выдавать provider URLs как private app URLs.
4. Сохранить полный релевантный regression набор, guard mutation, независимый fresh Astra review; Docker browser E2E в codex-ui-playwright после read-only source/build preflight. Resource locks /tmp/codex-heavy-build.lock и /tmp/codex-ui-e2e.lock, CPU2, только свои контейнеры.
5. Обновить Specification/Architecture/ADR/Completion/CLAUDE/walkthrough/операционные документы согласованно, без claims реального качества по mock. Частые русские commits/push feature/08-interior-ai; PR base claude/install-npm-packages-n7l3m5.
6. Подготовить ограниченный реальный quality/performance pilot: 12 разрешённых room photos ×3 styles, ≥30 реальных jobs; геометрия и E2E latency измерены, actual provider/version/request/input/output hashes, usage/cost unknown если unavailable. Запуск платных calls пока запрещён.

Каждая попытка имеет время/границы/receipt и фактический model host proof; timeout означает следующий scoped шаг, не остановку проекта. Существующий GitHub PR API403 сохраняется отдельным delivery blocker.
