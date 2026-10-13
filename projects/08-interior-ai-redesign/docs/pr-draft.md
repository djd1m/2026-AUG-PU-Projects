# feat(08): RoomKind с приватным redesign pipeline и Replicate adapter

RoomKind реализует регистрацию, приватную загрузку, задания с кредитами/лимитами, comparison/gallery, hosted payment adapter и отдельное согласие на публикацию. Replicate добавлен как явно выбранный pinned режим: durable send-CAS, recovery без повторного create, private media/evidence, cleanup и закрытые budget/quality gates.

Проверки:480 non-PG TAP +163 PostgreSQL TAP +5 Python, lint/build; обязательные mutation proofs; независимая Astra review и конкретные closure. Actual Docker browser52+2 при1440/390; restore23 таблиц и28 приватных файлов, включая hosted evidence. История failures/повторов и source/image binding сохранена в docs/features/f07-replicate/local-acceptance.md.

Внешний расход0; live Replicate/payment/deployment не запускались. Реальные геометрия/warm latency/license/privacy/billing approvals остаются pending. Это draft software delivery, не production-ready MVP.

Создание draft PR 2026-10-03T18:18:25.987299+00:00 отклонено GitHub API403: Resource not accessible by integration. PR не создан. [Открыть сравнение ветки](https://github.com/djd1m/2026-AUG-PU-Projects/compare/claude/install-npm-packages-n7l3m5...feature/08-interior-ai?expand=1). Exact receipt: docs/telemetry/n8-20261002-1740/replicate-final-pr-attempt.json.
