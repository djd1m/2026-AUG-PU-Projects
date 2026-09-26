# crawler — отчёт о коде

**Фича:** 4 `crawler` · **Дата:** 2026-09-25 · **Исполнитель:** Opus 5.5 (агент, автономный режим;
фактическая модель — метаданные сессии `claude-opus-5-5[1m]`) · **FR:** `FR-SOURCE-001`, `FR-SOURCE-002`,
`NFR-SEC-004` · **SC:** `SC-US-001-2`, `SC-US-001-3`, `SC-US-001-4` · **ADR:** ADR-007, ADR-010, ADR-016 ·
Квитанция — [`05_completion.md`](05_completion.md), решения — A-N6-026. OpenAI/Codex не вызывался.

## carry_over (выполнено первым)

- **MEDIUM ревью index-job-core:** `closeFailedTx` (`packages/db/src/index-jobs.ts`) несёт своё условие
  `AND status IN ('queued', 'running')`; 0 строк — no-op (попытка и источник не трогаются). Тест
  «done и failed не переводятся в failed, фенс не поднимается» в `tests/index-job.fence.test.ts`; мутация
  `close-failed-ignores-status` добавлена в `scripts/test-index-job-mutations.mjs` → 1 красный.
- **LOW:** маршрут `POST /api/index-jobs/{id}/retry` НЕ создан — пробел записан явно в `05_completion.md`
  («Чего фича НЕ доказывает», п.1). Причина: маршруту нужна очередь в `web` и проверка `Origin` мутации —
  это объём фичи с кабинетом (`bot-cabinet`), а не краулера.

## Что сделано

| Файл | Что | Алгоритм / требование |
|---|---|---|
| `apps/worker/src/crawl/check-address.ts` | форма URL (http/https, порт 80/443, без учётных данных) ДО DNS; свой DNS (`dns.lookup all`), проверка КАЖДОГО адреса; IPv4 — запрещающий список (0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, TEST-NET ×3, 192.88.99/24, 192.168/16, 198.18/15, 224/4, 240/4); IPv6 — только 2000::/3 минус Teredo, 6to4, ORCHID, документация; `::ffff:` → правило IPv4; неразбираемое и `%зона` — запрещено | CheckAddress п.1–2, FR-SOURCE-002 |
| `apps/worker/src/crawl/safe-get.ts` | GET через `node:http(s)` прямо на проверенный IP (`Host`/SNI — имя сайта, `agent: false`); перенаправления вручную, каждый `Location` — снова `checkAddress`, ≤ 5; пределы сайта на каждом шаге; пауза между ЛЮБЫМИ запросами (`Pacer`); таймаут на запрос целиком; тело читается только при согласии вызывающего (статус + `Content-Type` до чтения), обрыв на потолке по `Content-Length` И по принятым байтам; `Accept-Encoding: identity` | CheckAddress п.3, ADR-010, NFR-SEC-004 |
| `apps/worker/src/crawl/robots.ts` | разбор RFC 9309: группа токена `SuflerBot`, иначе `*`; самое длинное правило, при равенстве Allow; `*` и `$`; 4xx → всё разрешено, 5xx/таймаут/сеть → `unreachable`, перенаправление в частную сеть → `blocked_address` | CrawlSite п.1, FR-SOURCE-002 |
| `apps/worker/src/crawl/extract-text.ts` | однопроходный разбор тегов без DOM: title, h1–h6 (в выдаче — блоки), основной текст (`<main>`/`<article>` при ≥ 200 символах, иначе тело), выброс script/style/noscript/template/svg/nav/footer/aside/form/…, `<header>` вне статьи; сущности; ссылки и `<base>`; `meta robots` noindex/nofollow; кодировка из заголовка/`<meta charset>` (windows-1251); `content_hash` = sha256(title + текст) | CrawlSite п.3–4, FR-SOURCE-001 |
| `apps/worker/src/crawl/crawl-site.ts` | порядок: форма → robots корня (отказ задачи) → sitemap.xml (необязателен) → FIFO; только хост и `www.`-вариант, без файлов по расширению; robots каждой origin; корень в частную сеть — отказ `blocked_address`, внутренняя страница — пропуск; бюджет страниц, потолок запросов 2 × бюджет + 10, бюджет времени 12 мин; дубль содержимого — `duplicate`; известный `content_hash` — «без изменений», дальше не отдаётся; 0 страниц — `no_text` (или `unreachable`, если корень не ответил); `onVisit` после каждой единицы с «N из M» | CrawlSite, SC-US-001-2/3/4 |
| `apps/worker/src/crawl/site-processor.ts` | обработчик источника «сайт» в задаче: бюджет из задачи (предпросмотр 20) или по плану (неизвестный → free 50); известные хэши источника; сброс счётчиков новой попытки под фенсом; каждая единица — транзакция `recordProgressTx` (фенс + пульс) + `page` (upsert по `(source_id, url_or_page)`) или `pages_skipped + 1`; `CrawlFailure` → `StepFailure(reason)`; в журнал — только счётчики | RunIndexJob п.2–5, ADR-009 |
| `apps/worker/src/crawl/limits.ts` | числа канона §7 (1000 мс, 15 с, 2 МБ, ≤ 5, 200 символов, 50/300) + User-Agent `SuflerBot/0.1 (+<N6_PUBLIC_ORIGIN>/bot)` | канон §7 |
| `apps/worker/src/run-index-job.ts`, `apps/worker/src/index.ts` | `processByKind`: `site` → краулер, `pdf` → `noProcessorYet` (до `pdf-source`), неизвестный вид → `internal`; воркер подключает краулер с User-Agent от `N6_PUBLIC_ORIGIN` | RunIndexJob п.3 |
| `packages/db/src/index-jobs.ts` | carry_over `closeFailedTx` | ревью index-job-core |
| `tests/ssrf.test.ts`, `tests/robots.test.ts`, `tests/crawl.test.ts`, `tests/crawl-job.integration.test.ts`, `tests/fixtures/fake-site.ts` | см. таблицу проверок | Refinement «Unit», Edge Cases |
| `scripts/test-crawler-mutations.mjs`, `scripts/test-index-job-mutations.mjs` | 5 мутаций краулера; +1 мутация carry_over | guard-must-be-able-to-fail |

