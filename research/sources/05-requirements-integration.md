# 05 — Как встроить обязательный блок «growth mechanics» в `/replicate` и quality gates

> Роль: методологическое исследование точек встраивания + формат требований + gates.
> Все локальные утверждения подтверждены `путь:строка`. Внешние — `[S-NN]` в конце файла.

---

## 0. Эмпирический факт, на котором строится вся карта (важно прочитать первым)

**Наблюдение из ЭТОЙ ЖЕ сессии, до какого-либо чтения файлов:** system-reminder, предшествовавший
задаче, дословно содержал полный текст `/home/user/2026-AUG-PU-Projects/CLAUDE.md` **и** всех шести
файлов `.claude/rules/*.md` (`replicate-pipeline.md`, `feature-lifecycle.md`,
`feature-adr-conventions.md`, `skill-interface-protocol.md`, `feature-adr-ultracode.md`,
`insights-capture.md`, `git-workflow.md`) — без единого запроса к ним с моей стороны.

Это прямое, воспроизводимое в рамках данной сессии свидетельство того, что харнесс (Claude Code /
Claude Agent SDK), в котором работает этот проект, **безусловно инжектирует все файлы
`.claude/rules/*.md` в контекст КАЖДОЙ новой сессии/саб-агента этого репозитория**, ещё до
выполнения какой-либо задачи. Это ровно то, что в `.claude/rules/feature-adr-conventions.md:87-92`
названо层-2 «always-loaded role file» — сильнее, чем «skill judgment» или «agent memory», но слабее
детерминированного теста (layer 1).

**Ограничение достоверности (см. также раздел «Пробелы»):** это наблюдение одной сессии, а не
документированная гарантия платформы; неизвестно, есть ли предел по числу/размеру файлов в
`.claude/rules/`, и распространяется ли это поведение на любые будущие конфигурации харнесса.
Оцениваю как **MEDIUM-HIGH** (воспроизводимый локальный факт, но не внешне документированный контракт).

Из этого прямо следует: `.claude/rules/growth-mechanics.md` — это **реально читаемая** точка
встраивания, а не гипотетическая. Но «прочитана» ≠ «применена»: сам файл-лестница
(`feature-adr-conventions.md:86-111`) явно предупреждает, что layer 2 всё ещё не даёт машинной
гарантии, и должен ссылаться на layer 1/3-проверки, а не заменять их.

---

## 1. Карта точек встраивания (4 варианта)

### (a) `.claude/rules/growth-mechanics.md` — всегда-загружаемое правило

- **Что подтверждено:** механизм авто-инжекции — раздел 0 выше. Формат файла — по образцу уже
  существующих `.claude/rules/git-workflow.md`, `.claude/rules/feature-lifecycle.md`.
- **Плюсы:** нулевая стоимость на каждый вызов — не нужно помнить вставить блок в конкретный
  `/replicate` или `/feature`; читается ЛЮБЫМ агентом в любой момент сессии, включая суб-агентов
  Phase 2 (validator-stories и т.д., `.claude/commands/replicate.md:250-257`).
- **Минусы:** сам по себе не проверяем машинно — ничего не грепает, реально ли Specification.md
  содержит growth-FR. Деградирует до layer 4/5, если не сослаться из него на gates раздела 5.
- **Кто и когда реально читает:** любой агент, открывший сессию в этом репозитории, с первого хода —
  но нет гарантии, что содержимое ПРИМЕНЕНО к конкретному артефакту.
- **Риск тихого пропуска:** MEDIUM — правило видно, но не форсирует действие.

### (b) Секция-шаблон в PRD/Specification (`templates/prd.md`, Phase 3 sparc-prd-mini)

- **Подтверждено:** `templates/prd.md` уже структурирован как набор ОБЯЗАТЕЛЬНЫХ NFR-категорий —
  4.2.1 Performance, 4.2.2 Availability, 4.2.3 Security, 4.2.4 Scalability
  (`.claude/skills/sparc-prd-mini/templates/prd.md:124-161`), и даже отдельная категория
  Accessibility 6.3 с явным WCAG-уровнем (`templates/prd.md:236-238`). Growth сегодня **отсутствует**
  как категория (полный просмотр файла, строки 1-337 — раздела Growth/Virality/Referral нет).
  Генерация PRD описана как `view("templates/prd.md") → заполнить шаблон данными из Phase 0-2`
  (`sparc-prd-mini/SKILL.md:395-399`), то есть шаблон РЕАЛЬНО читается на каждом прогоне Phase 3.
