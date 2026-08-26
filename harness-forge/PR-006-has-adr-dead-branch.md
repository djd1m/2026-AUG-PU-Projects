# PR-006: `has_adr` всегда False для SPARC-проектов — мёртвая ветка генератора

**Класс:** баг · **Приоритет:** P0 · **Найдено:** аудит проекта 01
**Однострочный фикс.**

## Проблема

`cc-toolkit-generator-enhanced` определяет наличие ADR по директории, а `/replicate`
генерирует ADR как **один файл**. Условие не выполняется никогда.

## Доказательство

`.claude/skills/cc-toolkit-generator-enhanced/modules/01-detect-parse.md:75`

```python
has_adr = len(glob(f"{docs_path}/docs/adr/*.md")) > 5
```

Ищется директория `docs/adr/` минимум с шестью файлами. Это структура пакета
`idea2prd-manual`.

А `/replicate` в Phase 1 создаёт (см. `.claude/commands/replicate.md`, список 11 документов):

```
docs/ADR.md          ← один файл, не директория
```

Проверка на реальном проекте:

```bash
$ ls projects/01-testimonials-senja/docs/adr/ 2>&1
ls: cannot access '.../docs/adr/': No such file or directory
$ ls projects/01-testimonials-senja/docs/ADR.md
docs/ADR.md          # 324 строки, 7 записей ADR-001..007
```

## Последствия

Для **любого** проекта, созданного через `/replicate`:

1. `has_adr` = `False` всегда, независимо от того, сколько ADR реально принято;
2. ветка `elif has_ddd or has_adr: return "IDEA2PRD_PARTIAL"` (строка 81) недостижима
   по признаку ADR;
3. все блоки `IF has_adr:` в остальных модулях генератора — мёртвый код;
4. архитектурные решения не влияют на генерируемый тулкит вообще.

В проекте 01 семь ADR, включая решения о безопасности growth-механики (ADR-002: `tier` не
передаётся клиенту) и о compliance (ADR-005: граница применения Claude под FTC). Генератор
о них не знает.

## Исправление

```diff
- has_adr = len(glob(f"{docs_path}/docs/adr/*.md")) > 5
+ has_adr = (len(glob(f"{docs_path}/docs/adr/*.md")) > 5
+            or exists(f"{docs_path}/docs/ADR.md"))
```

Одна строка. Обе структуры — директория `idea2prd` и одиночный файл SPARC — распознаются.

⚠️ Проверить последствия: после фикса SPARC-проекты с ADR начнут попадать в ветку
`IDEA2PRD_PARTIAL` (строка 81), которая проверяется **раньше** ветки `SPARC` (строка 83).
Возможно, правильнее не менять маршрутизацию, а вынести `has_adr` в отдельный флаг,
не влияющий на выбор `pipeline_type`. Решение за автором генератора.

## Проверка исправления

Прогнать генератор на `projects/01-testimonials-senja/` и убедиться, что ADR-решения
попадают в сгенерированные правила и агентов.
