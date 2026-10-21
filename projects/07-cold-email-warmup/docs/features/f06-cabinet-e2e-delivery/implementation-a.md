# F06 A — кабинет на принятых API

ROUTE XL повторён перед реализацией: UI пересекает приватность, отправочные согласия и оплату. OWN-N7-002 разрешает автономную реализацию согласованного SPARC-плана. Профиль compact-quality-first-v2, requested gpt-6.1-sol high; actual модель/usage/cost ожидают host evidence. Агентов не было.

`/app` проверяет durable session и перенаправляет без неё на `/signin`. Регистрация и вход ведут в кабинет. Нативные модули TypeScript компилируются существующим `npm run build` в `dist/web`; Dockerfile уже копирует src/tests и выполняет этот build. Сервер отдаёт только явный список `/assets/*.js` с JavaScript MIME и `/assets/cabinet.css` с CSS MIME. `/api/app` возвращает безопасные режимы, disclosure, конфигурацию лимитов/провайдеров, ограниченную историю intent и presence cookie, без секретов. Оpaque UUID сессии — маркер lifecycle, не credential.

| AC | Реализация | A-проверка |
|---|---|---|
| A1 | Protected shell, шесть шагов, epoch/abort, 401/session clear, BroadcastChannel, bounded pending, no private storage | web-unit session/body/late-finally; HTTP auth/assets/relogin |
| A2 | add/edit/limits/TLS/TESTverify, masked reads, secret clearing, unchecked separate grants, disclosure and in-flight boundary, poolwaiting/poll freshness | accepted F02 + focused HTTP |
| A3 | labelled 1–5 step form and <=100 recipient rows, allowlisted fields, preview text, current version grant/start/pause | accepted F03 + focused HTTP |
| A4 | manual provenance/UTC/counts form, saved history, pair reasons, explicit share, opaque open/copy/revoke with events | accepted F05 + focused HTTP public canary |
| A5 | actual plans/expiry, disabled and TEST100minorRUB30days, stable checkout keys, durable intent history, partnercode/counts/deactivation and copy fallback | accepted F05 + focused HTTP |
| A6 | type/lint/build/fullunit/realPG, HTTP allowlist/CSP/MIME/source equality, central401 RED/restoredGREEN, immutable source/build/image and canary | telemetry receipt records exact exits |

Свежий независимый Astra review, браузеры 390/1440, accessibility/overflow screenshots, p95/performance, канонические delivery docs и PR — последующий этап B. Наличие CSS не является измеренной браузерной проверкой. Live SMTP/IMAP, реальные платежи и deploy не запускались. Backend authority/схема не менялись.

Телеметрия: `docs/telemetry/features/20261003T023900Z-f06/sol-a-receipt.md`. Измерения токенов/стоимости null; экономия пока не установлена. Launch/manifest принадлежат caller и не включаются в коммит исполнителя.