- **Плюсы:** ставит growth в один ряд с Security/Scalability как «нельзя не упомянуть» категорию —
  структурно то же самое решение, что уже сработало для Accessibility и Security в этом же шаблоне.
- **Минусы:** `replicate-pipeline.md:39` прямо документирует уже случившийся сбой этого же паттерна —
  «SKILL.md — только оркестратор, содержит summary, а не логику генерации; пропуск
  `modules/04-generate-p1.md` привёл к тихому исчезновению 10+ артефактов». Ничто не мешает Phase 3
  sparc-prd-mini «сжать» пустую growth-секцию в один абзац или пропустить её — шаблон обязывает
  структурно, но не механически.
- **Кто читает:** агент sparc-prd-mini, только на Phase 3 (Specification/PRD), в AUTO и MANUAL.
- **Риск тихого пропуска:** MEDIUM-HIGH без парного layer-1/3 гейта (раздел 5).

### (c) Отдельный скилл `.claude/skills/growth-mechanics/`

- **Подтверждено:** сегодня НЕ существует (`ls .claude/skills/` — growth-mechanics отсутствует), и
  ни в `sparc-prd-mini/SKILL.md:27-40` (External Dependencies), ни в `replicate.md:27-41` (таблица
  скиллов) growth-скилл не упомянут ни разу.
- **Плюсы:** соответствует `skill-interface-protocol.md` — можно объявить REQUIRED-зависимостью
  Phase 3 sparc-prd-mini с halt-веткой при отсутствии (`skill-interface-protocol.md` раздел 6
  Fallback Protocol: «REQUIRED и отсутствует → halt с ошибкой»). Переиспользуем как Foundation skill
  в каждом из 8 недельных проектов без копирования логики.
- **Минусы:** это тоже layer 4 «skill judgment» — «runs if invoked well»
  (`feature-adr-conventions.md:90`) — сам по себе ничего не гарантирует без внешнего форса вызова и
  проверки, что его output реально попал в Specification.md. Требует правки МИНИМУМ 2 файлов
  (`sparc-prd-mini/SKILL.md` — добавить в таблицу зависимостей; `replicate.md` — добавить в таблицу
  скиллов), иначе сегодня он инертен.
- **Кто вызывает:** только если явно прописан как REQUIRED в Phase 2.5/3 sparc-prd-mini.
- **Риск тихого пропуска:** HIGH сам по себе (layer 4), но становится приемлемым, если он —
  единственный источник контента, а его присутствие проверяется layer-1 тестом (`test -f`, раздел 5,
  G4).

### (d) Чек-лист в requirements-validator (аналог существующего «Security Acceptance Criteria»)

- **Подтверждено — это САМЫЙ близкий существующий прецедент в кодовой базе.**
  `requirements-validator/SKILL.md:106-129` уже реализует ровно нужный паттерн для security:
  триггер-условие («When requirements involve authentication, data storage, external APIs, or
  multi-tenancy»), таблица критериев, **Scoring Bonus: +5 present / -10 missing (BLOCKED if score
  drops below 50)** (строка 121-122), и обязательный список BDD-сценариев «ALWAYS generate»
  (строки 124-129: auth bypass, injection, cross-tenant, rate limiting).
  Блокирующий порог самого скилла — score < 50 (`SKILL.md:8-9`, `scoring-system.md:56-66`).
- **Почему это единственный по-настоящему БЛОКИРУЮЩИЙ вариант:** Phase 2 (Validation) уже официально
  не пропускаемая фаза — `replicate-pipeline.md:12`: «Never skip Phase 2 (Validation). Toolkit (Phase
  3) MUST be built on validated documentation» — и вердикт 🔴 NEEDS WORK возвращает пайплайн на
  Phase 1 (`replicate.md:279-283`, тот же порог в `feature-lifecycle.md:81-83`: READY ≥70,
  CAVEATS 50-69, NEEDS WORK <50 или любой blocker). Если growth-malus утягивает средний score ниже
  70/50, переход в Phase 3 механически блокируется существующей, уже действующей машинерией —
  ничего изобретать не нужно, только добавить критерий.
- **Минусы:** validator оценивает то, что УЖЕ есть в тексте Specification.md — он не может
  «изобрести» отсутствующее требование, только оштрафовать за его отсутствие. Значит (d) обязательно
  нужно парить с (b) или (c) как источником текста. Также: сегодня growth-триггер в
  requirements-validator отсутствует — нужна правка `SKILL.md`.
