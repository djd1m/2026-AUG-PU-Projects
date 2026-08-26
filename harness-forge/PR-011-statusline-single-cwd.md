# PR-011: Статуслайн читает только CWD — в мультипроектном репозитории он слеп

**Класс:** неверная модель размещения · **Приоритет:** P1 · **Найдено:** прогон `/run mvp`, проект 01

## Проблема

В корне репозитория с несколькими проектами статуслайн показывает:

```
🎯 Roadmap  — no roadmap yet (run /next or /replicate)
📊 SPARC ●0/11  │  Plans 0  │  ADRs 0
```

При этом роадмап существует и содержит 13 фич, а SPARC-документов на месте 10 из 11 —
всё лежит в `projects/01-testimonials-senja/`.

Дефект не косметический: статуслайн — единственный постоянно видимый индикатор состояния
пайплайна. Показывая «роадмапа нет» там, где он есть, он предлагает запустить `/replicate`
поверх готового проекта.

## Доказательство

Источник — `.claude/hooks/statusline.cjs` (пакет `@dzhechkov/p-replicator@1.5.18`):

```js
const CWD = process.cwd();                                       // строка 20

function parseRoadmap() {
  const r = safeReadJson(path.join(CWD, '.claude', 'feature-roadmap.json'));   // строка 81
  if (!r || !Array.isArray(r.features)) return null;
  ...
  const mvp = features.filter((f) => f.priority === 'mvp');       // строка 88
```

```js
function parseSparcDocs() {
  const docsDir = path.join(CWD, 'docs');                          // строка 93
```

Единственный фиксированный путь от `CWD`. Ни рекурсии, ни знания про `projects/*`,
ни настройки, которой можно указать корень проекта.

### Найдено ТРИ независимых дефекта, а не один

**1. Путь. Ни одно расположение не даёт верной картины.**

Прогон с `cwd` = корень репозитория и с `cwd` = каталог проекта:

| Показатель | из корня репо | из каталога проекта | где правда |
|---|---|---|---|
| Roadmap | `— no roadmap yet` | `Done 2/13` ✅ | в проекте |
| SPARC | `●0/11` | `●10/11` ✅ | в проекте |
| ADRs | `0` | `●7` ✅ | в проекте |
| Skills | `●42/10` ✅ | `●0/10` | в корне |
| Cmds | `●15/11` ✅ | `●0/11` | в корне |
| Hooks | `●6/6` ✅ | `●0/6` | в корне |
| Settings | `⚠️ merged` ✅ | `missing` | в корне |

Корневая причина глубже, чем «не тот каталог»: статуслайн исходит из того, что
**корень тулкита и корень проекта — это одна папка**. В мультипроектном репозитории
(тулкит в корне, проекты в `projects/<имя>/`) таких папки две, и любой один `CWD`
делает половину строки ложной. Смена каталога дефект не лечит, а перекладывает.

**2. Схема. Счётчик MVP читает ноль на роадмапе, который сгенерировал сам же тулкит.**

Даже при верном `CWD` строка показывает `mvp 0/0` при 13 MVP-фичах:

```
🎯 Roadmap  │  [●○○○○○○○] mvp 0/0  │  Done 2/13
```

`parseRoadmap` фильтрует `f.priority === 'mvp'`, а роадмап проекта 01 хранит MVP-признак
в `tags` — `priority` там занят под `high|critical|medium`:

```json
{ "id": "FR-001", "priority": "high", "tags": ["mvp", "foundation"], "status": "done" }
```

Читатель и генератор разошлись в схеме. Полоса прогресса `[●○○○○○○○]` при этом рисуется
всегда — то есть отображает `0/0` как осмысленное состояние.

**3. Домен определяется по подстроке без границы слова.**

```js
const healthcare = /health|medical|клиник|hipaa|ФЗ-323/i;   // строка 218
```

`health` без `\b` совпадает со словом **`healthcheck`** — базовым термином Docker.
Одного упоминания healthcheck'а в `CLAUDE.md` достаточно, чтобы проект отзывов
классифицировался как `Domain: healthcare`:

```
🎯 Roadmap  │  ... │  Domain: healthcare
```

