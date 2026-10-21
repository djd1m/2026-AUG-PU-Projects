# design — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### FR-design-1
Decision: ADR-003 — границы этой способности и обязательные guards.
Один Babylon.js viewer отображает ручную оболочку или immutable GLB, материалы и разрешённые object primitives с известными габаритами. Вариант хранит shellId/hash, materials, objects, references и style; никакого исполняемого AI-кода/новых shell meshes. Пресеты и ручная расстановка доступны без AI. До/после используют одну камеру; план, 3D и список размеров доступны явно. Проверка invariants запрещает любые трансформации оболочки. BBox fit для ручной прямоугольной комнаты проверяет габариты/пересечения и проёмы; для GLB без семантической оболочки fit=unconfirmed. UI различает «геометрия основы неизменна» и физическую точность/эргономику.
US-006: Как владелец, хочу сравнить оформления собственной комнаты.
- [SC-US-006-1] Given калиброванная основа; When меняю стиль/мебель/ракурс и до/после; Then shell hash/размеры/проёмы неизменны, выбор сохранён.
- [SC-US-006-2] Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox; When сохранить; Then 422 SCENE_INVALID, предыдущий вариант цел.


### FR-design-2
DesignRevision — immutable содержимое с parentId; статусы draft/approved/superseded. Согласование привязано к текущим shellId и project version. Изменение размеров создаёт новую основу, снимает актуальность согласования/fit, сохраняет старые версии и помечает dependent бюджет stale. Возврат к прежнему виду создаёт новую revision, не переписывает историю. Для GLB общая площадь материалов вводится отдельно; bbox не выдаётся за площадь пола.
US-007: Как владелец, хочу менять решение и видеть последствия.
- [SC-US-007-1] Given согласованный вариант; When поменял размер/стиль; Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown.
- [SC-US-007-2] Given два одновременных редактирования; When одинаковый expectedVersion; Then один commit, второй 409 VERSION_CONFLICT без потери данных.
- [SC-US-007-3] Given approved design; When изменён стиль или выбран другой исторический вариант; Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования.


### FR-design-3
Decision: ADR-004 — границы этой способности и обязательные guards.
Реальный OpenRouter text/structured scene adapter существует за `SceneProposalProvider`. Режим manual по умолчанию; demo исключительно явно подписанный локальный fixture; live требует ключа, allowlisted model ID, актуальной rate ceiling, max tokens, per-job/account-day/global-day spend caps и разрешения оператора. Неполный/неизвестный config — startup failure. Весь сериализованный text request ≤32 KiB UTF-8, max_tokens 1–4096, response ≤256 KiB, timeout 30s; caps положительные safe-integer microUSD. Изображения/сами планы внешнему AI в MVP не отправляются; только согласованный пользователем текст размеров/notes и каталог, фиксированный preview отправляемых полей. Ответ проходит строгую JSON Schema и semantic scene validator. Разрешён только declarative JSON; tools при реализации только read-only allowlist каталога с общим лимитом 0 по умолчанию (без них MVP полон). Live-test сейчас не разрешён.
US-008: Как владелец, хочу опциональную AI-подсказку с ясными ограничениями.
- [SC-US-008-1] Given manual/off; When пользователь ищет AI; Then видна надпись «Ручной режим · AI не подключён», пресеты сохраняются и network spy показывает0 внешних AI-вызовов.
- [SC-US-008-2] Given enabled без caps/key или тестовый вредоносный ответ; When startup/validation; Then отказ startup либо job failed, shell не меняется.
- [SC-US-008-3] Given два worker и один job/лимит; When параллельный claim/dispatch; Then один dispatch, caps атомарны, старый fence не завершает job повторно.
- [SC-US-008-4] Given запрос уже dispatched; When timeout/crash; Then job uncertain, cost/usage неизвестны и reservation сохранена, автоматического платного redispatch нет.
- [SC-US-008-5] Given offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью; When job завершён; Then одна draft revision текущего shell, один held credit consumed, обе reservations reconciled по фактическому cost, live network не вызывалась.
- [SC-US-008-6] Given поздний replay либо archive/refund/manual edit; When retry/mark-dispatch/completion; Then replay возвращает прежний job по тому же inputHash, archive до mark запрещает dispatch, поздний результат не заменяет новую ручную работу, consent body неизменен.