- **Кто читает:** агенты `validator-stories` / `validator-acceptance` на каждом Phase 2 `/replicate`
  И на каждом Phase 2 `/feature` (`feature-lifecycle.md` — тот же 4-фазный цикл применяется к любой
  фиче после бутстрапа, что закрывает риск №6 из раздела 6 ниже).
- **Риск тихого пропуска:** LOW — это единственный вариант из четырёх, где отсутствие контента
  МЕХАНИЧЕСКИ снижает числовой score и может физически остановить пайплайн, а не просто «выглядеть
  нехорошо».

---

## 2. Лестница стоимости обнаружения → куда класть каждую проверку growth-блока

Ссылка на лестницу: `.claude/rules/feature-adr-conventions.md:86-111` (5 уровней, 1 — самый дешёвый и
надёжный, 5 — вероятностный). Применяю её дословно к growth-блоку:

| # | Требование growth-блока | Уровень | Механизм |
|---|---|---|---|
| 1 | Specification.md/PRD.md содержит growth-секцию | **Layer 1** | `grep -ciE "growth (loop|mechanic)|viral|referral|affiliate" docs/Specification.md docs/PRD.md` ≥1, иначе Phase 1 не считается завершённой (не показывать CP3 ✅) |
| 2 | Каждый `FR-GROWTH-\d+` имеет BDD-сценарий с тем же тегом | **Layer 1** | grep-diff множеств ID из Specification.md против `@FR-GROWTH-\d+` тегов в `docs/test-scenarios.md` — тот же принцип трассируемости, что уже описан в `requirements-validator/references/bdd-patterns.md:174-184` («@US-001 @AC-001... enables bidirectional traceability») |
| 3 | Growth-формулировки не содержат vague-терминов («viral», «growth hacking» без числа) | **Layer 1** | Уже существующий механизм — добавить growth-термины в таблицу vague-terms `requirements-validator/SKILL.md:46-54` и `references/smart-criteria.md` (там уже -2 балла за vague-term) |
| 4 | Правило growth обязательно объясняет ПОЧЕМУ/КТО владелец/минимальный набор FR | **Layer 2** | `.claude/rules/growth-mechanics.md`, всегда-загружаемый (раздел 0) — но ссылается на layer 1/3, не заменяет их |
| 5 | Отсутствие growth-FR в Specification.md механически снижает score и может заблокировать Phase 3 | **Layer 3** | Новый раздел «Growth Mechanics Acceptance Criteria» в `requirements-validator/SKILL.md`, структурно = существующему Security-разделу (`SKILL.md:106-129`), но БЕЗ условного триггера — применяется ВСЕГДА (курсовой мандат, не «when relevant») |
| 6 | Growth-раздел физически присутствует в сгенерированном тулките КАЖДОГО из 8 проектов | **Layer 1** | `test -f .claude/rules/growth-mechanics.md` после Phase 3 — по аналогии с `npx p-replicator verify`, который уже проверяет pre-shipped-контракт (`replicate-pipeline.md` раздел «Post-pipeline verification») |
| 7 | «Ревьюер на Phase 4 заметит, если чего-то не хватает» | **Layer 4/5 — АНТИПАТТЕРН** | Именно это explicit anti-pattern из `feature-adr-conventions.md:110-111`: «the critic/QE agent will catch it» for anything a 5-line test could catch» |

**Ключевая находка о существующем пробеле (Layer 4/5 dead end, уже в системе):**
`reverse-engineering-unicorn/modules/05-growth-engine.md` (300 строк) уже производит качественный
growth-анализ ЦЕЛЕВОЙ компании (loop type, top-3 channels, retention playbook, moats,
second-order effects) — но:

1. Модуль запускается ТОЛЬКО «If B2C/PLG» (`replicate.md:169`), то есть условно, не всегда;
2. Его output — это playbook-проза (Markdown-таблицы про конкурента), а НЕ FR/Gherkin-формат,
   который `requirements-validator` умеет скорить;
3. Ничто не форсирует перенос этого анализа в Specification.md как FR — проверено грепом:
   `grep -rn -i "growth" .claude/skills/cc-toolkit-generator-enhanced/modules/*.md
   .claude/skills/cc-toolkit-generator-enhanced/references/*.md` — **0 совпадений**, и по всему
   root `CLAUDE.md` — тоже **0 совпадений** слов growth/viral/referral/affiliate/influencer.

Иными словами: анализ growth-движка целевой компании (Phase 0, опционально) **сегодня — чистый
layer-4/5 тупик**: он существует, он хорош, но у него нет принудительного пути в требования. Это
единственная наиболее конкретная находка этого исследования.

