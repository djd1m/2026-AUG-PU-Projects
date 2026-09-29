## 1. Прежние находки

1. **Частично — список владельцев.** `REPRODUCE.md:249–255` теперь удаляет прежний адрес перед запуском скрипта. Однако образ `api` собирается раньше (`REPRODUCE.md:243–245`), а последующий `up` не содержит `--build` (`REPRODUCE.md:256–258`). Пересборка зависит от необязательного ответа `y` в `scripts/set-owner-email.sh:24–30`; при ответе по умолчанию стенд запускается со старым `OWNER_EMAILS` из образа → `apps/api/src/routes/admin.ts:23`.

2. **Закрыта — произвольные `N4_COMPOSE_PROJECT` и `N4_EDGE_PORT`.** Миграция, health-check, имя recognizer и цель общего Caddy используют соответствующие переменные → `REPRODUCE.md:228,247,260,291–298`; compose действительно берёт имя из `N4_COMPOSE_PROJECT` → `docker-compose.yml:10`.

3. **Закрыта — источник комиссии.** Документы теперь указывают перезапрошенный платёж и `income_amount` → `Pseudocode.md:486–492`, `Specification.md:774–778`. Код получает `income_amount` из ответа API и вычисляет `fee`/`net` → `apps/api/src/payments/yookassa.ts:162–170,264–272`, `apps/api/src/routes/payments-webhook.ts:171–197`.

4. **Закрыта — миграции и число таблиц.** `Architecture.md:354–371` перечисляет миграции `002–013` и 22 предметные таблицы плюс `schema_migration`; это совпадает с закрытым списком → `tests/integration/migrations.test.ts:14–18,70–76`.

5. **Закрыта — импорт USDA.** `model-cost-contract.md:71–74` правильно описывает четыре локальных CSV и отдельное скачивание оператором → `scripts/import-fdc.ts:4–6,22`, `docs/operations/import-fdc.md:3–5`.

## 2. Новые ошибки или противоречия

- **P1:** тестовый рецепт жёстко использует `n4-repro` и затем выполняет `down -v` → `REPRODUCE.md:177–181`, хотя имя стенда разрешено менять через `N4_COMPOSE_PROJECT` → `REPRODUCE.md:224`. Если стенд назван `n4-repro`, будут удалены его тома. Защита проверяет только буквальное `n4-tarelka` → `scripts/create-test-database.sh:25,45–46`. G-26 это признаёт, но процедура остаётся опасной.

## 3. Вердикт

**Готово к «сборке с нуля»: нет.** Осталось две находки: обязательная пересборка `api` после смены владельца и защита тестового compose-проекта от совпадения с настраиваемым именем стенда.

Проверки: complexity router — T/exit 0; `git diff --check` — exit 0. Профиль `compact-quality-first-v2`; точная фактическая модель, usage, стоимость и длительность хостом не предоставлены. Телеметрия: `projects/04-calorie-vision-cal-ai/docs/telemetry/p-replicator/20260929T182617Z-docs-rebuild-04-a0e5/` — запись осталась неполной и не обновлялась в read-only сеансе.