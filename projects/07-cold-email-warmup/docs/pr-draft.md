# PR: feat(n7): локальный почтовый пул, цепочки и кабинет с проверенной остановкой

Base: `claude/install-npm-packages-n7l3m5`  
Head: `feature/07-cold-email-warmup`

До изменения N7 содержал описание идеи. Теперь локальный MVP даёт изолированный
кабинет, зашифрованные настройки ящиков, отдельные согласия на пул и кампанию,
общую квоту, цепочки и остановку после ответа/отписки/жалобы. Последняя проверка
перед submitting сериализована со всеми stop writers; неизвестная доставка не
повторяется вслепую. Добавлены ручные наблюдения, отзываемые публичные отчёты,
canonical TEST billing и партнёрская атрибуция.

Проверено: type/lint/build,39unit, ранее полный115PG, meaningful guard mutations,
secret/privacy/tenant checks; настоящий Docker Playwright Chromium1440/390 и
Firefox/WebKit390. Финальная mobile report коррекция:218checks. API p95 при
concurrency10/CPU2:109.1ms desktop/85.2ms mobile. Fresh independent Astra приняла
код Sol; неудачные попытки и измерения сохранены в проектной telemetry.

Почтовые адаптеры локальные, оплата только TEST, репутация без наблюдений unknown.
Реальная почта, charge и production deployment требуют отдельной интеграции и
checkpoint. Root toolkit и проекты1–6 не меняются. Readme/руководства RU+EN,
SPARC, ADR, CJM3варианта, pipeline walkthrough и deployment plan внутри N7.

См. `projects/07-cold-email-warmup/docs/Completion.md`,
`docs/acceptance-traceability.md`, `docs/pipeline-walkthrough.md` в этой ветке.

## Фактический результат создания

2026-10-03: GitHub connector вернул403 `Resource not accessible by integration`.
PR не создан. Полный API blocker: `telemetry/features/20261003T023900Z-f06/pr-attempt.json`.
[Готовое сравнение для создания PR](https://github.com/djd1m/2026-AUG-PU-Projects/compare/claude/install-npm-packages-n7l3m5...feature/07-cold-email-warmup?expand=1).