---

## 3. Формат growth-требований (проходит INVEST/SMART, точный шаблон)

Использую ID-схему `FR-GROWTH-NNN`, структуру user-story-таблицы + Gherkin из
`templates/prd.md:104-119`, плюс обязательные числовые SMART-критерии
(`references/smart-criteria.md`, vague-term таблица) и трассируемость-тег `bdd-patterns.md:174-184`.

### Шаблон

```markdown
### FR-GROWTH-{NNN}: {Название}

**User Story:**
As a [persona],
I want to [конкретное, измеримое действие],
So that [конкретная числовая выгода].

**Priority:** Must (MVP) | Should | Could
**Growth Mechanic Type:** Viral Loop | Referral/Affiliate | Influencer/Partnership | Attribution Badge

**Acceptance Criteria (Gherkin):**
```gherkin
Feature: {Feature Name}
  @FR-GROWTH-{NNN} @growth @happy-path
  Scenario: ...
    Given ...
    When ...
    Then ... [с числовым порогом]

  @FR-GROWTH-{NNN} @growth @edge-case
  Scenario: ...

  @FR-GROWTH-{NNN} @growth @security
  Scenario: ... (anti-fraud / anti-abuse — ОБЯЗАТЕЛЕН для каждого growth-FR, по аналогии с
                 requirements-validator/SKILL.md:124-129 "ALWAYS generate")
```

**Success Metric:** [название метрики, формула, число, срок]
**Definition of Done:**
- [ ] AC проходят автотесты
- [ ] Механизм трекинга/атрибуции имеет владельца и audit log
- [ ] Anti-fraud сценарий задокументирован и имеет митигацию
- [ ] Метрика инструментирована в аналитике до подписания Completion.md
```

### Образец 1 — Viral Loop

```markdown
### FR-GROWTH-001: One-click share at the aha moment

**User Story:**
As a user who just received value from the product (сгенерировал виджет отзывов / QR-страницу
/ клип),
I want to share a personalized referral link in one click в момент пиковой удовлетворённости,
So that я приглашаю новых пользователей, пока энтузиазм максимален, — рост без paid spend.

**Priority:** Must (MVP)
**Growth Mechanic Type:** Viral Loop

```gherkin
Feature: One-click viral share at aha moment
  @FR-GROWTH-001 @growth @happy-path
  Scenario: User shares immediately after first success event
    Given a user completed their first successful core action within the last 2 minutes
    When the system shows a share prompt with a pre-filled referral link
    And the user clicks "Share"
    Then a unique referral link is generated in <500ms
    And the share event is logged with source=aha_moment

  @FR-GROWTH-001 @growth @edge-case
  Scenario: Duplicate signup from same referral is deduplicated
    Given a referral link produced 2 signups from the same IP within 5 minutes
    When the second signup is processed
    Then it is flagged for manual fraud review
    And it does not count toward the referrer's reward until cleared

  @FR-GROWTH-001 @growth @security
  Scenario: Self-referral is blocked
    Given a user opens their own referral link from a second session
    And the new account shares payment method or device fingerprint with the referrer
    Then the referral is rejected and no reward is issued
```

**Success Metric:** K-factor ≥ 0.15 к M3, ≥ 0.3 к M6 (K = i × c, где i — среднее число
инвайтов на пользователя, c — конверсия инвайта в регистрацию) [S-05][S-06]
**DoD:** событие share инструментировано в аналитике; anti-fraud покрывает ≥2 вектора
(IP + device fingerprint).
```

### Образец 2 — Referral/Affiliate Tracking

```markdown
### FR-GROWTH-002: Affiliate attribution through paid conversion (not just signup)

**User Story:**
As a partner/affiliate promoting the product,
I want my referral code to be tracked from click through the PAID-conversion event,
So that I'm credited on revenue I actually generated, not just on traffic.

**Priority:** Must (MVP)
**Growth Mechanic Type:** Referral/Affiliate

```gherkin
Feature: Affiliate attribution through paid conversion
  @FR-GROWTH-002 @growth @happy-path
  Scenario: Attribution survives from click to paid conversion
    Given a visitor clicks affiliate link "ref=partner123"
    And a first-party attribution cookie is set with 30-day expiry
    When the visitor signs up 10 days later without the ref parameter present
    And converts to a paid plan on day 25
    Then affiliate "partner123" is credited with the conversion
    And the commission event fires within 1 minute of the billing webhook

  @FR-GROWTH-002 @growth @edge-case
  Scenario: Last-click vs first-click conflict resolved deterministically
    Given a user clicked affiliate link A then affiliate link B within the same 30-day window
    When the user converts to paid
    Then exactly one affiliate is credited per the documented attribution model
    And never both, never neither

  @FR-GROWTH-002 @growth @security
  Scenario: Self-referral / commission fraud is held for review
    Given an affiliate account and a customer account share email domain, payment method,
    or device fingerprint
    When a conversion event would generate commission
    Then the commission is held in "pending review" status, not auto-paid
