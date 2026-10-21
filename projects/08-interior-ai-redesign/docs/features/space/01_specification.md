# space — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### FR-space-1
Decision: ADR-002 — границы этой способности и обязательные guards.
Ручной план задаёт длину/ширину/высоту в метрах и прямоугольные дверные/оконные проёмы с wallId/offset/width/height/sill. Размеры конечные: стороны 0.5–50 м, высота 1.5–10 м; проёмы внутри стены и не перекрываются. После подтверждения создаётся immutable ShellRevision; её изменяют только новой ревизией. GLB калибруется двумя выбранными точками и фактической длиной отрезка; дополнительные контрольные отрезки и пользовательский допуск записываются. Без масштаба/подтверждения оболочки нельзя согласовать проверенный вариант. Это проверка введённой основы, не гарантия физической точности scan.
US-003: Как владелец, хочу увидеть и подтвердить реальные размеры до выбора дизайна.
- [SC-US-003-1] Given 4.5×4×2.7 м и допустимые проёмы; When подтвердил; Then площадь пола 18 м², стабильный shell hash, видны план и 3D.
- [SC-US-003-2] Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб; When согласование; Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет.


### FR-space-2
Decision: ADR-009 — границы этой способности и обязательные guards.
Приватная загрузка изображений JPG/PNG/WebP ≤10 MiB и GLB v2 mesh ≤25 MiB. Проверять magic bytes, размеры, фактические байты; картинки ≤20 MP с удалением EXIF; GLB только embedded ресурсы, без remote/data URI, animation/skin/неразрешённых extension, ≤250k triangles/1000 nodes, decode/validation deadline 10 s. Исходник хранится отдельно от нормализованной копии. Splat/FBX/OBJ/PDF в этом MVP отклоняются с предложением ручного плана; только загрузка GLB не создаёт измеренную комнату. Произвольные mesh не превращаются автоматически в стены; исходная геометрия сохраняется целиком.
US-004: Как владелец, хочу добавить исходники, сохранив приватность и понятные ограничения.
- [SC-US-004-1] Given безопасный GLB или reference image; When upload; Then исходный hash сохранён, asset доступен только owner, normalized image/thumbnail декодирован и перекодирован без EXIF, fixed MIME/nosniff, external resources не загружались.
- [SC-US-004-2] Given oversized/повреждённый/remote-URI GLB либо изображение-bomb; When upload; Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL.
- [SC-US-004-3] Given чужой assetId; When скачать/использовать в проекте; Then 404 даже при известном storage key.


### FR-space-3
Референс содержит user-uploaded image либо HTTPS-ссылку без credentials, note ≤2000 символов и tags color/material/form. Сервер не скачивает произвольную ссылку; сохраняет её для открытия пользователем. Pinterest API необязателен и в MVP отключён: ссылка + upload работают без OAuth. Текст/имена всегда экранируются; пользователь подтверждает право использовать изображение, отдельного согласия на публикацию это не даёт.
US-005: Как владелец, хочу объяснить, какие детали нравятся.
- [SC-US-005-1] Given reference; When выбраны tags/note и повторное открытие; Then данные сохранены вместе с source/дата.
- [SC-US-005-2] Given недоступный Pinterest; When добавлена ссылка; Then предлагается upload, нет обещания импортированной доски или автоматического доступа.
- [SC-US-005-3] Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`; When сохранена/переоткрыта; Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL.


### AC-space-1
Source criterion SC-US-003-1: Given 4.5×4×2.7 м и допустимые проёмы; When подтвердил; Then площадь пола 18 м², стабильный shell hash, видны план и 3D.

### AC-space-2
Source criterion SC-US-003-2: Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб; When согласование; Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет.

### AC-space-3
Source criterion SC-US-004-1: Given безопасный GLB или reference image; When upload; Then исходный hash сохранён, asset доступен только owner, normalized image/thumbnail декодирован и перекодирован без EXIF, fixed MIME/nosniff, external resources не загружались.

### AC-space-4
Source criterion SC-US-004-2: Given oversized/повреждённый/remote-URI GLB либо изображение-bomb; When upload; Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL.

### AC-space-5
Source criterion SC-US-004-3: Given чужой assetId; When скачать/использовать в проекте; Then 404 даже при известном storage key.

### AC-space-6
Source criterion SC-US-005-1: Given reference; When выбраны tags/note и повторное открытие; Then данные сохранены вместе с source/дата.

### AC-space-7
Source criterion SC-US-005-2: Given недоступный Pinterest; When добавлена ссылка; Then предлагается upload, нет обещания импортированной доски или автоматического доступа.

### AC-space-8
Source criterion SC-US-005-3: Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`; When сохранена/переоткрыта; Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL.

