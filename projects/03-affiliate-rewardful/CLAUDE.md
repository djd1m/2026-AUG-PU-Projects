# N3 / Круг

Архитектура: распределённый монолит в Docker Compose, единый backend и PostgreSQL, отдельные UI A–D в variants/. Общее ядро shared/. Пользователь разрешил автономные /go последовательно shared → A → B → C → D; F1 synthetic, не production деньги.

Перед работой: корневой CLAUDE.md и .claude/rules/, docs/runtime-contract.md, docs/Architecture.md, PRD выбранного варианта и shared/docs/PRD.md. Root toolkit используется по ссылке; две неизменённые vendor role-map sources локально нужны обязательным packaged gates. Не устанавливать второй оркестратор.

БД: без host ports, только отдельная internal Docker-сеть backend/database; UI туда не подключать. Случайные пароли через Docker secret, без default, .runtime/ исключена из Git. Тестовые стенды следуют тем же правилам БД/секретов. До предложения владельцу смотреть UI обязательны реальные browser E2E всех вариантов. Порты проверять до создания compose и до up по корневому scripts/check-port-conflicts.sh и ss/docker inventory.

Процесс: docs/development/model-routing.md и model-routing-telemetry.md из корня. Документы/исходники/телеметрия каждой фичи только здесь. XL, user approval на F1 имеется; правила денег и безопасности сохраняются. Фактический model/usage без metadata=null. Один писатель на worktree; review readonly.

Команды: npm run build; npm test (integration tests внутри backend-контейнера, без host DB port). Скрипты Docker и проверки добавляются в реализации. Все изменения общих модулей проверяют все четыре варианта. Нельзя объявлять F0 HTML рабочим backend, fixture transport настоящим MCP/A2A, CSV банковской отправкой.

Runtime: Node22.22.0, pg, PostgreSQL16, ES modules. Подробный контракт в docs/runtime-contract.md. Клиент импортирует только shared/client, shared/contracts, shared/ui. Source files <500 строк. API не отдаёт secret/token в журналах и ошибках. Build/tests/review до завершения, частые git commits/pushes разрешены владельцем.

Лимит Codex: по просьбе владельца от 2026-09-09 во время активной работы проверять доступную телеметрию недельной квоты и сообщить, когда останется не более2% (used_percent >=98 для окна10080 минут). Не вычислять процент из токенов и не приписывать расход аккаунта одной фиче. Если актуальный счётчик недоступен, сообщать это явно. Фоновый мониторинг вне активной сессии не настроен; требование уведомить не означает автоматически остановить работу.