```

**Success Metric:** Attribution accuracy ≥99% при ежемесячной сверке с billing-записями
**DoD:** событие комиссии — webhook-driven, не polling; процесс диспута задокументирован в
Completion.md runbook.
```

### Образец 3 — Attribution Badge (аналог Senja "wall of love" / QR-виджета)

```markdown
### FR-GROWTH-003: Mandatory attribution badge on free-tier embeds

**User Story:**
As the product operator,
I want every embed/widget generated by a free-tier user to carry a visible "Powered by
{Product}" badge by default,
So that every free user's distribution surface becomes an acquisition channel.

**Priority:** Must (MVP)
**Growth Mechanic Type:** Attribution Badge

```gherkin
Feature: Mandatory attribution badge on free-tier outputs
  @FR-GROWTH-003 @growth @happy-path
  Scenario: Free-tier embed includes a badge with a tracked link
    Given a free-tier user publishes a widget
    When the embed code is generated
    Then it includes a "Powered by {Product}" badge with a UTM-tagged link
    And badge click-through is logged as a distinct event type

  @FR-GROWTH-003 @growth @edge-case
  Scenario: Paid plan removes the badge
    Given a user is on a plan that includes "remove branding"
    When they publish a widget
    Then no badge is rendered, enforced server-side

  @FR-GROWTH-003 @growth @error-handling
  Scenario: Client-side badge-stripping attempt is neutralized
    Given a free-tier user edits the embed HTML to strip the badge
    When the widget renders via the product's hosted script
    Then the badge re-injects via the hosted script
    And the removal attempt is logged
```

**Success Metric:** доля новых регистраций, пришедших через badge, ≥X% к M6
**DoD:** non-removability обеспечена на сервере/через hosted script, а не только в документации.
```

### Образец 4 — Influencer/Creator Partnership

```markdown
### FR-GROWTH-004: Trackable creator/influencer partnership codes

**User Story:**
As a growth owner,
I want a documented creator partnership program with a unique trackable code per creator,
So that we can systematically test and scale influencer-led acquisition.

**Priority:** Should
**Growth Mechanic Type:** Influencer/Partnership

```gherkin
Feature: Creator partnership tracked codes
  @FR-GROWTH-004 @growth @happy-path
  Scenario: Creator code applies discount and attributes signup
    Given a creator has a unique code "CREATOR20"
    When a new user applies the code at signup
    Then the documented discount is applied
    And the signup is attributed to "CREATOR20" in the affiliate ledger

  @FR-GROWTH-004 @growth @edge-case
  Scenario: Code usage cap is enforced
    Given a creator code has a redemption cap of 500
    When the 501st user attempts to apply it
    Then the discount is not applied and the growth owner is notified
```

**Success Metric:** CAC через creator-канал, отслеживаемый против blended CAC (из Module 4
Business & Finance, `reverse-engineering-unicorn`)
**DoD:** условия партнёрства задокументированы; cap/expiry кода проверяются на сервере.
```

---

## 4. Что именно передавать в `/replicate` (проверено по фактическому SKILL.md)

**Проверенные факты о режимах:**
- `sparc-prd-mini` поддерживает ровно два режима — **AUTO** и **MANUAL**
  (`sparc-prd-mini/SKILL.md:52-70`). HYBRID у него НЕТ — HYBRID (default) относится к ДРУГОМУ
  скиллу, `cc-toolkit-generator-enhanced` (его собственный frontmatter: «Three modes: AUTO, HYBRID
  (default), MANUAL» — Phase 3 генерации тулкита, не Phase 1 генерации PRD). Путать их нельзя.
- Механизм pre-filled context уже СУЩЕСТВУЕТ и задокументирован буквально:
  `sparc-prd-mini/SKILL.md:846-868` «Accepting External Context (from parent skills)» — родитель
  может передать готовый Product Brief / Research Findings / Solution Strategy / **Architecture
  Constraints**, и скилл сам определяет, какие фазы пропустить по наличию входов.
