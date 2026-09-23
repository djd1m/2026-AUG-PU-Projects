# Валидация Phase 2, итерация 2 — трассировка и согласованность (val2-trace)

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** val2-trace · **Валидатор:** Claude Opus 5.5 · 2026-09-23
**Линзы:** validator-architecture · validator-pseudocode · validator-coherence · validator-dependencies
**Ревизия:** HEAD `e6eaafe`; рабочее дерево `docs/` без правок, кроме журнала телеметрии. canon.md sha256 `2acd0f443199f4e3…2722`
совпадает с `dispatch-plan.md` и с шапкой Pseudocode.
**Прочитаны:** canon, Specification, Pseudocode (полностью), ADR-006/007/008/011 и места grep, Architecture, Architecture-compose,
Refinement §1/§2.4/§2.5/§7, Completion §1/§3, PRD «Очереди поставки», long-job-contract, model-cost-contract,
decisions-owner, dispatch-plan, validation-report, val-trace. `projects/05-podcast-clips-opus/` не открывался. Чужие
документы не правились.

**Установка.** Правка, внесённая только текстом требования, без шага алгоритма, считается незакрытой (PR-003).
Противоречие между документами считается дефектом, даже если канон «побеждает»: Codex читает все документы, а тесты
пишутся по Gherkin и по разделам ADR «Как проверить».

## Оценки

| Линза | Балл | Коротко |
|---|---|---|
| validator-architecture | 76 | эскиз compose теперь запускаем (`config -q` → 0, пароли `:?`, тома, Caddyfile); CORS с `ExposeHeaders: ETag` и `GET` есть в каноне, ADR-007 и Architecture. Минусы: правило допуска LLM в Architecture и ADR-006 расходится с алгоритмом (VT2-01); раздел «Reconciliation with Pseudocode» по-прежнему «не выполнена»; в диаграмме всё ещё `POST /api/videos {size, name}` |
| validator-pseudocode | 74 | 19 из 25 прежних находок закрыты шагом алгоритма, а не только текстом. Новое: в метрике недели число авторов перезаписывается (VT2-02), цена STT в целых копейках за секунду не выражается (VT2-04), уборщик не ставит работу, которой нет в Redis (VT2-06), обновление access-cookie не описано (VT2-05) |
| validator-coherence | 62 | решения OWN-05A-012…014 перенесены везде, но правило допуска LLM записано тремя способами в пяти документах (VT2-01); оценка стоимости STT описана двумя механизмами (VT2-03); в Specification остались CORS без `GET`, `429` на `/p/` и «резерв по длительности куска» |
| validator-dependencies | 74 | VT-22 закрыта: две строки, у каждой своя цитата. `usage.cost` у транскрипции подтверждён примером ответа. Запасной путь ADR/Architecture («цена STT-модели из `GET /api/v1/models`») не подтверждён ничем. Pseudocode вместо него берёт цену из кода, заполненную пробой (VT2-03) |
| **Среднее** | **71,5** | |

**Вердикт: 🟡 CAVEATS.** Блокеров нет, среднее 71,5. Формально это 🟢: порог 70, блокеров нет. Понижаю осознанно.
Две находки high лежат на пути денег (VT2-01) и в самой метрике недели (VT2-02). Codex реализует их неверно, если прочтёт
не тот документ или прочтёт алгоритм буквально. Обе чинятся за минуты, без решения владельца. После их закрытия и
правки medium, где канон или Gherkin спорят с алгоритмом (VT2-03, VT2-07, VT2-08), документы готовы к коду.

## 1. Закрытие VT-01…VT-25 (по алгоритму, а не по требованию)