Новых зависимостей НЕТ (`package.json`/lockfile не менялись): ADR-010 называл undici, Architecture —
`linkedom`; взяты `node:http(s)` и собственный разбор — обоснование и откат в A-N6-026.

## Как тесты ходят к сайту, не выходя в интернет

`tests/fixtures/fake-site.ts` поднимает настоящий HTTP-сервер на `127.0.0.1` ВНУТРИ тестового процесса.
Политика адресов не подменяется: краулер проверяет адреса, которые вернул подменный DNS (`site.example` →
`93.184.215.14`), а шов `dial` только направляет соединение с этого ПРОВЕРЕННОГО публичного адреса на
локальный порт. Соединение с любым другим адресом записывается в `dials` и валит запрос — поэтому
утверждение «ни одного соединения к 127.0.0.1 / 10.x / ::1 / 169.254.169.254» проверяемо. Настоящий DNS
проверен двумя случаями: `localhost` и имя `db` сети compose (адрес частной сети контейнеров).

## Проверки (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| typecheck | `npm run typecheck` | 0 |
| lint | `npm run lint` | `Статические правила: ошибок нет` |
| build | `npm run build` | 0; `apps/worker/dist/crawl/*.js` собраны и грузятся (`require` → `createSiteProcessor`, `processByKind` — функции) |
| локально (без БД/Redis) | `npx vitest run` | `Test Files  14 passed | 6 skipped (20)`, `Tests  406 passed | 43 skipped (449)` |
| **прогон в образе** на настоящих Postgres 16 + pgvector 0.8.6 и Redis 7.4 | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | **`Test Files  20 passed (20)` / `Tests  449 passed (449)`**, код 0, пропусков 0; журнал — `tests/artifacts/crawler/compose-test-run.txt` |
| мутации в образе | `… run --rm test sh -c 'node scripts/test-db.mjs && node scripts/test-crawler-mutations.mjs; node scripts/test-index-job-mutations.mjs'` (образ собран предыдущей командой с `--build`, код с тех пор не менялся) | краулер: код 0, 5/5; задача: код 0, 6/6; журнал — `tests/artifacts/crawler/mutations-run.txt` |
| проброс переменных | `N6_ENV_FILE=/tmp/n6-foundation.env bash scripts/check-env-wiring.sh` | 0 — `Потерь нет` (новая читаемая переменная воркера не появилась: `N6_PUBLIC_ORIGIN` уже проброшен) |
| контракт долгой задачи | `node ../../.claude/hooks/check-job-contract.cjs .` | **2** — `not-deployed` (без изменений; законно до стенда) |
| остановка стека | `… down -v` | контейнеры, сеть `n6-test` удалены; `docker ps -a --filter name=n6-test` → 0 |

## Мутации (guard-must-be-able-to-fail)

Набор: `ssrf`, `robots`, `crawl`, `crawl-job.integration` (112 тестов).

| Мутация | Дефект возвращён | Код восстановлен |
|---|---|---|
| `redirect-unchecked` — адрес проверяется только у первого запроса, `Location` нет | 11 failed \| 101 passed (112), код 1 | 112 passed (112), код 0 |
| `robots-ignored` — `isAllowed` всегда `true` | 8 failed \| 104 passed (112), код 1 | 112 passed (112), код 0 |
| `size-limit-removed` — нет потолка ни по `Content-Length`, ни по принятым байтам | 2 failed \| 110 passed (112), код 1 | 112 passed (112), код 0 |
| `check-before-dns-only` — адреса из DNS не проверяются (Refinement «Стражи») | 6 failed \| 106 passed (112), код 1 | 112 passed (112), код 0 |
| `first-address-only` — проверяется только первый адрес ответа DNS | 1 failed \| 111 passed (112), код 1 | 112 passed (112), код 0 |

