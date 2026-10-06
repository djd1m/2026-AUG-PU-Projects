# PR: feat(n7): почтовый пул и кабинет с ограниченным SMTP/IMAP транспортом

Base: `claude/install-npm-packages-n7l3m5`  
Head: `feature/07-cold-email-warmup`


## Текущее состояние ветки — 2026-10-06

После исходного локального MVP приняты F07 connected capacity, F08 отдельная диагностика TLS/AUTH и F09 native SMTP/UID IMAP transport. Отправка требует отдельной scoped authority и текущего final fence; unknown delivery сохраняет квоту и не повторяется автоматически. Физические socket slots не освобождаются по одному истечению lease. Billing остаётся TEST.

F09 source `e043bb27` принят независимым ревью по9AC: итоговые affected12/12 и type/lint/build проходят; realPG147/147, unit57/57 и physical socket test сохранены с явными unchanged-component bindings. Две мутации прежнего SMTP phase deadline отвергнуты, отдельный TLS probe подтвердил остановку до AUTH/DATA. [Точная приёмка](Completion.md) и [отчёт F09](features/f09-live-transport/review-report.md) содержат ограничения доказательств.

F10 сейчас реализуется по независимо принятому плану; F10–F14 и отдельные live/model gates F15 ещё не приняты. Этот draft обновляется по принятому source и пока не представляет завершение расширенного MVP. Внешние SMTP/IMAP/LLM, расходы и deployment требуют конкретных разрешений из [пакета пилота](operations/authorized-live-pilot-package.md). Повторного запроса создания PR при неизменённом403 не выполнялось.

## Историческое описание исходного локального MVP

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