| VT | Статус | Доказательство в текущих документах | Остаток |
|---|---|---|---|
| VT-01 `jobId` с `:` | **закрыта** | canon §3 «Разделитель в `jobId` — точка»; Pseudocode «Завершение загрузки» шаг 7 `jobId: job_id + '.stt.prepare'`, «Транскрипция куска» шаг 8 `'{job_id}.llm'`, «Сохранение клипов» шаг 6 `clip_id + '.render'`, «Уборщик» шаг 4 `expected_bullmq_ids`; ADR-008 п.3, Spec FR-clips-3 п.6, long-job-contract, C4, Architecture | формы с двоеточием в прозе: canon §12 строка AC-clips-2 и Completion:94 (`stt:prepare`), ADR-forks:236 → VT2-15 |
| VT-02 резерв 120 мин | **закрыта в алгоритме, частично в тексте** | «Допуск STT» шаг 1: `user_sec ← ceil(Σ unique_ms / 1000)` — «для 120-мин видео ровно 7 200 с»; `global_sec ← Σ provider_sec(k)`; Refinement EC-2 «ровно 120 мин → Принято» | canon §11 «округление куска вверх», Spec FR-clips-10 «длительность куска вверх», «STT резервирует длительность куска», Architecture «на секунды всего видео» → VT2-07 |
| VT-03 потолок LLM на задачу | **закрыта числом, правило допуска расходится** | OWN-05A-012 2 400/5 000; canon §6; Pseudocode «Допуск STT» шаг 2a (`est_kop` против потолка задачи и остатков) до `reserve` STT | ADR-006 п.3, Architecture, model-cost-contract и Refinement 2.4.7 задают другое правило → VT2-01 |
| VT-04 транспорт сессии | **закрыта, с дырой** | canon §7; Pseudocode «Вход» шаг 7 (две cookie, `Path=/`), «Проверка сессии» шаги 0–1 (только cookie, `Origin`), API Contracts; ADR-011; Spec FR-clips-1 п.3, AC-clips-26 | через 15 мин access-cookie истекает (`Max-Age=900`), а кто и когда вызывает `refresh`, не описано → VT2-05 |
| VT-05 CORS `ExposeHeaders: ETag` | **закрыта** | canon §8 `PUT`, `GET`, `ExposeHeaders = ETag`; ADR-007 п.2; Architecture:103/135/313; API Contracts `complete`; Refinement §2.2 браузерный E2E | Spec FR-clips-2 п.3 и Completion день 0 — без `GET` → VT2-08 |
| VT-06 нормализация ссылок | **закрыта** | константа `PLATFORM_KEEP_QUERY` + paste-back шаг 5 (сохраняются `v`/`z`, тест 9×2 → 18 строк) | — |
| VT-07 перебор паролей | **закрыта** | «Вход» шаг 1: атомарный `INCR` `login_ip` и `login_email` до argon2; шаг 2: семафор `ARGON2_MAX_CONCURRENT`; Refinement 2.4.6 | — |
| VT-08 Spec против канона §12 | **закрыта** | Spec §10: сверка 22 строк; FR-GROWTH-002 «одна запись… второй источник в `props`»; FR-clips-2 п.3/п.5; FR-clips-5 п.6 «в сутки»; FR-clips-1 п.1 «60 с и 5 раз в сутки» | во вводном абзаце §10 осталась фраза «ждут решения владельца… здесь не решаются», хотя ниже эти решения уже приняты → VT2-16 |
| VT-09 утечка резерва STT | **закрыта** | `finish_failed` → `release_stt_admission` («Допуск STT» шаг 5): возвращается `S'` = pending с `attempt_count=0`; тест «упала на куске 1 из 80» | узкая гонка с куском в полёте → VT2-13 |
| VT-10 два механизма восстановления | **закрыта** | «Уборщик» шаг 3: `maxStalledCount: 0`; обработчик `failed` при stalled ничего не меняет; уборщик — единственный механизм | состояние «работы нет в Redis» не обработано → VT2-06 |
| VT-11 429 за CGNAT | **закрыта в алгоритме, не в Gherkin** | «Партнёрская ссылка» шаг 1 и «Подпись к посту» шаг 2: сверх лимита `302` без события; API Contracts | Spec SC-US-010-3 и test-scenarios:411 «остальные получают 429» → VT2-09 |
| VT-12 переменные потолков в `web` | **закрыта** | canon §6: `web` у `LIMIT_LLM_*`/`LIMIT_STT_*`; Architecture-compose `x-limits` в `web` | — |
| VT-13 эскиз compose | **закрыта** | Architecture-compose: `POSTGRES_*:?`, тома `pgdata`/`caddy_data`/`caddy_config`/`minio_data`/`redisdata`, `command: server /data`, Caddyfile, `environment:` у каждого сервиса; заявлен прогон `config -q` → 0 | `web` в prod опубликован на петлю, а канон §1 пишет «prod — нет» → VT2-17 |
| VT-14 «Поделиться» файлом | **закрыта** | отдельный алгоритм «Поделиться файлом клипа»: блоб заранее после `clip_viewed`, `canShare`, `share` синхронно в жесте, `GET` в CORS | — |
| VT-15 стоимость STT | **частично** | Pseudocode «Транскрипция куска» шаг 4: `cost_kop = provider_sec × STT_PRICES[STT_MODEL]`, `cost_usd_micro IS NULL` = оценка; проверка конфигурации `STT_MODEL ∈ STT_PRICES` | механизмов два, а единица цены не выражается целым числом → VT2-03, VT2-04 |
| VT-16 ключевые слова JSON-схемы | **закрыта** | «Выбор фрагментов» шаг 5: `maxItems`/`minimum`/`maxLength` в схему не входят, всё проверяет код на шаге 7 | — |
| VT-17 Refinement против канона | **закрыта** | в Refinement больше нет `15–90` и `first_ref`; `moments` упомянут только как запрещённое имя (EC-6: «не `moments`»); EC-4 и 2.4.1 перенесены на `POST /api/videos`; Completion §1.1 п.6 — 5 кандидатов | новое правило в 2.4.7 → VT2-01; цель мутации 2.4.5 → VT2-14 |
| VT-18 advisory lock через пул | **закрыта** | «Уборщик» шаг 3: отдельный `pg.Client leader`, `pg_advisory_unlock` в `finally`, тест «два прохода подряд»; «Уборщик хранилища» — так же | — |
| VT-19 SC-US-002-4 | **закрыта** | Spec: «счётчик quota_counter kind = stt_sec не изменился» | — |
| VT-20 когорты на `/admin/partners` | **закрыта** | SC-US-010-1 «открывает /admin/metrics»; Pseudocode «Метрики недели» шаг 8 | — |
| VT-21 ADR отстали от канона | **закрыта** | ADR-006 п.2 «уточнено каноном… VT-21», п.4 `ops spend-today`; ADR-014:413 «было `ops publications …`»; ADR-007 п.1 magic bytes в `web` | — |
| VT-22 «~60 с» без цитаты | **закрыта** | Architecture:94/95 — две строки, у второй цитата «upstream providers time out after 60 seconds per request» | — |
| VT-23 «150 мин — худший случай» | **закрыта** | long-job-contract: «оценка типичной длительности, НЕ гарантированный потолок»; `GET /api/jobs/{job_id}` вместо `/api/clips?job_id=`; «0 клипов — EC-6» | — |
| VT-24 `/api/health` | **закрыта** | canon §7; API Contracts `200 {db, redis}` / `503` | Caddy проксирует маршрут наружу → VT2-17 |
| VT-25 число алгоритмов | n/a | было 44, теперь `grep -c '^### Algorithm:'` → **45**; в Final_Summary осталось «44» | VT2-17 |

