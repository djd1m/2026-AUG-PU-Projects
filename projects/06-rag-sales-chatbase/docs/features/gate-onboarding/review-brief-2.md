# Постановка повторного ревью (круг 2): `gate-onboarding`

Только чтение. Рабочий каталог — `projects/06-rag-sales-chatbase`. Предмет — ТОЛЬКО исправления круга 1:
`git diff 147b2497 642f57ae -- . ':!tests/artifacts'`. Первое ревью и что сделано по находкам — `docs/features/gate-onboarding/08_review.md`.

Проверь: закрыты ли три находки круга 1; не внесли ли исправления новых дефектов — особенно `CHECK bot_verified_or_reset`
в `packages/db/migrations/011_gate_onboarding.sql` (может ли он уронить существующий путь записи: `setAnswersVerified`,
триггер, стирание аккаунта, операторские скрипты; безопасен ли на живой БД), 422 до записи заглушки в
`apps/web/src/server/widget-ask-handler.ts`, `apps/web/src/lib/verify-request.ts` и его использование в двух экранах,
конкурентный тест в `tests/gate-onboarding.integration.test.ts` (может ли он быть нестабильным или зелёным ложно).
Принятый остаток по находке 2 описан в 08 — оцени, приемлем ли он.

Формат: первая строка `Оценка: A|B|C|D` (A — замечаний нет; B — только low/medium; C — есть high; D — несколько high
или blocker), затем `- [blocker|high|medium|low] путь:строка — что — почему — как исправить`, в конце `НЕ проверил: …`.
