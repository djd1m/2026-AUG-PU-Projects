# Результат crawl-site

Профиль M: свежая Фаза 1 (30.09.2026), содержательный L → M; механический ROUTE S — нижняя граница.
Исполнитель: gpt-6.1-sol high, подтверждён CLI rollout у координатора; попытка прервана по лимиту 1500 с до коммита. Координатор завершил проверку и интеграцию; его фактическая модель не измерена (null). Стоимость и полный usage неизвестны (null).
RUN_ID 20261002T172816Z-crawl-site, WORK_UNIT_ID crawl-site-implementation; база eec2b434, зависимости 2e5afaa0.

Реализованы POST /api/bots и форма имени/URL, атомарная постановка bot/source/job под RLS;
обе ручки проверяют DNS, чужой бот возвращает 404 до DNS. Воркер подключает site extractor к существующей
нарезке и платной двери эмбеддингов; общий transport закрепляет проверенный IP, сохраняет исходный Host/TLS SNI,
ограничивает DNS/connect/body дедлайном и размером. Обход применяет robots к целям редиректа,
приоритизирует sitemap, учитывает redirect/nonHTML в лимите и исключает повтор robots/sitemap по ссылкам.
Документы обновляются короткой транзакцией под running/fence/account/source, ID и кэш неизменённого текста сохраняются.
202 с site_url по SC-US-002-1 имеет приоритет над старой таблицей 201; без site_url возвращается 201.

| AC | Файл теста и название | Результат |
|---|---|---|
| 1 | apps/web/tests/int/crawl-bots.int.test.ts: «SC-US-002-1: 202 bot_id/public_id/job_id…», «SC-US-002-3: обе ручки…», «ошибка постановки job откатывает…»; jobs.int: 20 конкурентных POST | pass |
| 2 | packages/rag/tests/unit/site-safety.test.ts: «IP закреплён, DNS один раз, оригинальный Host…», «лимит полного тела и 15s hard timeout…», перечень IPv4/IPv6 и mixed DNS | pass; реальные локальные сокеты, без внешнего HTTP |
| 3 | services/worker/tests/unit/crawl-rules.test.ts: UA/longest/*/$/проценты, XML/блочный текст; tests/int/crawl.int.test.ts: sitemap/циклы/повтор, robots отказ, Free100, redirects, noHTML, ceiling/signal, shared lease | pass; последнее уточнение guard — отдельный лог |
| 4 | 01_plan.md и данный отчёт используют существующие Specification/Pseudocode/Architecture/Refinement/ADR013 | выполнено без новой полной Phase 1 |
| 5 | full-run.txt: typecheck + 319 unit/19 файлов + 159 integration/15 файлов + build, exit=0 | pass Node22 Docker |
| 6 | dz-verify.txt: 15/15 skills valid, target codex | pass |
| 7 | apps/web/tests/unit/create-bot-ui.test.ts: 202/job_id, server/network error, required/labels/pending/aria-live; Next build | fixtures/build pass; Playwright E2E pending |

Последняя правка дедупликации проверена полным crawl-набором (7 pass) и typecheck/build, exit=0.
Координатор повторил обязательную полную регрессию: production-код дедупликации изменён после первого зелёного набора. Все 20 текущих source/test файлов совпали с неизменяемым runner image; tested-source-final.json и full-run-final.txt exit=0.
Мутации tests/artifacts/crawl-site/mutations.mjs: отключение общего DNS-фильтра даёт red, восстановление — green;
отключение write guard даёт red, восстановление — green. Логи содержат assertion failures, а не ошибки компиляции.
Раздельное доказательство stale/closed и итоговые числа — closed-stale-proof.txt и integration-receipt.md.

Test stack n6b-f05-crawl: фактический config без ports, cpu=2, PortBindings пусты.
Root check-port-conflicts и project check-ports запускались ДО контейнеров, но production compose отсутствует
обязательное окружение: проверка production НЕ выполнена, не PASS. Test stack проверен отдельно.
Случайные пароли хранились только в /tmp, значения не выводились; cleanup — cleanup.txt.

Артефакты: tests/artifacts/crawl-site/{full-run,final-typecheck-build,mutations-and-final-crawl,closed-stale-proof}.txt,
source-hashes.json, build-identity.txt; итоговая ревизия и длительность в integration-receipt.md.
Телеметрия остаётся у integration owner; ожидаемый путь docs/telemetry/p-replicator/20261002T172816Z-crawl-site/,
в этом worktree такой записи нет, исполнитель по заданию её не создавал и не изменял.
Playwright endpoint появился после исходной проверки (codex-ui-playwright, loopback :19320), однако целевой URL UI и
согласованный путь подключения не получены; readiness blocked, browser pass не заявлен. См. playwright-readiness.json.
Независимое Astra review выполняет следующий исполнитель; собственного review-report нет. Push/PR/deploy не выполнялись.


## Ограниченная коррекция R1–R4, correction-1 (02.10.2026)

Исправлены только worker crawl-модули и необходимые тесты: robots использует поиск литералов без
экспоненциального backtracking; локальные ошибки размера/UnsafeSite/редиректов пропускают страницу,
сохраняя seen/лимит/паузы и распространение lease/cancel/ceiling; nav/footer ссылки собираются до
удаления текста; типизированные robots/no-HTML отказы extractor возвращает как failed JobOutcome.
Произвольные внутренние исключения сохраняют общий TEXT_INTERNAL через существующий runOnce.
Добавлен тест реального runOnce → index_job → GET job API для robots503/network/emptyHTML/internal;
он ещё НЕ выполнен. Исходный обзор и исторические доказательства не изменены.

Node20 supplemental robots: исходный дефект достиг matching и остановлен внешним deadline;
восстановленный исходник прошёл adversarial/benign/UA/percent/UTF8 и heartbeat/timer ceiling.
Синтаксис шести изменённых TS-файлов проверен. Это не итоговая Node22 приёмка.
Docker socket запрещён sandbox; native node_modules пуст и offline npm ci не нашёл locked undici.
Свежие full typecheck/unit/integration/build и persisted job/API assertions остаются у координатора.
Новый Docker image не собран, commit/push/merge отсутствуют. Полная регрессия старой ревизии
и прежний UI E2E не подтверждают эту коррекцию. Профиль compact-quality-first-v2, риск M;
requested gpt-6.1-sol high, actual model/provider/effort/usage/cost = null (host metadata недоступны).
Квитанция: docs/telemetry/p-replicator/20261002T172816Z-crawl-site/evidence/correction-1-receipt.md;
source snapshot и логи: tests/artifacts/crawl-site-correction/. Телеметрия остаётся у координатора.


## Сверка координатором после полной регрессии

На момент чтения сохранённого лога: typecheck, 341 unit, 164 integration и
build прошли; `full-regression-exit=0`. Шесть исходников совпадают с сохранённым
source-snapshot. Это не повторный запуск тестов. Тестовый compose стек убран.
Исполнитель Sol6.1high подтверждён host rollout; usage сохранён отдельно.
Последующая native координация прервалась ошибкой фильтра контента до итоговой
передачи. Независимое ревью исправлений ещё не выполнено; фича не принята.