**Итог:** закрыто по сути 19, частично 5 (VT-02, VT-03, VT-04, VT-11, VT-15), не закрыто 0. Одна (VT-25) не требовала
правки. Все частичные закрыты в алгоритме, но опровергаются другим документом — ровно тот класс, который Codex
реализует по случайному источнику.

## 2. Согласованность после волны правок

### Решения владельца OWN-05A-012…014

| Что | canon | Spec | Pseudocode | ADR | Architecture | Refinement / Completion | Контракты | Итог |
|---|---|---|---|---|---|---|---|---|
| 2 400 / 5 000 / 30 000 коп. | §6 ✅ | FR-clips-5 п.6, FR-clips-10 ✅ | шаг 2a, «Потолок задачи» ✅ | ADR-006 табл. ✅ | — | 2.4.7 ✅ | model-cost 38/46/70 ✅ | числа совпадают; **§12 канона, строка FR-clips-10: «LLM 30 ₽ на автора»** — устарело (VT2-15) |
| **правило** выполнимости LLM при допуске STT | §6 «проверяется при допуске» (без формулы) | `est > LIMIT_LLM_KOP_JOB` или `est > остатка` | `est_kop` (одна попытка) против потолка задачи и остатков | **остаток ≥ `LIMIT_LLM_KOP_JOB`** | **остаток ≥ `LIMIT_LLM_KOP_JOB`** | **2 × est («обе попытки»)** | **остаток ≥ 2400** | ❌ три правила → VT2-01 |
| знак: (70, 444) / (158, 444) / (70, 200), внутри полосы | — | FR-GROWTH-003 п.4, SC-US-008-1 ✅ | «Раскладка» шаг 3 ✅ (+ отказ `watermark_no_room`) | ADR-010 ✅ | — | 2.4.8 ✅ | PRD PD-WMARK ✅ | совпадает |
| 1-я неделя / 2-я очередь | §7 `/admin/partners`, `/admin/spend` помечены; **`/admin/users` «сброс пароля», `GET /reset`, `POST /api/auth/reset`, `/plans`, `/api/fakedoor` — без пометки** | помечено «2-я очередь» | fake-door, `reset_password` — 2-я очередь ✅ | ADR-011 ✅ | — | Completion §1.2 п.1 вводит **самостоятельный** сброс, которого нет в Spec | model-cost ✅ | ❌ объём сброса пароля неоднозначен → VT2-10 |