Проверено: строка про `healthcheck'и` в `CLAUDE.md` проекта 01 переключает домен.
Все проекты курса — на Docker Compose, то есть заявка касается не одного проекта.
Тот же класс: `bank` совпадёт с `bankruptcy`, `retail` — с `retailer` (это как раз
верно), `sla` внутри `translate`/`slash`.

## Исправление

### P0 — резолвить корень проекта, а не полагаться на CWD

```js
// Порядок: явная настройка → payload от Claude Code → поиск вверх → CWD.
function resolveProjectRoot(payload) {
  if (process.env.PREPLICATOR_PROJECT_ROOT) return process.env.PREPLICATOR_PROJECT_ROOT;
  const fromPayload = payload?.workspace?.current_dir;   // Claude Code уже это присылает
  const start = fromPayload || process.cwd();
  // Корень проекта — ближайший вверх каталог с .claude/feature-roadmap.json или docs/PRD.md
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (exists(path.join(dir, '.claude', 'feature-roadmap.json'))) return dir;
    if (exists(path.join(dir, 'docs', 'PRD.md'))) return dir;
    if (dir === path.dirname(dir)) break;
  }
  return start;
}
```

Разделить два корня явно — тулкит ищется от корня репозитория, состояние проекта от корня
проекта:

```js
const TOOLKIT_ROOT = findUp('.claude/skills') ?? CWD;   // Skills/Cmds/Hooks/Settings
const PROJECT_ROOT = resolveProjectRoot(payload);       // Roadmap/SPARC/ADR/Plans
```

Без этого разделения строка остаётся наполовину ложной при любом одном корне.

### P0 — мультипроектный режим

Когда `PROJECT_ROOT` не нашёлся, но есть `projects/*/.claude/feature-roadmap.json` —
показывать сводку, а не «роадмапа нет»:

```
🎯 Roadmap  │  01-testimonials-senja 2/13  │  ещё 7 проектов без роадмапа
```

### P1 — считать MVP по обоим признакам

```js
-const mvp = features.filter((f) => f.priority === 'mvp');
+const isMvp = (f) => f.priority === 'mvp' || (Array.isArray(f.tags) && f.tags.includes('mvp'));
+const mvp = features.filter(isMvp);
```

И не рисовать полосу прогресса при `mvpTotal === 0` — `0/0` со шкалой читается как
«ничего не сделано», хотя означает «признак не распознан».

Настоящее лечение — **зафиксировать схему роадмапа один раз** и проверять её тестом:
генератор и читатель обязаны сходиться, иначе счётчик тихо врёт.

### P1 — границы слова в доменных регэкспах

```js
-const healthcare = /health|medical|клиник|hipaa|ФЗ-323/i;
+const healthcare = /\bhealth(care)?\b|\bmedical\b|клиник|\bhipaa\b|ФЗ-323/i;
```

## Как проверить исправление

Детерминированно, без глаз — **слой 1**:

```bash
# 1. Роадмап в подкаталоге виден из корня репозитория
cd <репо-с-projects/01/.claude/feature-roadmap.json>
echo '{"cwd":"'$PWD'","workspace":{"current_dir":"'$PWD'"}}' | node .claude/hooks/statusline.cjs \
  | grep -q 'no roadmap yet' && echo FAIL || echo OK

# 2. MVP считается по tags
#    роадмап с 13 фичами tags:["mvp"] не должен давать "mvp 0/0"
... | grep -q 'mvp 0/0' && echo FAIL || echo OK

# 3. healthcheck не делает проект медицинским
printf 'healthcheck в docker-compose\n' > /tmp/t/CLAUDE.md
... | grep -q 'healthcare' && echo FAIL || echo OK
```

## Почему это слой 1, а не «заметят при взгляде»

Статуслайн показывает **правдоподобное** число, а не пустоту. `mvp 0/0` со шкалой,
`SPARC ●0/11`, `Domain: healthcare` — всё это выглядит как валидное состояние, поэтому
ошибка не привлекает внимания и живёт ровно столько, сколько живёт проект. Пропуск не
оставляет следов — общая черта всех заявок этой кузницы.
