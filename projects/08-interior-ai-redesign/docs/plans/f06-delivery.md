# F06 — проверяемая передача и эксплуатационные документы

Основание: утверждённый implementation-plan-v1.md, decisions-owner.md, Completion.md и41 AC Specification.md. Общий профиль compact-quality-first-v2/XL сохраняется. Самостоятельно продолжать разрешено; расходы, live платежи, mail, deployment, аренда GPU и скачивание весов не разрешены. F04 actual browser gate пока выполняется; F05 real GPU gate остаётся blocked. Этот план не означает их прохождение.

## Независимая подготовка F06a

После завершения текущего браузерного исправления отдельный Sol6.1 high получает ≤20 минут на минимальный пакет: docs/README/ru.md и en.md, source-bound таблицу41 AC со ссылками на действительные receipts и отдельными статусами software/GPU/provider; проверяемые команды настройки, migrations, private storage, worker, fixture и disabled payment modes; безопасную процедуру backup/restore и rollback без изменения ledger; ограничения публикации/геометрии и точные ещё не выполненные gates. Все продуктовые и архитектурные объяснения остаются Markdown в docs/. Обновить Completion.md/Final_Summary.md/pipeline-walkthrough.md после действительных результатов.

Допускается один минимальный локальный restore-check script только если существующих средств недостаточно для обязательной проверки Completion.md. Он работает исключительно с подтверждённой собственной синтетической PostgreSQL16 базой, без host ports/production/секретов в выводе. Raw dump хранится внеgit и удаляется после проверки. Нужно показать сохранение значимых связей account/upload/job/ledger/payment и отсутствие изменения исходной БД; эта проверка не является миграцией или восстановлением production. Docker только под общим heavy mutex и CPU2. Не строить новый runner/framework.

Проверки затронутого пакета: реальные команды из README сверить с package/scripts/config; ни один pending AC не маркировать PASS; backup/restore доказать на собственной fixture БД, если заявлен как выполненный. Existing unchanged backend/unit/PG suites связываются через hashes/receipts, не выдаются за новый запуск. При новом коде выполнить соответствующие focused tests/build. Изменения только N8 в отдельном worktree, уникальный TRACE до старта, фактическая модель по banner, usage/cost null без счётчиков.

## Независимое завершительное ревью

Свежий Astra high ≤12 минут проверяет конкретный source-bound diff/AC evidence map и остаточные security/delivery границы. Проверяем секреты только по именам/наличию/редактированным результатам, не выводим значения. Один проход → конкретные находки → один ограниченный correction; не начинать эстетическую полировку. Reviewer не объявляет GPU, live-provider или deployment принятыми по fixtures.

## Условия передачи

F06a может завершить независимую программную документацию и операционные проверки. Общий F06/MVP не done, пока обязательный F05 не принят. Completion.md допускает draft PR с явно перечисленными незакрытыми gates; такой PR не является готовым production/MVP и не сливается. Целевая база существующая claude/install-npm-packages-n7l3m5; main не создаётся. Перед публикацией сверить границы утверждённого плана и итоговый diff только projects/08-interior-ai-redesign. При отсутствии реального GPU подготовить конкретный corpus/model/runtime acceptance пакет и передать владельцу внешний blocker без аренды/платёжных действий.