### Остальное из задания

| Пункт | Итог |
|---|---|
| `jobId` через точку | ✅ во всех исполняемых местах; хвосты в прозе — VT2-15 |
| сессия только в cookie, без Bearer | ✅ canon/Spec/Pseudocode/ADR/Architecture/PRD; дыра — обновление access (VT2-05) |
| CORS PUT+GET+ExposeHeaders ETag | ✅ canon §8, ADR-007, Architecture; ❌ Spec FR-clips-2 п.3 и Completion день 0 без `GET` (VT2-08) |
| `publication.clip_code` и сохранение публикации | ✅ canon §4; Pseudocode Data Structures, paste-back шаг 7 (`clip_code = clip.clip_code`), «Удаление видео» шаг 2 (`clip_id=NULL`), «Метрики» шаг 3 (`COUNT(DISTINCT clip_code)`), «Проверка публикаций» шаг 3; Spec FR-clips-13 п.2, SC-US-014-1 |
| AC-clips-25…28 реализованы | ✅ AC-25 → «Вход» шаг 1 (атомарный `INCR` до argon2); AC-26 → «Проверка сессии» шаги 0–1 (Bearer игнорируется → 401, чужой `Origin` → 403); AC-27 → «Допуск STT» + «Транскрипция куска» шаг 1 + «Повтор» шаг 5, откат отметки при отказе; AC-28 → «Регистрация» шаги 2 и 8. Оговорка AC-28: Spec FR-clips-1 п.7 срезает `+тег` у всех доменов, Pseudocode — только у gmail и 9 российских доменов (VT2-12) |
| Ключи ↔ алгоритмы | каждый из 28 AC имеет `REQUIREMENT:` в каком-либо алгоритме, кроме AC-clips-15 — он законно объявлен `config-only`. Сценариев 61 = 61 (`grep`), заявлено алгоритмами 59, 2 объявлены ui-only/config-only |
| Стражи слоя 1 на `e6eaafe` | `check-docs-complete` 0 · `check-look-trace` 0 · `check-growth-trace` 0 · `check-handoff-manifest` 0 · `check-job-contract` 0 · `check-model-cost` 0 · `check-external-deps` 0 · `check-file-ownership` 0 · `check-canon` 2 (см. §4) |

## 3. Детерминированный grep

`grep -rn ':llm\|:render\|:stt\|Bearer\|usage_attempt\|watermark_path_visited' docs/*.md` — 20 вхождений:

| Вхождение | Объяснение | Дефект? |
|---|---|---|
| ADR-forks.md:192 `usage_attempt`; :236 `{videoId}:stt:{chunk}`, `{clipId}:render` | документ развилок, написан до канона; над ним нет пометки «заменено каноном» | low, VT2-15 |
| PRD.md:258, canon.md:184, Architecture.md:297 и :373, ADR.md:350, Specification.md:100 и :1331 `Bearer` | отрицание: «`Bearer` не используется» | нет |
| Specification.md:1220 `Bearer` | негативный тест AC-clips-26: Bearer без cookie → 401 | нет, так и задумано |
| canon.md:256, :260 | §12, столбец «Было» (история) | нет |
| Architecture.md:421 `usage_attempt` | таблица «Открытые расхождения», исторический столбец Spec; заголовок раздела устарел — Spec уже приведена | low, VT2-17 |
| Refinement.md:238, model-cost-contract.md:121, source-versions.md:13 | записи о закрытом расхождении | нет |
| validation-report.md:23, :44 | отчёт итерации 1 | нет |
| Specification.md:1314 | §10, строка 8 (история снятия) | нет |

**Этот grep не ловит** `stt:prepare` (двоеточие после `stt`): canon.md:268 (§12, столбец «Стало»!) и Completion.md:94.
Шаблон `':stt'` не совпадает с `stt:`. Расширенный вариант: `grep -rnE '[a-z_}]:(stt|llm|render)\b|\b(stt|llm|render):[a-z{]' docs/*.md`.

## 4. Стражи `check-canon` × `check-file-ownership` и длина файлов

