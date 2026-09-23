# Requirements Testability Analysis — проект 05a ClipMkr (validator-stories + validator-acceptance)

Spec revision: `sha256:0825733a086a2e202b18d034f83bc159bf9480f983f27ccf8882682e3552b526` (docs/Specification.md)
PRD revision: `sha256:17c4941c630cbbb3e6248679135e2d55184158c2a6f6da4b443c83a8642ef7e0` (docs/PRD.md)
RUN_ID: 20260923T173212Z-replicate-05a-475b · WORK_UNIT_ID: val-stories

## Summary

- Stories analyzed: 14 (US-001…US-014, `docs/PRD.md` §4.1 / `docs/Specification.md` §3)
- Growth requirements analyzed: 5 (FR-GROWTH-001…005, `docs/Specification.md` §5)
- Average score (INVEST 50% + SMART 30% + Quality 20%, 14 stories): **94.4/100**
- **BLOCKED (score < 50 OR any floor criterion = 0): 0**
- **WARNING (score 70–89, "Good — minor fixes"): 3** — US-011, US-013, US-014
- **READY (score ≥ 90): 11** — US-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 012
- Security Acceptance Criteria: present and specific on every applicable story (+5 bonus each); one flagged gap (data-at-rest encryption parameters unverified — honestly marked `[НЕ ПРОВЕРЕНО]`, not silently omitted) and two mandatory Security-BDD categories missing scenarios (login brute-force, auth-bypass — VS-03/VS-04 below).
- Growth Traceability (`node .claude/hooks/check-growth-trace.cjs .`): **exit 0** — "все 4 требований по росту прослежены... либо отклонены с причиной" (hook counts the 4 seed-table rows; the 5th, FR-GROWTH-005, is a `product-discovery-brief.md`-documented *new proposal* from R2, also fully traced into Specification §5). All 5 `FR-GROWTH-nnn` ids are present verbatim in `docs/Specification.md`.
- `i` and `conv%` instrumentation: confirmed **separate** (`docs/Specification.md` FR-clips-12 §3, bullets "`i` по каждому активированному автору" / "`conv%`… в форме «k из n»"; `docs/PRD.md` Success Metrics table, two distinct rows, both explicitly "цель не ставится: n < 30").
- Weekly metric name+number+deadline: present — `docs/PRD.md` Success Metrics row 1: "Подтверждённые внешние публикации клипов со знаком (метрика недели, OWN-05A-002) | ≥ 5 уникальных клипов от ≥ 3 разных авторов | 7 дней с первого приглашения в бету".
- Vague terms ("быстро", "удобно", "разумный", "легко", "просто", "user-friendly", "интуитивно") in AC: **0 found** (checked via regex across `docs/PRD.md` + `docs/Specification.md`; the three regex hits — "пространитель", "пространение", "простоя" — are unrelated substrings, not vague-term usages).
- Actions taken on the user's behalf without separate consent: **0 found**. Every growth mechanic is explicit that the product never auto-publishes/auto-invites: FR-GROWTH-001 "Нажатие не публикует ничего: публикует автор сам"; FR-clips-15 п.2 "продукт ничего не публикует"; FR-GROWTH-002's cookie/code attribution records a fact, it does not act for the user.
- Anti-fraud minimum (self-referral, duplicates, накрутка) in @security scenarios: **all 3 present** — self-referral: SC-US-009-3 (FR-GROWTH-002); duplicates: SC-US-007-3 unique-index rejection (FR-GROWTH-005); накрутка: SC-US-006-3 download-spam dedup (FR-GROWTH-001) and SC-US-010-3 code-enumeration rate-limit (FR-GROWTH-004).
- 48 `SC-*` scenarios in `docs/Specification.md`: **48/48 carry a verifiable, numeric-or-closed-set threshold** in their `Then` (counts, ms/s/min/₽/%, HTTP codes, closed-list values) — none rely on prose-only judgement calls. Full mapping in Criterion scenarios below.
- `docs/test-scenarios.md` written: all 48 Specification scenarios re-tagged with `@FR-…`/`@AC-…` (Specification.md's own `AC-clips-*` blocks carried no Gherkin tags at all — added here), plus 4 new scenarios (`SC-VS-*`) covering gaps VS-03…VS-06 found below.

## Results

| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | Регистрация по email | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-002 | Загрузка видео → job_id | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-003 | Шаг обработки и причина отказа | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-004 | Клипы с законченной мыслью и субтитрами | 96/100 | 5/6 | 5/5 ✓ | READY (см. VS-08) |
| US-005 | Объяснение оценки клипа | 95/100 | 6/6 ✓ | 4/5 | READY (см. VS-11) |
| US-006 | Скачать/поделиться, подпись к посту | 96/100 | 5/6 | 5/5 ✓ | READY (см. VS-01, VS-08) |
| US-007 | Возврат ссылки на публикацию | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-008 | Понять, как снять знак | 95/100 | 6/6 ✓ | 4/5 | READY (см. VS-11) |
| US-009 | Промокод партнёра | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-010 | Оператор выдаёт код партнёру | 100/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-011 | Оператор проверяет ссылки и метрики | 79/100 | 4/6 | 4/5 | **WARNING (см. VS-02)** |
| US-012 | Оператор видит расход | 91/100 | 5/6 | 4/5 | READY (см. VS-07, VS-11) |
| US-013 | Зритель со знака доходит до продукта | 85/100 | 6/6 ✓ | 3/5 | **WARNING (см. VS-05, VS-09)** |
| US-014 | Автор удаляет видео | 85/100 | 6/6 ✓ | 3/5 | **WARNING (см. VS-06, VS-09)** |

Growth requirements (scored separately per skill §"Growth Traceability", outside the 100-point table —
все пять получают +5 traced; ниже — качество их собственных сценариев, не INVEST/SMART истории):

| Requirement | Scenarios | @happy-path имеет число | @edge-case | @security (anti-fraud) | Growth trace |
|---|---|---|---|---|---|
| FR-GROWTH-001 | SC-US-006-1,2,3 | ✓ (≤2 с) | ✓ | ✓ (накрутка + чужой clip) | +5 |
| FR-GROWTH-002 | SC-US-009-1,2,3 | ✓ (60/10/12 дней) | ✓ | ✓ (self-referral) | +5 |
| FR-GROWTH-003 | SC-US-008-1,2,3 | ✓ (9/10, 1–4 %) | ✓ | ✓ (подмена параметра) | +5 |
| FR-GROWTH-004 | SC-US-010-1,2,3 | ✓ (4 регистрации, 2 активации) | ✓ | ✓ (перебор кода, 429) | +5 |
| FR-GROWTH-005 | SC-US-007-1,2,3 | ✓ (5 клипов, 3 автора) | ✓ | ✓ (дубликат, удалённый пост) | +5 |

## Criterion scenarios

Полная таблица AC/FR-GROWTH → именованный сценарий (артефакт для Traceability). Источник для всех
строк: `docs/Specification.md` §5 и §8, скопировано в тегированном виде в `docs/test-scenarios.md`.

| Criterion | Scenario |
|-----------|----------|
| AC-clips-1 | SC-US-001-1, SC-US-001-2 |
| AC-clips-2 | SC-US-002-1, SC-US-002-2 |
| AC-clips-3 | SC-US-002-3 |
| AC-clips-4 | SC-US-003-1, SC-US-003-2 |
| AC-clips-5 | SC-US-003-3 |
| AC-clips-6 | SC-US-004-1, SC-US-004-2 |
| AC-clips-7 | SC-US-004-3 |
| AC-clips-8 | SC-US-004-4 |
| AC-clips-9 | SC-US-005-1, SC-US-005-2 |
| AC-clips-10 | SC-US-005-3 |
| AC-clips-11 | SC-US-004-5 |
| AC-clips-12 | SC-US-002-4, SC-US-002-5 |
| AC-clips-13 | SC-US-012-1, SC-US-012-2 |
| AC-clips-14 | SC-US-012-5 |
| AC-clips-15 | SC-US-012-3 |
| AC-clips-16 | SC-US-012-4 |
| AC-clips-17 | SC-US-014-1 |
| AC-clips-18 | SC-US-013-1 |
| AC-clips-19 | SC-US-011-1 |
| AC-clips-20 | SC-US-006-4 |
| AC-clips-21 | SC-US-001-3 |
| AC-clips-22 | SC-US-006-5 |
| AC-clips-23 | SC-US-002-6 |
| AC-clips-24 | SC-US-004-6, SC-US-004-7, SC-US-004-8 |
| FR-GROWTH-001 | SC-US-006-1, SC-US-006-2, SC-US-006-3 |
| FR-GROWTH-002 | SC-US-009-1, SC-US-009-2, SC-US-009-3 |
| FR-GROWTH-003 | SC-US-008-1, SC-US-008-2, SC-US-008-3 |
| FR-GROWTH-004 | SC-US-010-1, SC-US-010-2, SC-US-010-3 |
| FR-GROWTH-005 | SC-US-007-1, SC-US-007-2, SC-US-007-3 |

29 criteria, all 48 scenarios accounted for (sum of scenario counts = 48, verified by `grep -oE
"Scenario: SC-[A-Za-z0-9-]+" docs/Specification.md | sort -u | wc -l` = 48). **Traceability = 10/10**
for every story above scores it — no criterion in this table is empty.

## Detailed Analysis: US-011 (WARNING, 79/100)

**Story:** "Как оператор, я хочу проверить присланные ссылки и увидеть метрики недели" (`docs/Specification.md` §3, US-011) — FR: FR-GROWTH-005, FR-clips-11, FR-clips-12.

### INVEST Analysis

| Criterion | Score | Issue |
|-----------|------|-------|
| Independent | 8/8 | — |
| Negotiable | 8/8 | — |
| Valuable | 10/10 | "проверить ссылки" + "увидеть метрики недели" — оба явно ценны оператору |
| Estimable | 8/8 | — |
| Small | 4/8 | Одна история несёт **два** отдельных действия: подтверждение/отклонение публикаций (`/admin/publications`) и просмотр агрегированных метрик (`/admin/metrics`). Это две разные страницы, две разные операции |
| Testable | 4/8 | Только вторая половина ("увидеть метрики") имеет собственный AC/сценарий, привязанный к US-011: `AC-clips-19` → `SC-US-011-1`. Первая половина ("проверить ссылки", т.е. действия `confirmed`/`rejected`/перепроверка на 7-й день на `/admin/publications`) не имеет ни одного AC/сценария с префиксом `SC-US-011-*` — она тестируется только косвенно, через сценарии `SC-US-007-1..3`, формально привязанные к US-007 (автор возвращает ссылку), а не к оператору, который её проверяет |

INVEST subtotal = 8+8+10+8+4+4 = **42/50**

### SMART Analysis (по AC-clips-19, единственному AC своей истории)

| Criterion | Score | Issue |
|-----------|------|-------|
| Specific | 6/6 | Формулировка «k из n» без процента при n<30 — конкретна |
| Measurable | 8/8 | «2 из 7», «0 активированных → нет данных» |
| Achievable | 6/6 | — |
| Relevant | 5/5 | — |
| Time-bound | 0/5 | Ни у AC-clips-19, ни у самого текста US-011 нет временного контекста собственного (окно «7 дней» принадлежит FR-GROWTH-005/US-007, а не этой странице метрик) |

SMART subtotal = **25/30**

### Quality Analysis

| Criterion | Score | Issue |
|-----------|------|-------|
| Traceability | 5/10 | `AC-clips-19` → `SC-US-011-1` — квота покрыта (цитата выше). Но действие «проверить ссылки» этой истории **не имеет собственного `AC-clips-N`**; оно не «частично покрыто», оно вообще не представлено отдельным критерием приёмки под именем US-011 — только под именем US-007 |
| Completeness | 7/10 | Happy path («2 из 7») + edge («нет данных» при 0) для метрик; для «проверки ссылок» полноты не оценить — критерия нет |

Quality subtotal = **12/20**

Total = 42 + 25 + 12 = **79/100**. Не блокирует (Testable=4≠0, Completeness=7≠0, Traceability=5≠0 —
пороговый нуль-флор не сработал, все три ненулевые с цитатой), но и не «READY»: 79 попадает в
диапазон 70–89 (`Good — minor fixes`, требует уточнения перед разработкой).

**Suggestion:** разделить US-011 на две истории (US-011a «оператор проверяет ссылки» с собственным
`AC-clips-N`/`SC-US-011a-*`, привязанным к тем же операциям `/admin/publications`, что уже описаны
прозой в FR-GROWTH-005 п.3; US-011b «оператор видит метрики недели» = текущий `AC-clips-19`), либо
явно перечислить в трассировке §11, что «проверка ссылок» для US-011 закрывается сценариями
`SC-US-007-1..3` вместо создания новых.

## Detailed Analysis: US-013 (WARNING, 85/100) и US-014 (WARNING, 85/100)

Обе истории имеют **ровно один** сценарий (`SC-US-013-1`, `SC-US-014-1`) — по правилу completeness
это «Happy path only» = 4/10, а не 10/10 («happy + errors + edges»). Обе истории технически просты
(single happy flow), поэтому INVEST не страдает (6/6 у обеих), но SMART теряет Time-bound (0/5 —
ни у AC-clips-18, ни у AC-clips-17 нет собственного временного порога; сроки хранения 72ч/30 дней
из FR-clips-13 п.1 не эксплуатируются ни в одном Gherkin), и Quality теряет Completeness (4/10
вместо 10/10 у обеих). US-013: 50(INVEST)+21(SMART: 6+4+6+5+0)+14(Quality: 10+4)=85.
US-014: 50(INVEST)+21(SMART: 6+4+6+5+0)+14(Quality: 10+4)=85.

Конкретные недостающие ветки — см. VS-05 (US-013) и VS-06 (US-014) в Gap Register: обе истории не
блокированы (все три floor-критерия ненулевые), но обе оставляют закрытый список значений или
фоновый механизм без единого теста.

## Gap Register

| ID | Severity | Место | Что не так | Как чинить |
|---|---|---|---|---|
| VS-01 | low | `docs/PRD.md` §4.1 (US table), `docs/Specification.md` §3 | `FR-clips-15` («Подпись к посту с атрибутируемой ссылкой») не привязан ни к одной User Story ни в PRD, ни в таблице US Specification.md §3. Его AC (`AC-clips-22`) существует и назван (`SC-US-006-5`), но чисто по неймингу подшит к US-006 — сама история US-006 в PRD этого не заявляет («скачать/поделиться одним нажатием», не «скопировать подпись к посту») | Добавить `FR-clips-15` в колонку FR строки US-006 таблицы `docs/Specification.md` §3, либо завести отдельную строку истории |
| VS-02 | medium | `docs/Specification.md` §3, US-011 | US-011 объединяет два разных действия оператора («проверить ссылки» и «увидеть метрики»); только второе имеет собственный AC/сценарий (`AC-clips-19`/`SC-US-011-1`). Полный разбор — см. «Detailed Analysis: US-011» выше | Разделить историю на две, либо явно сослаться в трассировке §11 на `SC-US-007-1..3` как покрытие первой половины US-011 |
| VS-03 | high | `docs/Specification.md`, FR-clips-1 п.4 | «Лимит входа: ≤ 10 неудачных попыток на аккаунт за 15 мин» объявлен прозой, но **ни один** из 48 сценариев его не проверяет. `AC-clips-1` тестирует только лимит РЕГИСТРАЦИЙ (5/IP/час, `SC-US-001-2`), не лимит ВХОДА. Это ровно та категория, которую сам навык (`requirements-validator/SKILL.md` §"Security BDD Scenarios") объявляет обязательной для auth-эндпоинта: «Rate limiting / brute force scenario (if auth endpoint)» | Добавлен сценарий `SC-VS-001-4` в `docs/test-scenarios.md`; перенести в `Specification.md` при следующей правке FR-clips-1 |
| VS-04 | medium | `docs/Specification.md`, FR-clips-1 п.6 | «Все маршруты загрузки, задач и клипов требуют аутентификации. Анонимный посетитель не может запустить ни одного платного вызова» — прозой, без сценария. Мандатная категория Security BDD «Auth bypass attempt scenario» (тот же раздел навыка) не закрыта: существующие сценарии проверяют АВТОРИЗАЦИЮ (чужой `clip_id` → 404), но не АУТЕНТИФИКАЦИЮ (запрос без токена/с просроченным токеном) | Добавлен сценарий `SC-VS-001-5` в `docs/test-scenarios.md` |
| VS-05 | medium | `docs/Specification.md`, FR-clips-12 п.1, FR-clips-14 п.2 | `landing_visited.props.source` объявлен закрытым списком `direct \| partner \| clip_link \| other`, но значение `other` не встречается ни в одном из 48 сценариев (`grep -n "source = other\|source=other"` — 0 совпадений). Неверная классификация внешнего реферера (например, ошибочно попавшего в `direct`) не будет обнаружена ни одним тестом | Добавлен сценарий `SC-VS-014-2` в `docs/test-scenarios.md` |
| VS-06 | medium | `docs/Specification.md`, FR-clips-13 п.1 | Фоновая задача-уборщик (удаление исходника через 72ч, клипов free через 30 дней, `tmp/` через 1 день) не имеет ни одного сценария; `AC-clips-17`/`SC-US-014-1` проверяет только удаление ПО ЗАПРОСУ автора, не автоматическую очистку по TTL. Ровно тот класс дефекта, который `.claude/rules/guard-must-be-able-to-fail.md` называет «непроверенный фоновый механизм» | Добавлен сценарий `SC-VS-013-2` в `docs/test-scenarios.md` |
| VS-07 | low | `docs/Specification.md` §8, AC-clips-14 / §11 | `AC-clips-14` (валидация `BASE_URL`/`WATERMARK_TEXT` при старте — предмет `NFR-clips-3`, требование без привязки к конкретной User Story) назван сценарием `SC-US-012-5`, что визуально приписывает его истории US-012 («оператор видит расход»). Трассировочная таблица §11 корректно относит его к `NFR-clips-3`, а не к `FR-clips-10`/US-012 — расхождение чисто в неймингe, функционального дефекта нет | Опционально: переименовать в `SC-NFR-clips-3-N` при следующей правке, либо оставить как есть с явной пометкой в §11 (уже есть) |
| VS-08 | low | `docs/Specification.md` §3, US-004 и US-006 | US-004 связывает сразу три технических FR (транскрипция FR-clips-4, выбор фрагментов FR-clips-5, рендер FR-clips-7); US-006 — три (`FR-GROWTH-001`, `FR-clips-8`, неявно `FR-clips-15` — см. VS-01). Обе истории проходят INVEST "Testable" и "Valuable", но проваливают "Small" (не влезают в один цикл разработки как единая единица) | Не блокирует Phase 2; при декомпозиции Phase 3 на рабочие единицы (`swarm-file-evidence`) резать по отдельным FR, а не по US-ID |
| VS-09 | low | `docs/Specification.md` §8, AC-clips-17, AC-clips-18 | US-013 и US-014 имеют ровно по одному сценарию каждая ("happy path only" по рубрике Completeness) — 4/10 вместо 10/10. Обе истории просты, поэтому это не блокер, но обе — самое слабо протестированное место документа помимо VS-05/VS-06 выше (те же две истории) | Учтено при добавлении `SC-VS-014-2` и `SC-VS-013-2` в `docs/test-scenarios.md` — после их промоушена в Specification.md обе истории получат edge-case покрытие и поднимутся к 10/10 Completeness |

Нулевых находок по регексу vague-terms и по anti-fraud минимуму — не «предположение об отсутствии», а
результат проверки (grep-команды и построчный обзор всех 5 FR-GROWTH секций, см. Summary выше);
доказательство приведено там же.

## Вердикт

**🟡 WARNING** (не 🟢 READY и не 🔴 BLOCKED).

Средний балл 94.4/100 и отсутствие блокирующих находок (ни один Testable/Completeness/Traceability
не равен нулю) сами по себе дают READY по порогу навыка (≥70 средний, без блокеров). Понижаю до
WARNING сознательно, вопреки чистой формуле: три истории (US-011, US-013, US-014) и два мандатных
Security-BDD пробела (VS-03, VS-04) — это не косметика, это ровно тот класс, который
`.claude/rules/guard-must-be-able-to-fail.md` требует ловить ДО разработки, а не после. Пять из
шести добавленных `SC-VS-*` сценариев закрывают реальное отсутствие теста у объявленного (не
подразумеваемого) поведения — закрытый список значений, числовой лимит, фоновый механизм.

**Не блокирует Phase 3**, но перед началом кодирования FR-clips-1 (auth), FR-clips-13 (retention) и
FR-clips-14 (attribution source) рекомендую: (а) промоутировать `SC-VS-001-4`, `SC-VS-001-5`,
`SC-VS-014-2`, `SC-VS-013-2` из `docs/test-scenarios.md` в `docs/Specification.md` как полноценные
`AC-clips-N`; (б) решить VS-02 (разделить US-011 или сослаться на покрытие явно) до того, как Phase 3
нарежет рабочие единицы по этой истории.

Status: completed
