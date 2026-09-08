# Completion — план приёмки F1

Реализация считается завершённой после фактических проверок общего ядра и всех четырёх вариантов; этот документ пока не является заявлением об их прохождении. Для каждой фичи есть отдельный каталог docs/features и отдельная telemetry запись с моделью/effort requested, доступными actual metadata и пробелами usage.

Порядок: packaged traceability gate → независимая семантическая validation → report revision/scenarios gates → implementation → полный build/tests → criterion coverage → independent code review и contract gate. XL user approval на автономное F1 имеется. Неразрешённые high/blocker исправляются до завершения.

Исполняемые проверки: реальные PostgreSQL транзакции/гонки/повторы, tenant/subject/grant deny, cumulative refund/old CSV, credit reserve/unknown, task cancel/handoff, backend restart, import boundaries. Guard mutation для authorization, stale-source, duplicate event. Тестовый backend получает доступ к БД только по internal Docker-сети, без host port и default password.

Обязательные UI E2E перед просьбой владельцу смотреть UI: все четыре основных пути, reload persistence, ошибки/отказы, desktop1440 и mobile390. B дополнительно iframe на foreign origin, CSP, CSS и CORS. Docker build/config/up/health и проверка фактических network membership/port publication. До каждого запуска сверить свободные host ports; UI по loopback умолчанию.

Итог должен содержать точные команды/URL, commit/build hash, список пройденных и не выполненных критериев, модели, duration и доступный расход. F1 не объявляет provider sandbox/production, реальный LLM или MCP/A2A wire проверенными. Выбор/гибрид вариантов остаётся за владельцем после показа работающих сценариев.
