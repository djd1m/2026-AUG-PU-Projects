# N7 F01 AUTH UI E2E receipt

RUN_ID: 20261002T192500Z-f01
WORK_UNIT_ID: n7-f01-ui-sol
Attempt-ID: ui-1
Source-Revision: e557c73bd87495ad099e66981c2a7ef4e61f713f
Build-Revision: f32ab9bedd7658a6afffcd2890f34950af6aa0bf
Launch-SHA256: d319179db82480fca63a3c3bef5faf8bc4f8a44433d0f7128174c680c19c1429
Trace-Path: /tmp/n7-f01-ui/projects/07-cold-email-warmup/docs/telemetry/features/20261002T192500Z-f01/ui-sol-receipt.md
Started-At: 2026-10-02T19:54:37.643213+00:00
Finished-At: 2026-10-02T20:03:48.642315+00:00
Verdict: PASS — mandatory bounded AUTH browser gate; parent acceptance pending.

Профиль: compact-quality-first-v2. Requested model/effort: gpt-6.1-sol/high.
Actual model/effort: null/null; host proof не предоставлен, launch request не является
доказательством фактической модели. Usage/tokens/cost: null; cost_basis unavailable;
active_wall_ms null (нет измеренных интервалов). Elapsed до receipt: 550.999s,
включая чтение правил, диагностику fixtures и cleanup. Receipt target540s пропущен
на11s: подробная финализация evidence/receipt завершилась на551s; hard600s сохранён.
Это измеренное отклонение расписания, parent должен учитывать его при приёмке.
Без spawn, fallback модели
не подтверждён. Экономия не установлена; baseline отсутствует.

## Источник, готовность и runtime

Прочитаны корневой и N7 CLAUDE.md, применимые локальные правила, model-routing,
telemetry и companion E2E readiness. Mechanical ROUTE дважды exit0, S нижняя
граница; сохранён inherited auth/security контекст F01. Только тестовый скрипт,
UI evidence и данный receipt принадлежат этому writer. Принятый review:
docs/features/f01-foundation-auth/review-report.md, ACCEPT code, browser был pending.

Read-only readiness непосредственно перед браузерными запусками: ready.
Все19 SHA256 из existing evidence/build-inputs.json совпали с worktree; source/build
различаются только N7 docs/telemetry. Образ приложения:
sha256:6a77e7410ef8d66f032f6cbbbf1afd2631b9c53d033ebbc403b075b016db465f;
input snapshot 9596eaea1f3da13e9f5aba7ea24b4d0afea4f9cd2e040485b822fdeb8df00d7c.
Existing n7f01-web-1 и n7f01-db-1 healthy, Node22.20.0, PostgreSQL16.10,
own n7f01_network, app host binding127.0.0.1:18701, DB host port отсутствует.
Shared codex-ui-playwright: Playwright1.63.0, browser Node24.20.0,
фактический Chromium153.0.8010.12. Детали container IDs/ports/versions и входов:
[evidence/ui-auth/preflight.json](evidence/ui-auth/preflight.json).

## Реальный браузерный результат

[checks.json](evidence/ui-auth/checks.json): exit0, PASS 1440x900 и390x900,
30 проверок на каждый viewport. Пройдены связанные labels, видимый keyboard focus,
Tab email→password→login→register и keyboard-only Enter registration на обеих ширинах;
нет horizontal overflow у auth/dashboard/logout. Созданы ровно2 уникальных аккаунта
@example.test с синтетическими паролями только в памяти; выполнены2 browser login.

Register201 создаёт пригодную API identity; reload сохраняет те же account/tenant
и authenticated UI. Logout→reload даёт401 и unauthenticated UI. Копия старой cookie
в отдельном собственном контексте отвергнута401. Login200 возвращает прежнюю identity,
последующий logout→reload снова unauthenticated. Registration UI явно подтверждает,
что sending consent не предоставлен; все mutating requests только register/login/logout,
нет sending/consent/network вызовов вне локального приложения. F01 не реализует
consent storage (F02+), поэтому UI не доказывает будущую реализацию consent.

