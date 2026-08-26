# PR-013: Отгружаемый `settings.json` задаёт хуки относительными путями — они не запускаются

**Класс:** неверная модель размещения · **Приоритет:** P0 · **Найдено:** прогон `/run mvp`, проект 01

## Проблема

`p-replicator init` кладёт в проект `.claude/settings.json`, где все пять записей —
три `Stop`-хука, `SessionStart` и `statusLine` — ссылаются на скрипты **относительным**
путём:

```json
"statusLine": { "type": "command", "command": "node .claude/hooks/statusline.cjs" },
"hooks": {
  "SessionStart": [{ "matcher": "*", "hooks": [
    { "type": "command", "command": "node .claude/hooks/session-insights.cjs", "timeout": 5 }]}],
  "Stop": [{ "matcher": "*", "hooks": [
    { "type": "command", "command": "node .claude/hooks/autocommit-roadmap.cjs",  "timeout": 10 },
    { "type": "command", "command": "node .claude/hooks/autocommit-insights.cjs", "timeout": 10 },
    { "type": "command", "command": "node .claude/hooks/autocommit-plans.cjs",    "timeout": 10 }]}]
}
```

Относительный путь считается от **текущего рабочего каталога**, а не от каталога, где
лежит `settings.json`. Как только работа идёт из подкаталога, путь разворачивается мимо:

```
cwd = <repo>/projects/01-testimonials-senja
".claude/hooks/autocommit-roadmap.cjs"
  -> <repo>/projects/01-testimonials-senja/.claude/hooks/autocommit-roadmap.cjs   ← файла нет
реальное расположение:
  -> <repo>/.claude/hooks/autocommit-roadmap.cjs
```

Результат — **каждая** остановка сессии даёт три `MODULE_NOT_FOUND`:

```
Error: Cannot find module '<repo>/projects/01-testimonials-senja/.claude/hooks/autocommit-roadmap.cjs'
  code: 'MODULE_NOT_FOUND'
```

## Почему это P0, а не косметика

Хуки помечены `non-blocking`, поэтому сессия продолжается — и в этом вся опасность.
Отгружаемые хуки существуют ровно затем, чтобы **автоматически коммитить** роадмап,
инсайты и планы. Когда они молча не запускаются:

- изменения `.claude/feature-roadmap.json` не коммитятся;
- записи `/myinsights` не коммитятся;
- новые `docs/plans/*.md` не коммитятся;
- `SessionStart` не подставляет накопленные инсайты в контекст — то есть отключается
  весь механизм переноса знаний между сессиями.

Пользователь при этом видит только техническую ошибку про модуль. Связь «хук не нашёлся»
→ «мой роадмап больше не коммитится сам» из сообщения не выводится никак.

За прогон проекта 01 это означало: все 25 коммитов сделаны вручную, а если бы агент на
них не следил, состояние роадмапа расходилось бы с кодом молча.

## Это НЕ дубликат PR-011

Общий у них только корень допущения — «корень тулкита = корень проекта». Правки разные:

| | PR-011 | PR-013 (эта) |
|---|---|---|
| Что сломано | `statusline.cjs` **ищет данные** от `process.cwd()` | `settings.json` **не находит сами скрипты** |
| Что чинить | код `statusline.cjs` | шаблон `settings.json` в пакете |
| Кого задевает | только строку состояния | ВСЕ хуки: автокоммиты + инжект инсайтов |
| Симптом | правдоподобно неверные числа | `MODULE_NOT_FOUND` при каждом Stop |

Починка одной не чинит другую: после этой правки `statusline.cjs` **запускается**, но
по-прежнему читает роадмап от `process.cwd()` и считает MVP по `priority` вместо `tags`.

## Исправление

Claude Code подставляет в команды хуков переменную `$CLAUDE_PROJECT_DIR` — корень проекта.
Прибить пути к ней:

```diff
- "command": "node .claude/hooks/statusline.cjs"
+ "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/statusline.cjs\""

- "command": "node .claude/hooks/session-insights.cjs"
+ "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-insights.cjs\""

- "command": "node .claude/hooks/autocommit-roadmap.cjs"
+ "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/autocommit-roadmap.cjs\""

- "command": "node .claude/hooks/autocommit-insights.cjs"
+ "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/autocommit-insights.cjs\""

- "command": "node .claude/hooks/autocommit-plans.cjs"
+ "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/autocommit-plans.cjs\""
```

Кавычки обязательны: путь к проекту может содержать пробелы.

**Смежное:** правило разрешений `"Bash(node .claude/*)"` в том же файле после правки не
покрывает новую форму вызова. Хуков это не касается (они не проходят через систему
разрешений), но если правило задумано и для ручных вызовов — его стоит расширить.

### Проверка исправления — детерминированная

Тест, который ловит именно этот класс: запустить хук **из подкаталога**, а не из корня.

```bash
cd "$PROJECT/projects/any-subdir"
export CLAUDE_PROJECT_DIR="$PROJECT"
for h in autocommit-roadmap autocommit-insights autocommit-plans session-insights; do
  echo '{}' | node "$CLAUDE_PROJECT_DIR/.claude/hooks/$h.cjs" || echo "FAIL $h"
done
```

До правки — три `MODULE_NOT_FOUND`; после — все четыре с кодом 0 (проверено на проекте 01).
Прогон из корня репозитория проходит в обоих случаях и потому дефект НЕ ловит — тест
обязан запускаться из подкаталога.

## Границы проверки

Дефект наблюдался и исправлен в файле `.claude/settings.json` конкретного репозитория.
Происхождение файла установлено по нему самому — его же `_comment` гласит: *«Default hooks
+ statusline shipped by @dzhechkov/p-replicator init»*, и `.claude/rules/replicate-pipeline.md`
перечисляет `settings.json` среди пред-отгружаемых артефактов `init`.

**Сверить с исходником пакета не удалось**: на машине, где найден дефект,
`@dzhechkov/p-replicator` глобально не установлен (в `@dzhechkov` присутствуют только
`harness-cli` и `skills-feature-adr`). Перед правкой стоит убедиться, что шаблон в текущей
версии пакета всё ещё содержит относительные пути — возможно, это уже поправлено.