### NFR-design-1
Parent source requirement: NFR-integrity-1.
Все write commands с `expectedVersion` и owner binding; долгий I/O вне DB transaction; conditional CAS/fence на завершение. Numeric sizes в decimal strings до вычисления, money safe integer minor ≤10^12 на строку, totals≤10^14, проценты 0–100, quantities≤10^8. Переполнение/неfinite/неподдерживаемые единицы отклоняются, не saturate. Revision content hash и IDs неизменяемы; link на новую сущность того же проекта проверяется FK/transaction.


### NFR-design-2
Parent source requirement: NFR-cost-1.
Спенд в integer microUSD, отдельно от RUB/credits. Дополнительные жёсткие начальные ceilings: **5 live admissions на аккаунт / 20 глобально за UTC-сутки**, по всем попыткам, включая failed/uncertain (и консервативно неотправленные admitted jobs); анонимный live admission запрещён. Это проектные защитные максимумы, не разрешение тратить. Денежные caps не имеют live-default: оператор задаёт положительные job≤account-day≤global-day в отдельном разрешённом config, отсутствие любого отказывает при включении. Атомарно резервировать per-job ceiling в account-day и global-day; UTC-day фиксируется при admission, reservation переживает полночь/timeout. `requestDispatchedAt` записывается до запроса; после uncertain исхода no automatic redispatch и funds не освобождаются до ручной reconcile. Суточный reset не снимает unresolved exposure: outstanding reservations учитываются независимо от дня. Выход usage неизвестен → null, не 0. Владелец видит собственные admissions/reserved/known/unknown в `/dashboard/usage` и `/api/me`; оператор — глобальный SpendBudget через локальную readonly query. Caps ограничивают admission, не доказывают фактический биллинг провайдера; live включает отдельный provider-key hard limit после проверки его конфигурации оператором.


### AC-design-1
Source criterion SC-US-006-1: Given калиброванная основа; When меняю стиль/мебель/ракурс и до/после; Then shell hash/размеры/проёмы неизменны, выбор сохранён.

### AC-design-2
Source criterion SC-US-006-2: Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox; When сохранить; Then 422 SCENE_INVALID, предыдущий вариант цел.

### AC-design-3
Source criterion SC-US-007-1: Given согласованный вариант; When поменял размер/стиль; Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown.

### AC-design-4
Source criterion SC-US-007-2: Given два одновременных редактирования; When одинаковый expectedVersion; Then один commit, второй 409 VERSION_CONFLICT без потери данных.

### AC-design-5
Source criterion SC-US-007-3: Given approved design; When изменён стиль или выбран другой исторический вариант; Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования.

### AC-design-6
Source criterion SC-US-008-1: Given manual/off; When пользователь ищет AI; Then видна надпись «Ручной режим · AI не подключён», пресеты сохраняются и network spy показывает0 внешних AI-вызовов.

### AC-design-7
Source criterion SC-US-008-2: Given enabled без caps/key или тестовый вредоносный ответ; When startup/validation; Then отказ startup либо job failed, shell не меняется.

### AC-design-8
Source criterion SC-US-008-3: Given два worker и один job/лимит; When параллельный claim/dispatch; Then один dispatch, caps атомарны, старый fence не завершает job повторно.

### AC-design-9
Source criterion SC-US-008-4: Given запрос уже dispatched; When timeout/crash; Then job uncertain, cost/usage неизвестны и reservation сохранена, автоматического платного redispatch нет.

### AC-design-10
Source criterion SC-US-008-5: Given offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью; When job завершён; Then одна draft revision текущего shell, один held credit consumed, обе reservations reconciled по фактическому cost, live network не вызывалась.

### AC-design-11
Source criterion SC-US-008-6: Given поздний replay либо archive/refund/manual edit; When retry/mark-dispatch/completion; Then replay возвращает прежний job по тому же inputHash, archive до mark запрещает dispatch, поздний результат не заменяет новую ручную работу, consent body неизменен.

