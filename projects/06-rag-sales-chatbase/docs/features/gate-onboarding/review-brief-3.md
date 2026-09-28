# Постановка узкого ревью (после второго круга исправлений): `gate-onboarding`

Только чтение. Рабочий каталог — `projects/06-rag-sales-chatbase`. Предмет — ТОЛЬКО последняя правка:
`git diff 642f57ae 406ca76c -- packages/db/migrations/011_gate_onboarding.sql tests/gate-onboarding.integration.test.ts scripts/test-gate-onboarding-mutations.mjs`.
Она закрывает находки круга 2 (раздел «Круг 2» в `docs/features/gate-onboarding/08_review.md`): BEFORE-триггер
`bot_verified_clears_reset` стирает пометку снятия при любой поставленной отметке (совместимость с SQL прежнего
приложения), конкурентный тест ждёт блокировку через `pg_blocking_pids` и делает `ROLLBACK` при аварии.

Проверь: закрыты ли обе находки круга 2; не ломает ли BEFORE-триггер на `bot` (INSERT OR UPDATE, каждая строка) иные пути
записи строки бота и триггер снятия 004/011; нет ли в тесте ложного зелёного или нестабильности. Исправлений после этого
ревью не будет — нужна оценка остатка.

Формат: первая строка `Оценка: A|B|C|D`, затем `- [blocker|high|medium|low] путь:строка — что — почему — как исправить`,
в конце `НЕ проверил: …`.
