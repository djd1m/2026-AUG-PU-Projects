# sharing — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-014-1: Given первый вариант; When export/share preview; Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены.
- SC-US-014-2: Given активная ссылка; When owner отзывает/архивирует проект или TTL истёк; Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить.
- SC-US-014-3: Given чужой аккаунт/неподтверждённые права; When создание link; Then отказ без публикации.
- SC-US-015-1: Given повторный event key; When повторная запись; Then один event, нет исходных фото/текста/токенов в log.
- SC-US-015-2: Given нет событий; When локальная readonly метрика; Then наблюдаемое0 либо unknown при отказе хранилища, не прогноз конверсии.
- SC-US-015-3: Given первое allowlisted событие; When записано; Then count1 в явном 30-day reporting window; share_created не означает external sharing.
- SC-US-018-1: Given 390px и desktop; When keyboard выбирает steps и submit формы; Then виден focus, controls имеют labels, ошибки текстовые, document.scrollWidth≤innerWidth; canonical actions: create/open project, save/confirm plan, add reference, save/approve design, add/replace product, calculate budget, export/share/revoke.
- SC-US-022-1: Given WebGL initialization failed; When открываю viewer; Then видны2D план/размеры и список объектов, можно сохранить вариант, нет сообщения об успешной3D загрузке.
- SC-US-023-1: Given plan/reference/budget saved; When reload либо field validation fails; Then сохранённые значения восстановлены, незавершённый ввод остаётся при typed field error, новые ошибки получают focus/text.
