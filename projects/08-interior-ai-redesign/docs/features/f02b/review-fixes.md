# F02b: ограниченная коррекция

Свежий Astra high source14f17719: REQUEST_CHANGES, два воспроизводимых дефекта и непройденный PostgreSQL gate. Исходный отчёт неизменен в telemetry/n8-f02b-review-receipt.md.

1. HIGH validation: fixture создаёт upload MIMEimage/png, схема принимает нормализованныйimage/webp. Сгенерировать настоящий WebPinput и согласованные hashes; output/depth остаютсяPNG. Схему не ослаблять. Все6qualityPGсценариев обязаны дойти до целевых assertions.
2. MEDIUM: corpuscoverage обязан учитывать ≥12 различных input_hash среди комнат, каждая из которых имеет ≥3стиля. Сейчас12алиасов однойкомнаты+11новыхinputпоодномустилю ошибочнопроходят. Добавить точный negativecase и сохранить valid12×3positive.
3. MEDIUM: позднийexit старогоPythonпроцесса отвергает новыйrequest. Привязатьpending/failhandlers ксвоемуchild; хранитьawaitabletermination послеошибкипротокола. Проверить настоящие subprocess malformed-response→stop→successful-restart, безsleepмаскировки.

ОдинSol6.1high≤15мин, ownedweb/generation.js, web/quality.js, tests/generation.test.js, tests/engine-double.py, tests/quality.test.js, tests/quality-fixtures.js, tests/quality.integration.test.js, docs/features/f02b/fix-*. Затем freshAstra≤8мин толькоclosure/regression. Unit/build/fixturemutation иPGquality mandatory; остальныеgreenнаборы повторять только если затронуты интеграцией. Dockerкоординатор послеN6. ФактическийGPUиtransitivecompatibility остаютсяотдельнымиpending.
