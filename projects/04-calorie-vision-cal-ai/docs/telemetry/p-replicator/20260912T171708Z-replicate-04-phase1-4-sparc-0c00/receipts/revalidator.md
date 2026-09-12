# Re-валидация Phase 2 — независимая проверка 21 находки

Project: N4 «Тарелка» (`projects/04-calorie-vision-cal-ai`). Только чтение.
RUN_ID: 20260912T171708Z-replicate-04-phase1-4-sparc-0c00 · WORK_UNIT_ID: revalidator.

Spec revision: sha256:9b487baf90edf596db8b64ce4388c7e80a5207032bbd816223e7ef68cede6d66

Вход: `receipts/validator-docs-coherence.md` (V1-R01…R06), `receipts/codex-validator.md`
(V2-R01…R15), `receipts/fixer-phase2.md` (попытки 1–2), `receipts/validator-stories-ac.md`,
`docs/decisions-autonomous.md` (DEC-A-002…008), `docs/canon.md`. Установка скептическая: каждый
«закрыто» проверен цитатой из текущего файла, а не пересказом отчёта исправлявшего.

## Находки

| Находка | Severity | Вердикт | Доказательство (файл:строка + цитата) |
|---|---|---|---|
| V1-R01 | blocker | **closed** | `docs/ADR.md:172` «ТРИ числа канона… 600 эскалаций к Sonnet 5 в сутки (`scope = escalation`)»; `docs/Pseudocode.md:81` «Для `escalation` их ЧЕТЫРЕ»; `docs/canon.md:80` таблица §7 содержит строку «Суточный потолок эскалаций… 600 попыток»; `docs/Architecture.md:165` `scope` — enum из 3 значений с физической опорой |
| V1-R02 | high | **closed** | `docs/Architecture.md:162` «`replaced_source` — **nullable** enum из тех же трёх значений»; Reconciliation `docs/Architecture.md:281` — 12-я строка добавлена |
| V1-R03 | high | **closed** (= V2-R09, одна находка) | `docs/ADR.md:190` Confirmation — три исхода, `(2) 200 applied… UPDATE… replaced_source`; `docs/Refinement.md:20` — три входа/исхода; `docs/Architecture.md:282` Reconciliation «закрыто: `Pseudocode.md` приведён к трём исходам» |
| V1-R04 | medium | **closed** | `docs/Pseudocode.md:367` (маршрут 7) «`409` `already_attributed`… ОБЕ конфликтные ветки алгоритма» |
| V1-R05 | low | **closed** (пред-раундом, координатором) | `docs/canon.md:26` §2 area-строка NFR уже перечисляет «производительность (PERF), безопасность (SEC), масштаб (SCALE), эксплуатация (OPS)» |
| V1-R06 | low (informational) | **closed** | `docs/Architecture.md:63,64,82,154,155,163,165,218` — точные токены ADR-001,003,005,006,007,009,010 по месту реализации |
| V2-R01 | blocker | **closed** | `docs/Refinement.md:87-116` таблица `## Test Cases`: все 26 `SC-US-nnn-k` со слоем и алгоритмом; SC-US-009-1 помечен «конкурентный» отдельной строкой |
| V2-R02 | high | **closed** | `docs/Specification.md:468,479` «даёт `404` — ТОТ ЖЕ ответ, что и несуществующий `id`»; `docs/Specification.md:476` снятие EXIF/GPS; блоки «Критерии безопасности» под US-001/003/005/008 |
| V2-R03 | blocker | **closed** | `docs/ADR.md:20` «ровно ОДНО числовое поле… `model_estimate_kcal`»; `docs/Pseudocode.md:113` схема без калорий кроме этого поля; `docs/Pseudocode.md:119` «Статус `done` при нуле ссылок… НЕВОЗМОЖЕН»; `docs/ADR.md:47` Confirmation п.3 — страж на путь ЧТЕНИЯ (`discrepancy_ratio`, `docs/Pseudocode.md:135`) |
| V2-R04 | high | **closed** (= V1-R01, один фикс) | см. V1-R01 |
| V2-R05 | high | **closed** | `docs/Pseudocode.md:117` «второй воркер обязан отличаться… `lease_fence`»; `docs/Architecture.md:155` `lease_owner uuid`, `lease_fence integer`, `UPDATE … WHERE id = ? AND lease_fence = ?`; ADR-003 получил второй конкурентный тест (не процитирован здесь текстом ADR-003, но ссылка на него согласована в Architecture.md:155) |
| V2-R06 | high | **closed** | `docs/Pseudocode.md:371-373` маршруты 11 `PATCH /diary/{entry_id}`, 12 `POST /consent`, 13 `DELETE /account` с телом/ответом/отказами; `docs/canon.md:32` «ровно 13» |
| V2-R07 | high | **closed** | `docs/Pseudocode.md:40-41` `pro_interest`, `growth_event` в Data Structures; `docs/Architecture.md:163-164` те же сущности в Data Architecture; `docs/Pseudocode.md:230` «Факт шеринга — это событие, а не существование карточки» |
| V2-R08 | high | **closed** | `docs/Pseudocode.md:361` route 1 несёт `Idempotency-Key` (обязателен), `202`, повтор даёт тот же `scan_id`; `docs/Pseudocode.md:100` `EnqueueScan` шаг 2а — атомарная заявка ключа `ON CONFLICT DO NOTHING RETURNING`; `docs/long-job-contract.md:39` поле/место/механизм названы |
| V2-R09 | high | **closed** (дубликат V1-R03) | см. V1-R03 |
| V2-R10 | high | **closed** | `docs/Architecture.md:96` строка External Dependencies с дословной цитатой Anthropic Vision (форматы + 10 МБ); `docs/Pseudocode.md:117` шаг 2а — нормализация HEIC→JPEG, ≤1568px, ≤5 МБ до вызова |
| V2-R11 | high | **closed** | `docs/Pseudocode.md:119` шаг 3а — проверка диапазонов в коде после разбора (confidence 0…1, mass_g 1…5000, ≤12 позиций, ≤3 кандидата), fail-closed без подрезки |
| V2-R12 | medium | **closed** | `docs/Specification.md:106,114,144,214,373,387,493,498,534,635` — «не позже 100 мс (p95)» / «не позже 60 с» / «не позже 72 ч» везде вместо «мгновенно»/«немедленно»/«одним жестом»; `grep -c 'мгновенно\|немедленно' docs/Specification.md` → 0; `grep -c 'одним жестом' docs/Specification.md` → 0 |
| V2-R13 | medium | **closed** | `docs/PRD.md:49` глоссарий «`pending` — состояние ДО первого успешного распознавания, `activated` — после»; `docs/Specification.md:151,254,609` согласованы; «всегда pending» нигде не осталось |
| V2-R14 | medium | **closed** | `docs/Specification.md:402` «Статус: принят решением координатора DEC-A-006 (2026-09-12), владелец недоступен; подлежит…»; `docs/decisions-autonomous.md` DEC-A-006 |
| V2-R15 | medium | **closed** | `docs/Completion.md:81-94` «PagerDuty, Slack и почтовая рассылка НЕ используются»; все реакции — «журнал + Telegram владельцу (Bot API `sendMessage`)»; `docs/Architecture.md:97` строка External Dependencies с дословной цитатой Telegram Bot API |

