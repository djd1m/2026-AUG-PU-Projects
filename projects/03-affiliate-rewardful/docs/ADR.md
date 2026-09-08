# ADR-001 — распределённый монолит и четыре композиции

Статус: принят для автономной реализации F1 владельцем 2026-09-08. Контекст: четыре CJM должны стать независимо запускаемыми вариантами с переиспользуемым кодом. `/replicate` требует distributed monolith in monorepo, Docker Compose на VPS.

Решение: единый API/общие предметные модули/одна PostgreSQL БД на среду; четыре frontend-пакета и контейнера A–D. Релиз общий, API контракт единый. PostgreSQL только в отдельной internal Docker-сети с backend. Нет host DB ports, default password, доступа из UI. Секрет создаётся локально случайно и не коммитится; тестовые стенды следуют тем же ограничениям.

Последствия: деньги/права не расходятся между вариантами; независимые UI меняются без дублирования ledger. Backend deployment остаётся общим, тесты затрагивают все четыре потребителя. F1 финансовые операции сериализуются по tenant и используют ограниченные transaction waits; это не HA production обещание. SQLite и четыре отдельные копии финансового backend отвергнуты как несоответствующие выбранной архитектуре.

# ADR-002 — минимальный harness с обязательными проверками

Сохраняем root p-replicator skills/policies. Project-local role-map sources и pinned checker нужны для воспроизводимых gates; не устанавливаем Ruflo/новую orchestration платформу. Перед реализацией полный достаточный SPARC, validation и traceability. Перед UI handoff — browser E2E. Provider integration и MCP/A2A wire readiness различаются от fixture business parity; неизвестное не получает зелёный статус.