На каждом viewport: unexpected console errors0, pageerrors0, request failures0;
по6 intentional anonymous /api/auth/me401 учтены отдельно; favicon404 фактически0.
Скриншоты по каждой ширине:
[1440 auth](evidence/ui-auth/1440-auth.png),
[1440 dashboard](evidence/ui-auth/1440-dashboard.png),
[1440 logout](evidence/ui-auth/1440-logout.png),
[390 auth](evidence/ui-auth/390-auth.png),
[390 dashboard](evidence/ui-auth/390-dashboard.png),
[390 logout](evidence/ui-auth/390-logout.png).
Dashboard — authenticated F01 shell, полный кабинет F06 вне scope.
Визуально просмотрены390-auth и1440-dashboard; credentials на screenshots отсутствуют.

## Выполненные команды, неуспехи и границы

Versioned test: scripts/ui/f01-auth.mjs. Команда:
`docker exec -e N7_UI_EVIDENCE=/opt/browser/n7-f01-ui-20261002/evidence codex-ui-playwright node /opt/browser/n7-f01-ui-20261002/f01-auth.mjs`.
[commands.json](evidence/ui-auth/commands.json) сохраняет команды/exit и evidence.
Node syntax check exit0; diff whitespace check exit0. Preflight guard mutation19→18
даёт ожидаемый exit1 до запуска bridge/browser; assertion guard verified exit0
([guard-mutation.json](evidence/ui-auth/guard-mutation.json)).

Два ранних fixture failures сохранены, не объявлены pass: supplied WS /inside
возвращал HTTP400, exit1 до контекстов/аккаунтов
([connect-failure.json](evidence/ui-auth/connect-failure.json)); existing run-server
принимает WS root `/`, конфигурация сервера не менялась. Второй exit1: networkidle
lifecycle wait initial navigation не завершился за10s, до аккаунтов; page/auth.js200
и anonymousme401 уже получены
([navigation-failure.json](evidence/ui-auth/navigation-failure.json)). Финальный
fixture использует domcontentloaded плюс реальные явные DOM/API assertions и прошёл.
Concrete product UI bug не установлен; product bytes не менялись.

Existing unit/PG/build/typecheck/lint/application checks НЕ запускались повторно.
Не заявляется новая проверка всех шести code AC, expiry/inactive/tenant/rate-policy;
их recorded evidence и independent review остаются отдельными воротами. Этот результат
относится к заданному source/build и фактически выполненному AUTH браузерному набору.

## Cleanup и передача

Порт18701 в browser container проверен свободным до fixture. Temporary Node HTTP
bridge только127.0.0.1:18701→n7f01-web-1:3000 сохранял Host/Origin/browser headers;
нет header rewriting, proxy/config/origin изменений, cookie/password/auth logs.
Bridge, upstream sockets и собственные contexts закрыты после каждого запуска;
итоговый порт снова свободен. Shared browser не останавливался, чужие contexts
и сети не менялись. Own n7f01_network attachment добавлен после проверки membership,
затем снят; исходная codex-ui-browser сеть сохранена. Unique browser fixture directory
/opt/browser/n7-f01-ui-20261002 удалён после копирования evidence.
[cleanup.json](evidence/ui-auth/cleanup.json),
[network-fixture.json](evidence/ui-auth/network-fixture.json).

Два synthetic local account fixtures, revoked sessions и реальные rate buckets
оставлены в DB; truncation/rate bypass не применялись. Нет host browser install,
paid calls, real mail, deploy, keyfile/env reads, nested flock или shared config edits.
Parent wrapper владеет /tmp/codex-ui-e2e.lock. Caller launch/manifest неизменны
и не включаются в writer commit. Все19 product input hashes повторно совпали после
проверок. Parent inspection/acceptance pending; F01/MVP done и roadmap не изменены.
Телеметрия attempt: [work-record.json](evidence/ui-auth/work-record.json).

Status: completed
