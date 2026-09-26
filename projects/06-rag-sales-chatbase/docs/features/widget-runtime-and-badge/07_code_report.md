# 07 — Отчёт о коде: `widget-runtime-and-badge` (фича 11)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (агент, автономный режим, один исполнитель) · Основа: `HEAD d638b8a` +
незакоммиченное дерево (снимок `git diff` + новые файлы без артефактов: sha256 `580e7e43513d2e5e…`). Не закоммичено.
FR: FR-WIDGET-001/003/004, FR-TARIFF-001, FR-GROWTH-003, NFR-PERF-003, NFR-SEC-002; SC-US-011-2; **ADR-004, ADR-005,
ADR-013** (перенос L1 Phase 2 — номер ADR назван). Решения без владельца — **A-N6-034**.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| Виджет (новый workspace `@n6/widget`) | `apps/widget/src/{index,api,badge,chat-window,styles,session}.ts`, `apps/widget/scripts/{build,check-bundle-size}.mjs` | один `<script data-bot async>` → `<n6-sufler>` в конце body, открытый Shadow DOM, стили только `adoptedStyleSheets`, `:host{all:initial !important…}`, пузырь 56 px / 16 px, окно по клику (лениво), `role=dialog`, `aria-live`, Esc, цели ≥ 44, ≤ 400 px — на весь экран, тема `data-theme`/`prefers-color-scheme`, строка «Не сообщайте паспортные и платёжные данные», ответ — только `textContent`, ссылки http(s); бейдж с MutationObserver и воротами поля вопроса. Бандл IIFE esbuild **5,54 КБ gzip** при потолке 45 КБ (сборка падает выше) |
| Конфигурация и события | `apps/web/src/server/{widget-handler,widget-deps,widget-runtime,check-origin}.ts`, `apps/web/src/lib/badge-required.ts`, `packages/db/src/widget.ts`, маршруты `app/w/v1/config`, `app/w/v1/event` | `GET /w/v1/config?bot=` (канон §5): бот → 404 (нет/не активен/владелец не активен/нет годного контакта) → CheckOrigin (403 без ACAO, без записи) → BadgeRequired по плану из БД → RecordWidgetInstall(first_config) → `{data}` с ровно одним ACAO, `Vary: Origin`, `no-store`. `OPTIONS` → 204. `POST /w/v1/event` badge_impression/badge_click с дедупликацией (сессия, сутки МСК по `now()` БД). `recordWidgetInstall(first_answer)` и `externalInstallCount` — для фичи 12 и метрики недели |
| Бандл и старые хэши | `apps/web/src/server/widget-bundle.ts`, `app/w/[file]/route.ts`, `Dockerfile`, `proxy/Caddyfile`, `package.json` | бандл в `apps/web/widget-bundle/` (не `public/`), текущий хэш `immutable`, любой другой `widget.<hex>.js` — текущий бандл с `max-age=300` (carry_over bot-cabinet); строка immutable в Caddy снята; `npm run build` собирает виджет первым, образ `web` копирует каталог |
| Carry_over design-shell | `docs/Specification.md` (строка FR-LOOK-012) | отмечено расхождение «данные в РФ» (A-N6-031 п.5); 609 строк, номера не сдвинуты; новая ревизия `sha256:d8efed88…1755a`, CLAUDE.md перепривязан |
| Тесты | `tests/{badge-required,widget-handler.unit,widget-source,widget-config.integration}.test.ts`, `tests/browser/{widget-harness,widget-embed.test}.ts`, `scripts/test-widget{,-browser}-mutations.mjs` | см. 05_completion |
| Документы | `docs/embed-contract.md`, `docs/decisions-autonomous.md` (A-N6-034), `reuse-map.md`, CLAUDE.md, `.claude/rules/coding-style.md`, roadmap | |

Затронут код фичи 10: `widget-bundle.ts` (путь манифеста `public/w` → `widget-bundle`) и одна строка пути в
`tests/bot-cabinet.unit.test.ts`.

## Дефект, пойманный настоящей БД

Первый прогон в образе: `1 failed | 805 passed` — `recordBadgeEvent` отвечал 503: параметр `$3` в
`INSERT … SELECT` использовался и как `uuid`, и в `||` как текст (Postgres: противоречивый тип параметра).
Исправлено явными приведениями и отдельным параметром ключа дедупликации; `tests/artifacts/widget-runtime-and-badge/image-run-1-red.txt`.
Модульный тест с подменённым хранилищем этого не видел — ровно поэтому SQL проверяется на настоящем Postgres.

## Отклонения от постановки

- Маршрут `GET /w/v1/config?bot=` (канон §5), а не `/w/v1/bots/{public_id}/config` — A-N6-034 (1).
- Origin только из `Origin`, `Referer` не используется — A-N6-034 (3).
- `/w/v1/ask` не реализован (фича 12); виджет уже шлёт запрос и рендерит ответ; до фичи 12 окно отвечает
  «Не получилось получить ответ. Напишите: <контакт>».

Итоги проверок — в [`05_completion.md`](05_completion.md): образ 806/806, браузер 24/24 (3 движка), мутации 4/4 + 4/4, check-embed-contract = 2 (not-deployed).

Status: completed
