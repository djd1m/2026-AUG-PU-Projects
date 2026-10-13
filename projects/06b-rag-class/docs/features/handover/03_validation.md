# F14 — отдельная валидация перед реализацией

Run-ID: 20261003T042338Z-handover; Work-Unit-ID: handover-implementation; Attempt-ID: implementation-1.
Source-Revision: 3890760ff1ea36440e938db70c58e21754f44aa4; Build-Revision: none.
Launch-SHA256: f2438a6b6361424078d9f65a57204a0123c74419b3417e04c48523c9233b5f84.

Вердикт: READY FOR BOUNDED IMPLEMENTATION. Отдельный проход относительно автора Astra PLAN,
выполненный до изменений продукта; этот валидатор затем является автором кода и не заменяет независимое REVIEW.
Requested model: gpt-6.1-sol/high; actual model/effort проверяет координатор по native metadata.

Прочитаны Specification FR-n6b-14, SC-US-014-1…4, Pseudocode Handover и API contracts,
Architecture Data/Security, ADR-008, Refinement, собственная schema/service grants, auth/store,
F13 studio/tenant и планы 01/02. Смена аккаунта без переноса строк соответствует ADR-008.
Блокирующих противоречий не обнаружено. Уточнения короткого Pseudocode обоснованы:
bcrypt и session material до TX; accounts UUID ASC перед token; UNCLAIMED после lock;
clock_timestamp после ожиданий и последняя token guard-запись с исключением для rollback;
23505 только account_email_key означает 409. Несколько ссылок до claim допустимы, после claim
остальные 410, включая keep=true; новая выдача claimed аккаунту запрещена.

Повторный mechanical ROUTE по handover DB/handler/API: M, exit 0; substantive ROUTE XL
из-за ownership/credentials boundary. Полные XL gates не понижаются. Применимо уже предоставленное
разрешение продолжать MVP через планы. Scope: точный allowlist 01_plan + 03_validation по launch brief.
No children/Docker/network/ports/deps/schema/grants/manifests/commit/push. run/events/work-record/08_review
принадлежат координатору. E2E preflight not_applicable для автора: нет runtime запуска/build.

UI читает безопасный eligibility список ID через service helper, поскольку tenant не видит password_hash;
никакие credentials в браузер не передаются. Повторная серверная проверка после locks остаётся источником истины.
Матрица 02_validation сохраняется полностью. Локальный автор запускает typecheck и relevant unit suites;
PG race/rollback/family/cap tests и critical mutation script пишет для координатора, реальные PG результаты
не подменяет SQL mock. Docker UI/all PG/full build/review остаются явными pending до запуска координатором.