**Утверждение координатора подтверждено.** `node .claude/hooks/check-canon.cjs projects/05a-podcast-clips-opus` → 2
«в таблице единиц повторяются строки: docs/architecture-compose.md». `check-file-ownership.cjs` → 0.
Причина в коде: `unitRows()` (`check-canon.cjs:169-182`) берёт первую ячейку КАЖДОЙ строки КАЖДОЙ таблицы
`dispatch-plan.md`. Путь разрезанного файла стоит в «Владении» и повторяется в «Событиях разреза», как того требует
`check-file-ownership`. Второй симптом того же дефекта: на копии без таблицы разреза страж сообщает «26 параллельных
пишущих единиц», хотя их 5 — он считает строки «Владения» единицами.

**Решение координатора верное, но квитанция была неполной, и я её дополнил.** Сравнение sha256 доказывает только
закрепление канона. `check-canon` при коде 2 выходит на строке 389, раньше структурных проверок самого канона:
различимость номеров и то, что перечни держат своё число («Всего 17 событий», «Всего 9 причин»…). Прогон на копии
`docs/` в scratchpad с удалённой таблицей «События разреза» дал:
`✅ канон зафиксирован и цел… sha256 совпал… порядковые номера различимы у соседей (13 заголовков), перечни держат своё
число (10)`, exit 0. Рекомендация: записать этот прогон как квитанцию целостности канона в validation-report и заявить
апстриму правку `unitRows()` — читать только таблицу под `## Единицы`.

**Specification.md (1 370 строк) и Pseudocode.md (1 157) больше 500 строк — законное исключение, резать не нужно.**
По фиксированному пути `docs/Specification.md` читают пять вендорных стражей: `check-docs-complete`, `check-look-trace`,
`check-look-origin`, `check-growth-trace`, `check-handoff-manifest`. `docs/Pseudocode.md` читают
`check-docs-complete` и `check-handoff-manifest`. Раздел «Scenario Coverage» Pseudocode считает сценарии по одному файлу
Specification. Разрез отдал бы стражам часть текста. Результат — ложное «потеряно» (1) или, хуже, молчаливый 0 по
половине ключей. Правило «< 500 строк» в CLAUDE.md проекта — правило для кода. Architecture резать было законно: её
стражи не читают. Нужно одно: объявить исключение явно одной строкой в dispatch-plan или Final_Summary («Spec и
Pseudocode не режутся: 5 и 2 стража читают фиксированный путь»). Иначе следующий проверяющий потребует разрез снова.

## Gap Register