- `replicate.md` УЖЕ реализует этот механизм для двух блоков — «Architecture Constraints» и
  «Security Pattern» (`replicate.md:194-213`), передаваемых как YAML прямо в вызов Phase 1.

**Рекомендация — минимальный по диффу путь:** добавить ТРЕТИЙ такой же YAML-блок,
«Growth Mechanics Constraints», рядом с существующими двумя (`replicate.md:194-213`), **всегда**
(не условно, в отличие от Security Pattern, который передаётся «If external integrations»):

```yaml
Architecture Constraints:
  pattern: "Distributed Monolith (Monorepo)"
  ...

Growth Mechanics Constraints: # ВСЕГДА передавать — курсовой мандат, не опционально
  mandatory: true
  minimum_fr_set:
    - "≥1 viral/sharing loop FR (FR-GROWTH-00x, тип Viral Loop)"
    - "≥1 referral/affiliate tracking FR с anti-fraud AC (тип Referral/Affiliate)"
    - "≥1 attribution badge ИЛИ influencer-partnership FR"
  reference: ".claude/rules/growth-mechanics.md"
  format: "см. раздел 3 этого документа — FR-GROWTH-NNN + Gherkin + numeric metric + DoD"

Security Pattern: # If external integrations
  ...
```

Это требует правки ровно 2 файлов: `.claude/commands/replicate.md` (добавить блок) и
`.claude/skills/sparc-prd-mini/templates/prd.md` (добавить секцию 4.4 «Growth & Distribution
Requirements», по образцу существующих 4.2.1-4.2.4) — НЕ обязательно заводить новый скилл (вариант c
раздела 1 полезен, но не необходим как первый шаг).

**Режим:** MANUAL безопаснее для этого блока — существующий чекпоинт CP3 в конце Specification
(`sparc-prd-mini/SKILL.md:401-417`) даёт явную точку подтверждения человеком. Но реалистично к
неделе 3-4 курса будет использоваться AUTO — поэтому машинный гейт (раздел 5) важнее выбора режима.

**Точка входа в сам `/replicate`:** блок вставляется в существующий текст Phase 1 «PLANNING»
(`replicate.md:182-213`), НЕ в аргументы команды `$ARGUMENTS` пользователя — то есть пользователю
курса НЕ нужно ничего писать дополнительно при каждом вызове `/replicate <идея продукта>`; блок
жёстко зашит в промпт координатора и передаётся автоматически каждый раз.

---

## 5. Quality Gates — конкретные машинно-проверяемые условия

| Gate | Фаза | Проверка | Действие при провале |
|---|---|---|---|
| **G1** | Конец Phase 1, перед CP3 | `grep -ciE "growth (loop|mechanic)|viral|referral|affiliate" docs/Specification.md docs/PRD.md` ≥1 | Не показывать чекпоинт «✅ PHASE 1» — считать Phase 1 незавершённой |
| **G2** | Phase 2, requirements-validator | Новый безусловный раздел «Growth Mechanics Acceptance Criteria» в `requirements-validator/SKILL.md`, структурно идентичный Security (`SKILL.md:106-129`): malus **-10**, если growth-FR в Specification.md нет вовсе | Итоговый средний score падает; при <50 — 🔴 NEEDS WORK возвращает на Phase 1 (использует УЖЕ существующий порог `feature-lifecycle.md:81-83`, `scoring-system.md:56-66`) |
| **G3** | Phase 2, трассируемость | Множество `FR-GROWTH-\d+` из Specification.md == множество `@FR-GROWTH-\d+` в `docs/test-scenarios.md` (тот же приём, что `bdd-patterns.md:174-184`) | Разница множеств = BLOCKED-находка в отчёте `docs/validation-report.md` |
| **G4** | Phase 3, cc-toolkit-generator-enhanced | `test -f .claude/rules/growth-mechanics.md` после генерации тулкита; growth-правило копируется в КАЖДЫЙ проект БЕЗУСЛОВНО (не по score, как сегодня секьюрити-паттерны на `SKILL.md:280`, а как обязательный 6-й pre-shipped-подобный файл) | Non-zero exit → тот же стиль, что уже используется в `npx p-replicator verify` (`replicate-pipeline.md`, «Post-pipeline verification») |
| **G5** | Phase 4, Finalize, перед commit | Повторить G1+G3+G4 как pre-commit smoke test перед `git commit -m "chore: initial project setup..."` (`replicate.md:376-380`) | По аналогии с NO_STUBS_GATE (`feature-adr-conventions.md` ladder + `.claude/workflows/feature-adr.js:1974`) — HIGH gap, коммит не делается молча |
| **G6** | Любой `/feature` после бутстрапа | Если новая фича трогает пути `share|invite|referral|affiliate|pricing|billing` (регэксп по именам файлов/фичи) — G2 повторно применяется в Phase VALIDATE фичи | Замыкает цикл на `feature-lifecycle.md` PLAN→VALIDATE→IMPLEMENT→REVIEW, не даёт «день 2» фичам тихо обойти growth-мандат |

