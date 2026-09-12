# Квитанция — Phase 1 PLAN, фича `foundation`, плечо A

RUN_ID: `20260912T193004Z-foundation-A-7a62`
WORK_UNIT_ID: `plan-foundation`
Дата: 2026-09-12. Фаза: Phase 1 (PLAN). Плечо: A.
requested: claude-opus-5; actual: unknown to worker.

## Что написано

| Файл | Строк |
|---|---|
| `docs/features/foundation/01_specification.md` | 358 |
| `docs/features/foundation/02_pseudocode.md` | 334 |
| `docs/features/foundation/03_architecture.md` | 146 |
| `docs/features/foundation/04_refinement.md` | 173 |
| `docs/features/foundation/05_completion.md` | 132 |

Вне `docs/features/foundation/` и этой квитанции не изменено ничего. Кода не написано.

## Числа

| Что | Сколько |
|---|---|
| `### FR-foundation-n` и `### NFR-foundation-n` | 12 (10 FR + 2 NFR) |
| `### AC-foundation-n` | 16 |
| `### Algorithm:` блоков | 14 |
| Машинных ключей `REQUIREMENT:` | 28 — каждый ключ спецификации ровно один раз |
| Унаследованных сценариев проекта (`SC-US-nnn-k`) | 2 (SC-US-001-1, SC-US-009-1), оба заявлены алгоритмом |
| Планируемых тестовых файлов | 14, заголовки перечислены дословно в `04_refinement.md` |

## Ворота

Использованная команда (из каталога проекта):

```bash
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --traceability \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Оба `--*-role-map-source` обязательны: в `projects/04-calorie-vision-cal-ai/.claude/` нет ни
`commands/`, ни `skills/sparc-prd-mini/` (toolkit живёт в корневой `.claude/`), и без явных путей
проверка возвращает `2` с `NOT-ESTABLISHED role-map=… is missing unreadable or a symlink`.

Вывод:

```
TRACE contour=project specification=./docs/Specification.md pseudocode=./docs/Pseudocode.md
COUNT requirements=35 algorithms=33 missing-algorithm=2 orphan-algorithm=0
GAP project specification->pseudocode FR-GROWTH-005
GAP project specification->pseudocode NFR-PERF-002
TRACE contour=foundation specification=./docs/features/foundation/01_specification.md pseudocode=./docs/features/foundation/02_pseudocode.md
COUNT requirements=28 algorithms=28 missing-algorithm=0 orphan-algorithm=0
PASS contour=foundation bidirectional traceability complete
VERDICT traceability=FAIL features=1 gaps=2 inconclusive=0
```

**Код возврата: 1. Контур фичи — PASS; оба разрыва принадлежат контуру ПРОЕКТА и существовали до
этой работы.** Базовый прогон той же командой ДО создания каталога `docs/features/foundation/` дал
ровно те же две строки и тот же код `1`: `FR-GROWTH-005` и `NFR-PERF-002` объявлены в
`docs/Specification.md`, но ни один `### Algorithm:` в `docs/Pseudocode.md` их не заявляет. Чинится
это правкой `docs/Pseudocode.md` — файла вне разрешённого мне набора, поэтому не тронут. Код `0`
на `--traceability` недостижим, пока разрывы проекта открыты: флаг проверяет оба контура в одном
прогоне и складывает их разрывы.

## Два расширения канона, требующие решения владельца

Записаны в `01_specification.md` (раздел «Два расширения канона, введённые ОСОЗНАННО»), а не введены
молча:

1. `POST /api/v1/auth/device` — 14-й маршрут продукта. FR-AUTH-001 требует сессию ДО первой съёмки,
   а создание сессии хуком на любом запросе плодило бы строку на каждую пробу здоровья.
2. `GET /health` — вне префикса `/api/v1`, поэтому счёт продуктовых маршрутов не трогает.
   `docker-compose.yml` (строки 85–88) прямо требует вводить служебную ручку «решением по канону»;
   это оно. Текущая проба здоровья в compose — TCP-соединение, и она остаётся действительной;
   перевод её на HTTP — правка compose в Phase 3, а не обязательство спецификации.

## Решения, принятые в пределах задания

- **Роли БД — три названные, но учётных записей две.** `n4_migrate` создаётся `NOLOGIN` и владеет
  схемой; раннер работает из-под существующего в compose `n4_admin` и делает `SET ROLE n4_migrate`.
  Четвёртая пара учётных данных ради имени роли не заводится: переменной для неё в
  `docker-compose.yml` нет, а лишний секрет — это лишний секрет.
- **`sharp` и клиент Anthropic в зависимости фичи не включены**: нормализация фото и живой вызов
  модели принадлежат `scan-pipeline`. Сборка `sharp` с поддержкой HEIF не данность, и проверять её
  надо тогда, когда она понадобится.
- **NFR-PERF-001 и NFR-PERF-002 в фиче не измеряются** и помечены в `05_completion.md` как «не
  измерено»: на экране нет продукта, измерять нечего.

## Не сделано и почему

- Разрывы контура проекта (`FR-GROWTH-005`, `NFR-PERF-002`) не закрыты: `docs/Pseudocode.md` вне
  разрешённого набора файлов. Передано координатору.
- `## Criterion coverage` в `05_completion.md` заполнен ПЛАНОВЫМИ путями и заголовками и помечен как
  плановый. Ворота `--completion` на нём вернут `1`: тестовых файлов не существует. Это ожидаемое
  состояние Phase 1, а не пропуск.

Status: completed
