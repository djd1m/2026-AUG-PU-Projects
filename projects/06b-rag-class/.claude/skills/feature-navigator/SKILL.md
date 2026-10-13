---
name: feature-navigator
description: >
  Навигация по дорожной карте N6b (.claude/feature-roadmap.json): прогресс MVP, текущая и следующие
  фичи, заблокированные зависимостями, тир роутера и строки переиспользования N1–N5. Обновляет статусы
  с каскадным разблокированием. Триггеры: «что делать дальше», «прогресс», «дорожная карта», «следующая фича».
version: "1.0"
maturity: beta
---

# N6b — навигатор фич

Схема файла — единственная: `.claude/commands/next.md` → «Roadmap Schema». Дополнительные поля этого проекта: `tier`
(T/S/M/L/XL корневого роутера), `reuse` (строки `docs/discovery/reuse-inventory.md`), `us_ids`, `fr_ids`, `sc_ids`, `adr_ids`.

## Что показать

1. **Прогресс MVP:** `done` / всего среди `priority == "mvp"`. Ноль фич — «данных нет», а не «0%», если файл не читается.
2. **В работе:** `in_progress` (не больше двух).
3. **Дальше (топ-3):** `next`, затем `planned`, у которых все `depends_on` в `done`; порядок — `number`.
4. **Заблокировано:** `blocked` с перечнем невыполненных `depends_on`.
5. Для каждой предложенной фичи — `tier` и первая строка `reuse`; XL — пометка «остановка на плане у владельца».

## Правила приоритета

- `in_progress` > `next` > `planned`; внутри — `priority` (`mvp` > `high` > `medium` > `low`), затем `number`.
- Фича с невыполненным `depends_on` не предлагается никогда.
- Фактический тир — по диффу: `bash ../../scripts/complexity-router.sh <файлы>`; поле `tier` — оценка до кода.

## Обновление статуса

При завершении фичи (все `sc_ids` имеют зелёные тесты, `expected_files` существуют, review без blocker):
1. `status` → `done`.
2. Каскад: каждая `blocked` фича, у которой теперь все `depends_on` в `done`, → `next`.
3. Коммит `docs(roadmap): <id> done` (Stop-хук `autocommit-roadmap.cjs` делает это и сам).

## Три действия (формат ответа)

```
MVP: 3/12 · в работе: widget · дальше: badge-referral (L), weekly-metric (L), demo-page (L, high)
1. Продолжить widget — /go widget
2. Проверить embed-contract на чужом origin
3. /next update — сверить статусы с кодом
```
