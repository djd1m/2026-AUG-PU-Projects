-- Фича `scan-pipeline`: расширяет `recognition_failure_reason` двумя значениями за пределы
-- исходных восьми канона (координатор, DEC-A-017, `01_specification.md` AC-scan-pipeline-33).
--
-- `timeout` — общий бюджет задачи (30 с, FR-scan-pipeline-20) истёк: в очереди, на захвате
-- с исчерпанным пределом попыток, либо ответ провайдера пришёл позже бюджета (`late`).
-- `normalize` — нормализация фото (HEIC→JPEG, ресайз, сжатие) не уложилась в свой
-- фиксированный дедлайн 3000 мс либо упала по иной причине декодирования (FR-scan-pipeline-5).
--
-- `ALTER TYPE … ADD VALUE` не может быть использовано в ТОЙ ЖЕ транзакции, где выполнено —
-- это ограничение PostgreSQL, а не этого раннера. Использование (INSERT/UPDATE со значением)
-- происходит из кода приложения в ОТДЕЛЬНОЙ, более поздней транзакции, поэтому это безопасно.
ALTER TYPE recognition_failure_reason ADD VALUE IF NOT EXISTS 'timeout';
ALTER TYPE recognition_failure_reason ADD VALUE IF NOT EXISTS 'normalize';