| ID | Severity | Файл: раздел | Цитата | Как чинить | Чей файл |
|---|---|---|---|---|---|
| VT2-01 | **high** | ADR-006 п.3 и «Как проверить»; Architecture — диаграмма «допуск» и таблица сверки; model-cost-contract:78; Refinement 2.4.7; против Spec FR-clips-10 и Pseudocode «Допуск STT» шаг 2a | ADR: «осталось LLM-бюджета не меньше `LIMIT_LLM_KOP_JOB`… 3 загрузки × 24 ₽ = 72 ₽ больше 50 ₽»; ADR-тест: «осталось 20 ₽ → `quota_user`». Refinement: «резерв на допуске оценивается по ХУДШЕМУ случаю (обе попытки)». Pseudocode: `IF est_kop > LIMIT_LLM_KOP_JOB`… `used + est_kop > LIMIT_LLM_USER_KOP_DAY` — одна попытка по оценке длительности | Три правила на один денежный шаг. Короткое видео с оценкой 300 коп. при остатке 20 ₽ по Pseudocode проходит, а по тесту ADR-006 обязано отказать: тесты и код разойдутся. Правило Pseudocode при этом не выполняет AC-clips-8 («1 повтор»), если калибровка поднимет `LLM_EST_CHARS_PER_SEC`: проверяется одна попытка. **Предлагаю одно правило:** `need ← min(2 × est_kop, LIMIT_LLM_KOP_JOB)`; отказ, если `2 × est_kop > LIMIT_LLM_KOP_JOB` (видео слишком длинное для потолка задачи) или `used + need` > остатка автора/сервиса. Записать формулой в канон §6 и привести ADR-006 п.3 и тест, Architecture, model-cost-contract, Refinement 2.4.7 и Spec FR-clips-10 к этой формуле | координатор (канон), затем pseudocode, adr, architecture, refinement-completion, spec |
| VT2-02 | **high** | Pseudocode «Метрики недели» шаг 3 | «`authors_confirmed ← min(accounts, channels)` — три аккаунта с одним каналом площадки дают одного автора (VA-14…); выводятся все три числа; `authors_confirmed ← COUNT(DISTINCT account_id)`; `goal_met ← … authors_confirmed ≥ 3`» | Второе присваивание перезаписывает первое. Исполнитель, читающий по шагам, посчитает авторов по аккаунтам. Три аккаунта на одном TikTok-канале тогда закрывают цель недели, а это ровно обход VA-14 и FR-GROWTH-005 п.4. Удалить второе присваивание; тест: 3 аккаунта × 1 `channel_key` × 5 клипов → `authors_confirmed = 1`, `goal_met = false` | pseudocode |
| VT2-03 | medium | canon §4 `spend_ledger.cost_estimated`; ADR-006 п.2; Architecture:96; против Pseudocode Data Structures, «Транскрипция куска» шаги 4 и 7, «Расход» шаг 3 | ADR/Architecture: «`usage.seconds` × цена модели из `GET /api/v1/models` (читается при старте воркера…) и помечается `cost_estimated = true`». Pseudocode: `cost_kop = provider_sec × STT_PRICES[STT_MODEL]`; «`cost_usd_micro IS NULL` отличает оценку от факта»; колонки `cost_estimated` в `SpendLedger` нет | Два механизма оценки стоимости и два признака оценки. Колонка из канона ни одним алгоритмом не пишется: это CFG-I5, объявленный вход, который никто не читает. Цена STT-модели в `/api/v1/models` как источник для аудио ничем не подтверждена. Выбрать одно: `STT_PRICES` из пробы плюс `cost_estimated` пишется явно (или колонка снимается из канона). Выровнять ADR-006 п.2 и строку Architecture:96 | координатор (канон), pseudocode, adr, architecture |
| VT2-04 | medium | Pseudocode константа `STT_PRICES` `{<STT_MODEL>: kop_per_sec}`; «Транскрипция куска» шаг 4 | «`cost_kop=provider_sec(k) × STT_PRICES[STT_MODEL]`»; порог пробы «≤ 62 ₽ за час» | 62 ₽/ч = 6 200 коп. / 3 600 с = **1,72 коп/с**. Целых копеек за секунду не бывает: плавающая точка запрещена каноном §11, округление до 1 или 2 даёт ошибку до 42 %. Хранить `kop_per_hour` (или `usd_micro_per_sec`), `cost_kop = ceil(provider_sec × kop_per_hour / 3600)`; юнит-тест на 9,2 с | pseudocode, канон §11 (единица) |
| VT2-05 | medium | Pseudocode «Вход» шаг 7, «Проверка сессии» шаг 1; ADR-011; Spec FR-clips-1 п.3 | «`access` — … `Max-Age=900`»; «нет или невалиден → 401 (для страниц — редирект на вход)» | Через 15 мин браузер удаляет access-cookie. При следующем переходе middleware увидит только `refresh` и выбросит на вход. Оператор на `/admin/*` будет перелогиниваться каждые 15 мин; экран задачи получит 401 посреди опроса. Кто вызывает `POST /api/auth/refresh`, не сказано. Добавить шаг: (а) middleware страниц при отсутствии access и наличии refresh ротирует пару на сервере и продолжает рендер; (б) клиентский `fetch` при 401 один раз вызывает `refresh` и повторяет запрос. Окно `REFRESH_GRACE_SEC` уже покрывает параллельные вызовы. Тест: запрос через 16 мин после входа проходит без повторного входа | pseudocode, adr (ADR-011) |
| VT2-06 | medium | Pseudocode «Heartbeat и уборщик» шаг 3.2 (последний пункт) | «для каждого `id` из `expected` в состоянии `completed` \| `failed` → `Job.remove(id)`; затем `add` с тем же `jobId`. Работа в состоянии `active`… удаляется `Job.remove(id)` с игнорированием ошибки блокировки и ставится заново» | Не сказано, что делать, если работы в Redis нет (`getState` → `unknown`). Именно так выглядит сбой Redis на «Завершение загрузки» шаг 7 («задачу поднимет Уборщик»). Codex прочтёт `add` как ветку только после `remove` и не поставит ничего. Задача висит до `worker_lost` на третьем проходе, 15 мин без работы. Второе: `remove` активной работы под блокировкой бросает исключение, а `add` с тем же `jobId` BullMQ молча игнорирует, то есть «ставится заново» не происходит; восстановление наступит только следующим проходом. Явно: `unknown` → `add`; `active` → не трогать (heartbeat с `attempt_count=$seen` сам снимет исполнителя), ставить на следующем проходе после `completed/failed`. Тест: удалить работу из Redis → задача продолжена за ≤ 1 проход | pseudocode |
| VT2-07 | medium | canon §11 «аудио в потолках STT … округление куска вверх»; Spec FR-clips-10 (таблица «секунда аудио, длительность куска вверх» и абзац «STT резервирует длительность куска»); Architecture — диаграмма «резерв… на секунды всего видео» | см. цитаты | VT-02 закрыта в алгоритме, но документ-авторитет (канон) велит округлять каждый кусок. 80 кусков × до 1 с округления → до 7 280 с > 7 200: дефект VT-02 возвращается, если Codex пойдёт от канона. Записать в канон §11 две строки: персональный счётчик — `ceil(Σ unique_ms / 1000)` по длительности записи; глобальный — `Σ ceil(chunk.duration_ms / 1000)` по секундам провайдера. Spec FR-clips-10 и диаграмму Architecture привести к ним | координатор (канон), spec, architecture |
| VT2-08 | medium | Spec FR-clips-2 п.3; Completion §3 день 0 | Spec: «`AllowedMethods` = `PUT`, `ExposeHeaders` = `ETag`»; Completion: «CORS (`AllowedOrigins=BASE_URL`, `ExposeHeaders=ETag`…)» | Кто настраивает бакет по Spec или по чек-листу дня 0, не включит `GET`. Тогда `fetch` блоба в «Поделиться» падает на CORS, `canShare` не проверяется, кнопка «Поделиться» молча не появляется, SC-US-006-4 не выполнен. Отказ беззвучный. Дописать `GET` в обоих местах | spec, refinement-completion |
| VT2-09 | medium | Spec SC-US-010-3; test-scenarios.md:411 | «с одного IP учитывается не больше 30 обращений к /p/ в час, остальные получают 429» | Gherkin противоречит закрытию VT-11 (Pseudocode: сверх лимита `302 /` без события). Тест по Gherkin заставит вернуть `429`, и петля роста снова режется за CGNAT. Переписать: «остальные получают тот же редирект без cookie и без события `partner_link_visited`» | spec; test-scenarios (координатор) |
| VT2-10 | medium | canon §7 (`/admin/users` «сброс пароля», `GET /reset`, `POST /api/auth/reset`, `/plans`, `/api/fakedoor` — без пометки очереди); Completion §1.2 п.1; Refinement §7 строка долга | Completion: «самостоятельный сброс пароля по одноразовой ссылке (сейчас — только через оператора на `/admin/users`)»; Spec FR-clips-1 п.5: «**2-я очередь**… Самостоятельного восстановления пароля нет» | Объём первой недели по сбросу пароля в трёх документах разный. Completion утверждает, что сброс оператором есть в неделе 1, и вводит самостоятельный сброс, которого в Spec нет вовсе. Канон, авторитет по маршрутам, 2-ю очередь у этих маршрутов не помечает. Пометить в каноне §7 `GET /reset`, `POST /api/auth/reset`, `reset_password`, `/plans`, `POST /api/fakedoor` как «2-я очередь (OWN-05A-014)»; Completion §1.2 п.1 переписать на «сброс оператором», как в Spec | координатор (канон), refinement-completion |
| VT2-11 | medium | canon §4 `job.created_at` «(задаёт день job-счётчиков)» против canon §12 «2 попытки на задачу **в сутки** (повтор… на следующий день возможен)» и Pseudocode «Выбор фрагментов» шаг 4 «день попытки `d = msk_day(now())`» | см. цитаты | Канон противоречит сам себе. Если день берётся из `created_at`, повтор на следующий день получит тот же исчерпанный счётчик, и обещание §12 и Pseudocode «Повтор» шаг 5 («попробуйте завтра») станет ложью. При дне попытки же `LIMIT_LLM_KOP_JOB` = 2 400 коп. — это потолок задачи **в сутки**, а не на задачу, как в OWN-05A-012. Выбрать и записать одно; убрать пометку у `created_at` или переписать §12. Если «в сутки» — написать в §6 «2 400 коп. на задачу в сутки» | координатор (канон) |
| VT2-12 | low | Spec FR-clips-1 п.7 против Pseudocode «Регистрация» шаг 8 | Spec: «у локальной части отбрасывается `+тег`» (для всех); Pseudocode: `+тег` снимается только у gmail и 9 российских доменов | Версия Pseudocode безопаснее: у части провайдеров `+` — буква адреса. Spec сузить до списка доменов | spec |
| VT2-13 | low | Pseudocode «Транскрипция куска» шаг 2 × «Допуск STT» шаг 5 | `UPDATE transcript_chunk SET attempt_count = attempt_count + 1 WHERE id=$c AND status='pending'` | Кусок прошёл ворота шага 1, а `finish_failed` соседа успел снять отметку и вернуть его секунды. Тогда кусок всё равно платно вызовет STT, неоплаченный в счётчике: один кусок, ≤ 110 с. Добавить в шаг 2 условие `AND EXISTS(job running) AND EXISTS(отметка допуска)` | pseudocode |
| VT2-14 | low | Refinement 2.4.5 и §2.5 строка VA-01 | «удалить проверку допуска перед постановкой кусков»; «убрать повторную проверку допуска в шаге «Повтор»» | В Pseudocode ворота стоят в «Транскрипции куска» шаг 1, а не в «Повторе»; Spec AC-27 называет верно («перед вызовом STT куска»). Мутация по Refinement уберёт то, чего нет. Указать шаг Pseudocode | refinement-completion |
| VT2-15 | low | canon §12 строки FR-clips-10 («LLM 30 ₽ на автора») и AC-clips-2 (`stt:prepare` в столбце «Стало»); Completion:94 `stt:prepare`; ADR-forks.md:192/236 | цитаты | Устаревшие значения в столбце «Стало» канона — самые опасные из хвостов. Исправить на «50 ₽ (OWN-05A-012)» и `stt.prepare`; над ADR-forks поставить пометку «исторический; имена — по канону» | координатор, refinement-completion, adr |
| VT2-16 | low | Spec §10 вводный абзац «Сверка с каноном»; Pseudocode «Вход» OUTPUT; «State Transitions»; Spec FR-clips-7 п.4; события | Spec: «Пункты, которые ждут решения владельца… здесь не решаются» — уже решены. Pseudocode: `OUTPUT: 200 {access_token}` при шаге 7 `RETURN 200 {}`. Диаграмма `failed → running`: «кроме file_invalid, duration_exceeded» без `no_timestamps`. FR-clips-7 п.4: подписи, только если `confident` у **всех кусков клипа**, а Pseudocode — только у **швов внутри клипа**. У `caption_copied` дедупликации «1 раз в сутки» (FR-clips-15 п.2) нет частичного индекса в Data Structures | Привести к алгоритму: убрать `access_token` из OUTPUT (иначе токен окажется в теле, доступном JS), дописать `no_timestamps`, выбрать одно правило подписи, добавить `caption_copied` в `event_once_per_day_clip` | spec, pseudocode |
| VT2-17 | low | Architecture «Reconciliation with Pseudocode», диаграмма `POST /api/videos {size, name}`, «Открытые расхождения»; Architecture-compose `web` в prod на `127.0.0.1`; canon §7 `/api/health` «внутренний»; Final_Summary «44 алгоритма» | цитаты | Сверка всё ещё «не выполнена», хотя Pseudocode давно есть. Тело запроса должно быть `{size_bytes, ext, rights_confirmed}`. Раздел открытых расхождений закрыт Specification. Canon §1 «prod — нет» против петли в эскизе: безопасно, но расходится с каноном. `/api/health` доступен снаружи через `reverse_proxy` — либо `respond 404` в Caddyfile, либо «публичный, без данных». Алгоритмов 45 | architecture, координатор |

