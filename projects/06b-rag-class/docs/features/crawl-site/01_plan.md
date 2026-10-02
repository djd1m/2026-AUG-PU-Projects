# План crawl-site

RUN_ID: 20261002T172816Z-crawl-site; WORK_UNIT_ID: crawl-site-implementation.
База eec2b434, вход 2e5afaa0 (undici 7.30.0, cheerio 1.2.0).
Начало исполнителя 2026-10-02 17:33:13 UTC, предел 17:58:13 UTC (25 минут включая чтение и проверки).

ROUTE: механическая нижняя граница S сохранена в tests/artifacts/crawl-site/route-plan.txt.
Содержательно L: новый внешний HTTP и граница web/worker. Свежий SPARC от 30.09.2026:
Specification FR-n6b-2, SC-US-002-1/2/3; Pseudocode Create source/Crawl site;
Architecture §§ компоненты/безопасность; Refinement edge matrix; ADR-013. Явное исключение L→M.
Повтор ROUTE перед реализацией, обязательны мутации SSRF и закрытой/устаревшей аренды,
конкурентная аренда и полный typecheck/unit/integration/build Node 22 Docker.

| AC | Требование / границы | Проверка |
|---|---|---|
| 1 | SC-US-002-1/3: сессия, Origin, RLS, атомарные bot/source/job; DNS всех адресов до HTTP, чужой бот 404 до DNS | обработчики unit/int, конкурентное создание источника |
| 2 | ADR-013: публичный IP, pin соединения, Host/SNI, отмена и полный таймаут/лимит тела | safe-http unit с локальным connector |
| 3 | FR-n6b-2: robots RFC9309, sitemap→root→links, seen/редиректы/лимит, блочный текст, запись под fence | crawl unit/int, stale/closed mutation, lease regression |
| 4 | свежий SPARC используется без повторной полной Фазы 1 | этот план и 05_completion |
| 5 | полный набор Node22, уникальный compose без портов, cleanup | Docker logs и фактическая проверка PortBindings |
| 6 | dz verify --skills-dir .claude/skills --target codex | отдельный лог |
| 7 | UI fixtures + build; Playwright E2E pending до endpoint существующего контейнера | fixture и явное ограничение |

202 с site_url имеет приоритет над старой таблицей 201; без site_url допускается 201.
Один исполнитель, без делегирования, push/PR/deploy, N6 donor исключён, manifests/lock/compose/migrations/roadmap/telemetry не меняются.
Фактическая модель текущего исполнения: GPT-6 (по системным метаданным), точный backend/usage недоступны; fallback не выполнялся.
Телеметрия принадлежит integration owner, исполнитель не изменяет записи. E2E preflight not_applicable: endpoint пока отсутствует.
