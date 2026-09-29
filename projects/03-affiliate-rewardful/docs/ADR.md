# ADR-001 — распределённый монолит и четыре композиции

Статус: принят для автономной реализации F1 владельцем 2026-09-08. Контекст: четыре CJM должны стать независимо запускаемыми вариантами с переиспользуемым кодом. `/replicate` требует distributed monolith in monorepo, Docker Compose на VPS.

Решение: единый API/общие предметные модули/одна PostgreSQL БД на среду; четыре frontend-пакета и контейнера A–D. Релиз общий, API контракт единый. PostgreSQL только в отдельной internal Docker-сети с backend. Нет host DB ports, default password, доступа из UI. Секрет создаётся локально случайно и не коммитится; тестовые стенды следуют тем же ограничениям.

Последствия: деньги/права не расходятся между вариантами; независимые UI меняются без дублирования ledger. Backend deployment остаётся общим, тесты затрагивают все четыре потребителя. F1 финансовые операции сериализуются по tenant и используют ограниченные transaction waits; это не HA production обещание. SQLite и четыре отдельные копии финансового backend отвергнуты как несоответствующие выбранной архитектуре.

# ADR-002 — минимальный harness с обязательными проверками

Сохраняем root p-replicator skills/policies. Project-local role-map sources и pinned checker нужны для воспроизводимых gates; не устанавливаем Ruflo/новую orchestration платформу. Перед реализацией полный достаточный SPARC, validation и traceability. Перед UI handoff — browser E2E. Provider integration и MCP/A2A wire readiness различаются от fixture business parity; неизвестное не получает зелёный статус.

# ADR-003 — публичный домен reward.aicoding.space

Статус: принят владельцем 2026-09-29 («по проекту N3 давай сделаем все через reward.aicoding.space»). Контекст: сервер переехал с 212.192.0.33 на 194.85.249.105, а явный список origin в `shared/contracts/deployment.mjs` содержал только старый адрес — API отвечал с нового `403 ORIGIN_DENIED`.

Решение: `https://reward.aicoding.space` — вариант A и каталог демо (`/demos/index.html`); `https://{a,b,c,d}.reward.aicoding.space` — варианты A–D (`a.` — алиас корня); `https://n3-{a,b,c,d}.194.85.249.105.sslip.io` — запасной адрес. Каждое окружение — отдельная явная строка списка; вывод адреса из Host, заголовков или суффикса по-прежнему запрещён, произвольный поддомен `*.reward.aicoding.space` отклоняется. Канонический origin D для MCP/A2A без заголовка Origin — `https://d.reward.aicoding.space`.

Последствия: выпуск делается от релизной линии `acf124e` (ветка `n3/reward-domain`, коммит `901f0a6`, образы `bridge-901f0a6`), а не от main — в main незавершённая F3. `deployment.mjs` в main этой правки не содержит: будущий выпуск из main обязан её перенести, иначе новый домен снова получит 403. Webhook ЮKassa и `returnUrl` в секрете могут оставаться на sslip-адресе (он в списке); перевод их на домен — отдельное действие владельца в кабинете ЮKassa и в секрете.

**ADR-003, выкладка 29.09.2026 ~18:55 UTC (координатор):** образы `bridge-901f0a6` подняты командами из `docs/f2-operations.md`; проверка: `OPTIONS /api/command` с Origin `https://reward.aicoding.space` → 204, с `https://evil.reward.aicoding.space` → 403; `reward`, `b.`, `c.`, `d.reward.aicoding.space` → 200. Откат — метка `bridge-acf124e` в пяти overlay.

**ADR-003, дополнение 29.09.2026 — лимит демосеансов стал настройкой.** Контекст: публичный стенд упёрся в зашитый лимит 200 fixture-организаций, `POST /api/demo` отвечал `429 DEMO_LIMIT`. Решение владельца («Настройка + 400»): лимит читается из `N3_MAX_DEMO_RUNS`; не задана — прежние 200; пустая, нецелая, ≤0, выше 10000 или мусор — отказ при старте (honest-configuration, CFG-I2/I3), а не молчаливые 200. На стенде — 400, в overlay `compose.bridge-release.yml`; пересобран только API (`n3-api:bridge-38bed68`, коммит `38bed68` ветки `n3/reward-domain`), фронтенды — `bridge-901f0a6`. Последствия: лимит не освобождается сам (строки fixture-организаций не удаляются) — при повторном исчерпании нужно либо поднять значение в пределах 10000, либо отдельное решение об очистке старых демо. Откат — метка `bridge-901f0a6` в overlay API. Операции: [f2-operations](f2-operations.md#лимит-демосеансов-n3_max_demo_runs-29092026).