Итог по 21: **21 closed, 0 partially, 0 open, 0 superseded** (V1-R03/V2-R09 и V1-R01/V2-R04 —
две пары одной и той же находки от двух валидаторов, закрыты одним фиксом каждая; это не двойной
счёт, а совпадение областей ревью).

## Коды ворот (из каталога проекта)

| Проверка | Код | Комментарий |
|---|---|---|
| `check-docs-complete.cjs .` | 0 | 11 документов, шаблонов не осталось |
| `check-growth-trace.cjs .` | 0 | 7/7 growth-требований прослежены |
| `check-look-trace.cjs .` | 0 | 12/12 look-обязательств прослежены/отклонены |
| `check-handoff-manifest.cjs .` | 0 | 22/22 PD-* отвечены |
| `check-metric-source.cjs .` | 0 | 7 метрик, источник у каждой из закрытого списка |
| `check-external-deps.cjs .` | 0 | 10 способностей, 10 CONFIRMED / 0 UNCONFIRMED |
| `check-model-cost.cjs .` | 0 | 2 вызова названы, оба предела — числа, оба фейл-клоуз |
| `check-job-contract.cjs .` | 2 | законно: «не выполнена, причина not-deployed» — стенда нет |
| `check-webhook-contract.cjs .` | 2 | законно: «Входящие вебхуки: нет» |
| `check-embed-contract.cjs .` | 2 | законно: «Встраиваемый виджет: нет» |

