# sharing — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### FR-sharing-1
Decision: ADR-008 — границы этой способности и обязательные guards.
На первом варианте видны owner-initiated «Скачать до/после» и «Поделиться». Скачать PNG с одинаковой камерой/видимым названием типа результата; watermark N8 для бесплатного/manual, снятие только по verified entitlement. Private share link — случайный token≥32 bytes, в БД hash, истекает через 7 суток, отзыв owner; только замороженный подготовленный before/after image + выбранная подпись, без адреса, plan/GLB, размеров, refs и бюджета. Пользователь видит preview и подтверждает права. Noindex, no public listing, no автопубликации/отправки. Гость получает только image/подпись и ссылку начать свой проект, не исходные IDs.
US-014: Как владелец, хочу обсудить образ и контролировать раскрытие.
- [SC-US-014-1] Given первый вариант; When export/share preview; Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены.
- [SC-US-014-2] Given активная ссылка; When owner отзывает/архивирует проект или TTL истёк; Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить.
- [SC-US-014-3] Given чужой аккаунт/неподтверждённые права; When создание link; Then отказ без публикации.


### FR-sharing-2
Без внешней аналитики записывать минимальные first_design_viewed/export_created/share_created/share_viewed/new_project_from_share, requestId, timestamp и псевдонимные project/account IDs где допустимо. ExportCreated не называется фактическим внешним шерингом. Пользовательский feedback в приложении не имитируется отсутствующим событием; counts считаются только из записанных событий.
US-015: Как владелец продукта, хочу понимать использование, не выдумывая growth.
- [SC-US-015-1] Given повторный event key; When повторная запись; Then один event, нет исходных фото/текста/токенов в log.
- [SC-US-015-2] Given нет событий; When локальная readonly метрика; Then наблюдаемое0 либо unknown при отказе хранилища, не прогноз конверсии.
- [SC-US-015-3] Given первое allowlisted событие; When записано; Then count1 в явном 30-day reporting window; share_created не означает external sharing.


### NFR-sharing-1
Parent source requirement: NFR-quality-1.
390px и desktop: видимый фокус, подписи, текст ошибок, keyboard navigation, отсутствие горизонтальной прокрутки ключевых действий. Видны manual/demo/live labels, missing/blocked/stale, история и progress; disabled кнопка имеет причину. Viewer failure оставляет план/размеры/список доступными. Не заявлять WCAG certification без аудита.
US-018: Как пользователь, хочу keyboard-навигацию по панели и формам проекта на390px.
- [SC-US-018-1] Given 390px и desktop; When keyboard выбирает steps и submit формы; Then виден focus, controls имеют labels, ошибки текстовые, document.scrollWidth≤innerWidth; canonical actions: create/open project, save/confirm plan, add reference, save/approve design, add/replace product, calculate budget, export/share/revoke.
US-022: Как пользователь, хочу usable план при недоступном WebGL.
- [SC-US-022-1] Given WebGL initialization failed; When открываю viewer; Then видны2D план/размеры и список объектов, можно сохранить вариант, нет сообщения об успешной3D загрузке.
US-023: Как пользователь, хочу восстановление ввода основных трёх форм.
- [SC-US-023-1] Given plan/reference/budget saved; When reload либо field validation fails; Then сохранённые значения восстановлены, незавершённый ввод остаётся при typed field error, новые ошибки получают focus/text.


### AC-sharing-1
Source criterion SC-US-014-1: Given первый вариант; When export/share preview; Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены.

### AC-sharing-2
Source criterion SC-US-014-2: Given активная ссылка; When owner отзывает/архивирует проект или TTL истёк; Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить.

### AC-sharing-3
Source criterion SC-US-014-3: Given чужой аккаунт/неподтверждённые права; When создание link; Then отказ без публикации.

### AC-sharing-4
Source criterion SC-US-015-1: Given повторный event key; When повторная запись; Then один event, нет исходных фото/текста/токенов в log.

### AC-sharing-5
Source criterion SC-US-015-2: Given нет событий; When локальная readonly метрика; Then наблюдаемое0 либо unknown при отказе хранилища, не прогноз конверсии.

### AC-sharing-6
Source criterion SC-US-015-3: Given первое allowlisted событие; When записано; Then count1 в явном 30-day reporting window; share_created не означает external sharing.

### AC-sharing-7
Source criterion SC-US-018-1: Given 390px и desktop; When keyboard выбирает steps и submit формы; Then виден focus, controls имеют labels, ошибки текстовые, document.scrollWidth≤innerWidth; canonical actions: create/open project, save/confirm plan, add reference, save/approve design, add/replace product, calculate budget, export/share/revoke.

### AC-sharing-8
Source criterion SC-US-022-1: Given WebGL initialization failed; When открываю viewer; Then видны2D план/размеры и список объектов, можно сохранить вариант, нет сообщения об успешной3D загрузке.

### AC-sharing-9
Source criterion SC-US-023-1: Given plan/reference/budget saved; When reload либо field validation fails; Then сохранённые значения восстановлены, незавершённый ввод остаётся при typed field error, новые ошибки получают focus/text.

