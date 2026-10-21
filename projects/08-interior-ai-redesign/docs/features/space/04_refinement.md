# space — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-003-1: Given 4.5×4×2.7 м и допустимые проёмы; When подтвердил; Then площадь пола 18 м², стабильный shell hash, видны план и 3D.
- SC-US-003-2: Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб; When согласование; Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет.
- SC-US-004-1: Given безопасный GLB или reference image; When upload; Then исходный hash сохранён, asset доступен только owner, normalized image/thumbnail декодирован и перекодирован без EXIF, fixed MIME/nosniff, external resources не загружались.
- SC-US-004-2: Given oversized/повреждённый/remote-URI GLB либо изображение-bomb; When upload; Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL.
- SC-US-004-3: Given чужой assetId; When скачать/использовать в проекте; Then 404 даже при известном storage key.
- SC-US-005-1: Given reference; When выбраны tags/note и повторное открытие; Then данные сохранены вместе с source/дата.
- SC-US-005-2: Given недоступный Pinterest; When добавлена ссылка; Then предлагается upload, нет обещания импортированной доски или автоматического доступа.
- SC-US-005-3: Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`; When сохранена/переоткрыта; Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL.