**Итого:** blocker 0 · high 2 (VT2-01, VT2-02) · medium 9 (VT2-03…VT2-11) · low 6 (VT2-12…VT2-17).

## Что проверено и оказалось в порядке

- Атомарный резерв, единый порядок захвата, «прочитать-потом-записать» запрещено; отметка допуска вставляется первой
  и откатывается вместе с резервом; повтор после `quota_*` в те же сутки даёт 0 вызовов STT (AC-27, мутационный страж назван).
- Ворота детерминированного отказа STT (`schema_invalid` той же модели → `stt_failed` без платного повтора); `no_timestamps`
  неповторяема в Spec, JobView и SQL «Повтора».
- Знак: формула, три контрольные точки и отказ `watermark_no_room` вместо тихой укладки на чёрное поле — одинаковы в Spec,
  Pseudocode, ADR-010, Refinement 2.4.8 и PRD.
- `publication.clip_code` переживает удаление клипа во всех пяти местах, где это важно.
- Эскиз compose: хранилища без `ports:`, все секреты `:?`, `noeviction` у Redis для BullMQ, `stop_grace_period` 60 с,
  тома для сертификатов; Caddy — единственная дверь, `web` только на петле.
- Решения OWN-05A-012…014 по числам и координатам перенесены везде без расхождений; расходится только ПРАВИЛО допуска (VT2-01).

Status: completed