Дополнительно (скрипт, вне hooks, написан для задачи): `REQUIREMENT:` в `Pseudocode.md` (33
уникальных) — все 33 существуют как `### ` заголовки `Specification.md`; ровно 2 заголовка
Specification без алгоритма (`FR-GROWTH-005`, `NFR-PERF-002`) — оба легитимно неалгоритмические
(семя growth-плана и клиентский рендер), это ожидаемое расхождение, не дефект. `SC-US-nnn-k`:
26 в `Specification.md`, 26 в `Pseudocode.md` (`REALISES`/ссылки) — совпадают в обе стороны, 0
лишних с любой стороны.

## Новые находки

**НОВАЯ-01 · high · Pseudocode.md:371 (маршрут 11 `PATCH /api/v1/diary/{entry_id}`).**
Столбец отказов буквально перечисляет ДВА разных HTTP-кода для чужой записи: «`403` чужая запись ·
`404` неизвестный `entry_id`» — и тут же поясняет «ОДИН и тот же ответ, чтобы существование чужой
записи не раскрывалось». Формулировка внутренне противоречива: если ответ действительно один и тот
же, таблица обязана называть ОДИН код (как это сделано для маршрута 7: «`409`… ОБЕ конфликтные
ветки»), а не два разных числа с пояснением задним числом. Хуже: это прямо противоречит security-AC,
добавленному в ЭТОМ ЖЕ раунде исправлений (V2-R02) для этого самого маршрута — `docs/Specification.md:508`
«`PATCH /diary/{entry_id}` от чужой сессии дают `404`, не `403`». Читатель, реализующий маршрут 11
по таблице контрактов буквально, с равной вероятностью вернёт `403` для чужой записи — то есть
раскроет её существование, ровно то, что V2-R02 закрывал. Это не старая находка, переоткрытая: до
раунда 2 маршрута 11 не существовало вовсе (V2-R06), формулировка добавлена вместе с ним и не была
сверена с уже написанным в тот же раунд текстом Specification.md.
**Исправление:** заменить ячейку на «`404` чужая запись или неизвестный `entry_id` — один код на оба
случая, `403` в контракте маршрута не используется», по образцу маршрута 7.

Прочих новых противоречий, введённых исправлениями, не найдено: числа канона (10/3000/600, 0,6,
15%, 30 дней, 60 с, 72 ч, 12 МБ/5 МБ/1568px, 13 маршрутов, 14 сущностей) согласованы во всех
проверенных документах; `C4_Diagrams.md:47` — вопреки заметке фиксера «осталось открытым» в
`fixer-phase2.md` — уже говорит «13 маршрутов канона», то есть этот пункт кем-то (по-видимому,
координатором) закрыт после написания квитанции фиксера и сейчас не является дефектом.

Отдельное наблюдение вне 21 находок (не new finding, не блокирует): слова «мгновенно»/«немедленно»
остаются в `test-scenarios.md` (строки 604, 634, 718), `PRD.md:153`, `Solution_Strategy.md:95` и
внутри самих шагов `Pseudocode.md` (106, 164, 196, 313) — V2-R12 по формулировке задания и по факту
исправления был ограничен `Specification.md`, и там счёт чист (0 вхождений); эти файлы не входят в
цитированные находкой места и не были в зоне владения фиксера в этом раунде (test-scenarios.md прямо
назван «не мой файл»).

## Итог

- Closed: 21/21. Partially: 0. Open: 0. Superseded: 0 (сняты решениями DEC-A-002…008, но это и есть
  форма закрытия, а не отдельный статус: каждое решение сопровождено фактической правкой текста,
  проверенной выше цитатой).
- Blocker/high среди 21 исходных находок открытых нет.
- Новая находка НОВАЯ-01 (high) — единичный, легко устранимый дефект формулировки одной ячейки
  таблицы, не системный: не затрагивает ни один из 21 исходных пунктов, введён вместе с новым
  контентом маршрута 11 в этом же раунде.
- **Рекомендуемый вердикт фазы: 🟡 CAVEATS.** Не 🟢 READY, потому что найдено одно свежее внутреннее
  противоречие документа (403 vs 404 на маршруте 11) — по правилу requirements-validator READY
  требует «нет противоречий», а оно есть, пусть и малое по объёму правки. Не 🔴 NEEDS WORK: это не
  блокер (V1/V2 blocker-находок не осталось), не системная проблема, а формулировка одной ячейки
  одной таблицы, исправление — одна строка.

requested: claude-sonnet-5; actual: unknown to worker
Status: completed