---

## 6. Риски — почему такие блоки обычно проваливаются на практике

1. **Growth трактуется как «маркетинговый текст», а не инженерное требование.** Контрмера — раздел 3
   (числовые SMART-критерии, а не проза). Согласуется с внешней практикой: cross-cutting NFR
   работают, только если captured с той же строгостью, что функциональные [S-01][S-02].
2. **«Добавим потом» — откладывание за пределы MVP-ядра.** Курсовой мандат существует именно потому,
   что откладывание — дефолт. Блок должен попадать в Specification.md на этапе Phase 1, а не
   ретрофититься в Phase 3/4 — этот же урок уже явно записан в этом репозитории:
   `replicate-pipeline.md:39` («пропуск module-файла тихо убил 10+ артефактов») и
   `feature-adr-conventions.md` ladder («700-строчный cap на ревью поймал один файл и пропустил
   соседний в том же MR»).
3. **Growth формулируется расплывчато** («пойти viral», «привлечь блогеров») — и именно поэтому его
   стоит гнать через requirements-validator: расплывчатые термины уже штрафуются -2 балла за термин
   (`smart-criteria.md`), это заставляет переписывать в числа.
4. **Anti-fraud/edge-case первым режется под дедлайн.** Контрмера — сделать fraud-сценарий
   ОБЯЗАТЕЛЬНЫМ полем каждого FR-GROWTH (как в security «ALWAYS generate»,
   `requirements-validator/SKILL.md:124-129`), а не «если время останется».
5. **Разрыв анализ→требование.** Phase 0 Module 5 (Growth Engine) уже производит отличный
   стратегический анализ (loop, каналы, moats) — но, как показано в разделе 2, у него сегодня НЕТ
   принудительного пути в Specification.md: он опционален (только B2C/PLG,
   `replicate.md:169`) и его выходной формат (playbook-проза) не тот, что скорит
   requirements-validator. Без G1-G3 этот анализ выбрасывается ровно тогда, когда нужнее всего.
6. **Growth-требования остаются только в docs/, но никогда не попадают в always-loaded правило
   тулкита.** Подтверждено: `cc-toolkit-generator-enhanced` сегодня НЕ упоминает growth ни разу
   (0 совпадений по всем `modules/*.md` и `references/*.md`) — значит неделя 2 регенерирует тот же
   пробел заново. Нужен G4.
7. **Давление 8-недельного каденса.** К неделе 3-4 MANUAL-чекпоинты будут "ок"-нуты не глядя под
   давлением времени. Единственное, что переживает такое давление — машинный гейт, который нельзя
   обойти словом «ок». Отсюда рекомендация: якорь — вариант (d) requirements-validator (layer 3),
   а не только (a) rule-файл (layer 2) или (c) скилл (layer 4).

---

## Источники (внешние)

- **[S-01]** LinkedIn Collaborative Article, "How do you plan for non-functional requirements in
  Agile?" — https://www.linkedin.com/advice/1/how-do-you-plan-non-functional-requirements-xrizc —
  доступ 2026-08-26. Тезис: cross-cutting NFR либо фиксируются на уровне продукта и наследуются
  историями, либо становятся частью Definition of Ready. **MEDIUM** (агрегированная
  crowd-sourced статья, не первичный источник методологии).