Набор задачи индексации (50 тестов) после carry_over: `progress-without-fence` 2 · `lease-ignores-generation` 1 ·
`attempt-status-out-of-set` 2 · `unknown-status-reads-running` 7 · **`close-failed-ignores-status` 1** ·
`silence-reads-running` 2 красных; восстановление — 50 passed (50) в каждом случае.

## Итог

Обязательные проверки постановки выполнены и зелёные; `check-job-contract.cjs` → 2 (not-deployed, законно
до стенда). Коммита нет (по постановке).

## Правки после REJECT (ревью Sonnet 5, [`08_review.md`](08_review.md))

| Находка | Правка | Доказательство |
|---|---|---|
| **BLOCKER-1** ReDoS: `robots.ts` `compile()` делал из `*` регэксп `.*` | правило хранится как литеральные сегменты между `*` + флаг `$`; `matchRule` ищет сегменты `indexOf` слева направо без возврата, O(длина пути × длина правила); подряд идущие `*` схлопываются; правило, чьи литералы длиннее 2048 символов (не может совпасть ни с одним адресом краулера), не хранится | `tests/crawl-pathological.test.ts`: 1000 `*` против пути 2000 символов — < 1 с; случай ревью (30 `*`, 42 символа) — < 100 мс; ~500 КиБ правил × 20 адресов — < 1 с; семантика `*`/`$` — 8 утверждений. Граница времени — через `vm` с `timeout`, он прерывает синхронный бэктрекинг, поэтому мутация даёт красный за секунду, а не зависший прогон |
| **BLOCKER-2** `html.toLowerCase().indexOf` на каждый сырой тег | закрывающий тег ищется регистронезависимым регэкспом `</name` с `lastIndex` (без копии документа, от текущей позиции) | 100 000 пар `<script></script>` (1,7 МБ) и `<title></title>` — < 1 с |
| **Найдено при правке BLOCKER-2** (в ревью не было): сам регэксп-токенизатор тегов квадратичен на незакрытых конструкциях — `<a ` без `>`, `<a x='`, `<!--`, `<!`, `<![CDATA[`, незакрытая кавычка в `meta` на 2 МБ висели > 3 с каждая (замер через `vm` timeout) | токенизатор переписан ручным сканером: каждая ветка продвигает позицию, поиск конца, не нашедший его, случается только у конца документа (остаток отбрасывается, как в HTML); кавычка открывает значение только сразу после `=` | 6 патологических документов по 2 МБ — < 1 с каждый (локально 1–27 мс); тест разбора: `class=it's` не глотает документ, `alt='a>b'`, незакрытый тег у конца отброшен |
| **MEDIUM-1** понижение https → http в перенаправлении | `nextHop()`: `https:` → `http:` — `FetchFailed('downgrade')`; у корня это `unreachable`, у страницы — пропуск `downgrade` | юнит `nextHop`: https→http отказ, https→https и http→https пропуск. Живым TLS не проверено (в тестовом стенде нет сертификата, `rejectUnauthorized` не ослабляется ради теста) |
| **MEDIUM-2** ветка `Content-Encoding` без теста | — (код был верен) | сервер отдаёт `gzip` вопреки `Accept-Encoding: identity` → запрос нёс `identity`, пропуск `encoding: 1`, соединение оборвано, тело не читалось |
| LOW-1 двойной `SELECT kind` | не менялось (нагрузка, не безопасность) | — |

### Проверки после правок (дословно)

| Проверка | Итог |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | 0 / `Статические правила: ошибок нет` / 0 |
| локально `npx vitest run` | `Test Files  15 passed \| 6 skipped (21)`, `Tests  421 passed \| 43 skipped (464)` |
| **в образе** `compose.test.yml run --rm --build test` | **`Test Files  21 passed (21)` / `Tests  464 passed (464)`**, код 0, пропусков 0 — `tests/artifacts/crawler/compose-test-run-after-reject.txt` |
| мутации краулера в образе (набор 127 тестов) | код 0, **9/9**: `redirect-unchecked` 11 · `robots-ignored` 8 · `size-limit-removed` 2 · `check-before-dns-only` 6 · `first-address-only` 1 · **`robots-regex-backtracking` 3** · **`extract-tolower-per-tag` 2** · **`unterminated-tag-rescan` 4** · **`downgrade-allowed` 1** красных; восстановление — 127 passed (127) в каждом — `tests/artifacts/crawler/mutations-run-after-reject.txt` |
| мутации задачи индексации в образе (50 тестов) | код 0, 6/6 (2 · 1 · 2 · 7 · 1 · 2 красных), восстановление 50/50 |
| остановка | `down -v`; контейнеров `n6-test` — 0 |

Status: completed
