# design — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-006-1: Given калиброванная основа; When меняю стиль/мебель/ракурс и до/после; Then shell hash/размеры/проёмы неизменны, выбор сохранён.
- SC-US-006-2: Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox; When сохранить; Then 422 SCENE_INVALID, предыдущий вариант цел.
- SC-US-007-1: Given согласованный вариант; When поменял размер/стиль; Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown.
- SC-US-007-2: Given два одновременных редактирования; When одинаковый expectedVersion; Then один commit, второй 409 VERSION_CONFLICT без потери данных.
- SC-US-007-3: Given approved design; When изменён стиль или выбран другой исторический вариант; Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования.
- SC-US-008-1: Given manual/off; When пользователь ищет AI; Then видна надпись «Ручной режим · AI не подключён», пресеты сохраняются и network spy показывает0 внешних AI-вызовов.
- SC-US-008-2: Given enabled без caps/key или тестовый вредоносный ответ; When startup/validation; Then отказ startup либо job failed, shell не меняется.
- SC-US-008-3: Given два worker и один job/лимит; When параллельный claim/dispatch; Then один dispatch, caps атомарны, старый fence не завершает job повторно.
- SC-US-008-4: Given запрос уже dispatched; When timeout/crash; Then job uncertain, cost/usage неизвестны и reservation сохранена, автоматического платного redispatch нет.
- SC-US-008-5: Given offline HTTP provider fixture с валидным JSON и подтверждённой стоимостью; When job завершён; Then одна draft revision текущего shell, один held credit consumed, обе reservations reconciled по фактическому cost, live network не вызывалась.
- SC-US-008-6: Given поздний replay либо archive/refund/manual edit; When retry/mark-dispatch/completion; Then replay возвращает прежний job по тому же inputHash, archive до mark запрещает dispatch, поздний результат не заменяет новую ручную работу, consent body неизменен.