- **[S-02]** Медиа-обзор по Definition of Done: security/accessibility как компоненты DoD —
  различные источники, включая Section508.gov «Sample User Stories for Accessible ICT»
  (https://www.section508.gov/develop/user-stories/) и статью о DoD/DoR/security
  (medium.com/@gaurav.bhorkar/dod-dor-and-security-aff3ab1c4728) — доступ 2026-08-26. Важная
  контр-нота из поисковой выдачи: часть источников утверждает, что NFR в DoD стоит **адаптировать
  под проект, а не делать универсально обязательными для КАЖДОЙ истории** — это ослабляет (не
  опровергает) аргумент «growth = как security», и я привожу это честно, а не замалчиваю. **MEDIUM**.
- **[S-03]** Обзор growth loops / referral-механик (Inflection.io, Mixpanel PLG guide 2026,
  productschool.com, thegood.com growth-loops) — доступ 2026-08-26. Тезис: viral loop = trigger →
  activation → engagement → amplification/invite → усиление предыдущих шагов; incentive должен быть
  привязан к core value продукта. **MEDIUM** (маркетинговые блоги, консистентны друг с другом).
- **[S-04]** Building Evolutionary Architecture — концепция fitness functions как
  «automated, objective, repeatable test that assesses an architectural characteristic» —
  через агрегаторы (continuous-architecture.org/practices/fitness-functions/,
  InfoQ «fitness-functions-architecture») — доступ 2026-08-26. Использовано как обоснование
  layer-1/3 подхода к growth-гейтам (машинный тест вместо ревью). **HIGH** (устоявшееся, широко
  цитируемое определение из книги Ford/Parsons/Kua).
- **[S-05]** Формула K-factor: K = i × c (invites per user × conversion rate), K>1 — самоподдерживающийся
  рост, K=1 — линейный, типичный здоровый диапазон 0.3-0.7 — LaunchList guide, Wall Street Prep,
  First Round Review glossary — доступ 2026-08-26. **HIGH** (формула консистентна по всем
  независимым источникам, стандартное определение).
- **[S-06]** Атрибуция viral/referral-конверсий требует учёта именно СКОНВЕРТИРОВАВШИХСЯ
  приглашений, а не валового числа шэров — та же группа источников, что [S-05] — доступ 2026-08-26.
  **MEDIUM-HIGH**.
- **[S-07]** Docs-as-code: markdownlint + Vale в CI как способ детерминированно enforce'ить структуру
  и присутствие секций в markdown-документации (github.com/DavidAnson/markdownlint,
  buildwithfern.com/post/docs-linting-guide) — доступ 2026-08-26. Использовано как индустриальный
  прецедент для «grep-guard на присутствие growth-секции» (раздел 5, G1/G4). **HIGH** (инструменты
  реально существуют и широко используются, это не гипотетическая практика).

Все внешние источники получены через WebSearch (сниппеты выдачи), не через полный WebFetch каждой
страницы — см. «Пробелы» ниже.

---

## Пробелы и что не удалось проверить

- **Наблюдение раздела 0** (авто-загрузка `.claude/rules/*.md`) подтверждено только для ОДНОЙ этой
  сессии/саб-агента. Не проверено: сохраняется ли поведение для агентов, запущенных иным способом
  (`Agent`/`Task` tool с другим `subagent_type`), есть ли порог по числу или суммарному размеру
  файлов в `.claude/rules/`, который ещё не достигнут (сейчас 6 файлов).
- Внешние источники [S-01]–[S-07] взяты из сниппетов `WebSearch`, а не из полного текста через
  `WebFetch` — для устоявшихся формул/определений ([S-04] fitness functions, [S-05] K-factor)
  оцениваю как HIGH, для более спорных нормативных утверждений ([S-01], [S-02]) — как MEDIUM, честно
  включая контраргумент из [S-02] о том, что не все источники считают cross-cutting NFR обязательными
  для каждой истории.
- Не читал напрямую `.claude/commands/feature.md` и `.claude/commands/feature-ent.md` — задача
  называла конкретный список файлов для проверки, эти два в него не входили; ссылки на их поведение
  в этом документе (G6, раздел 4) опираются на `.claude/rules/feature-lifecycle.md`, который был
  прочитан полностью.
- Не выполнял `/replicate` end-to-end с реально вставленным growth-блоком — все предложенные
  grep-команды (G1, G3, G4, G5) спроектированы по образцу уже действующих в этом репозитории
  конвенций (`NO_STUBS_GATE`, `npx p-replicator verify`), но не были фактически прогнаны против
  сгенерированного дерева `docs/`.
- Не исследовал глубоко, всплывёт ли growth-тематика естественным путём в Phase 1 Research через
  `goap-research-ed25519` без явного форсирования — файл скилла не читался в рамках этой задачи
  (не входил в заданный список), только упоминания о нём в `sparc-prd-mini/SKILL.md`.
- Не проверял `cc-toolkit-generator-enhanced`'s HYBRID-режим подробно (только frontmatter-описание и
  отсутствие слова "growth" по всем его `modules/*.md`/`references/*.md` через grep) — детальная
  логика HYBRID-триггеров вне списка файлов, заданных для этой задачи.
