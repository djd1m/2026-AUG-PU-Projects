## Повторная проверка

1. **MinIO — закрыта.** Связь учётных данных и создание обоих бакетов описаны в [REPRODUCE.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/REPRODUCE.md:123), соответствуют [docker-compose.yml](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docker-compose.yml:25) и [storage.ts](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/apps/web/src/lib/storage.ts:11). Наличие `mc` подтверждается [официальным release Dockerfile MinIO](https://github.com/minio/minio/blob/master/Dockerfile.release).

2. **TEST-пилот агентных покупок — частично.** Команды сборки, тегирования и запуска добавлены в [REPRODUCE.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/REPRODUCE.md:238) и согласованы с образами из [compose.agent-pilot.yml](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/compose.agent-pilot.yml:29). Но последовательность не прогонялась, отсутствуют воспроизводимые env, миграции и конфигурация прокси; документ теперь честно маркирует пилот невоспроизводимым.

3. **Токен кабинета партнёра — закрыта для оператора.** Ручная процедура в [REPRODUCE.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/REPRODUCE.md:295) повторяет `issuePartnerCode` и SHA-256 из [partner.ts](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/apps/web/src/lib/partner.ts:32). Отсутствие продуктового UI/CLI раскрыто явно.

4. **Дизайн-система — закрыта.** FR-DESIGN-001 добавлена в таблицу фич и спецификацию; ссылки ведут к `globals.css`, branding и действующему тесту.

5. **Запасной Caddy — закрыта.** [REPRODUCE.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/REPRODUCE.md:40) больше не обещает неработающий путь и точно описывает противоречие с compose/Caddyfile.

6. **`check-compose-buildable.sh` — закрыта.** В [REPRODUCE.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/REPRODUCE.md:104) проверка прямо названа статической.

## Оставшиеся находки

- **P1:** отдельный TEST-пилот всё ещё нельзя воспроизвести с нуля; добавленные команды помечены как выведенные и непроверенные.
- **P3:** в [rebuild-docs-codex.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/reviews/rebuild-docs-codex.md:24) закоммичено служебное сообщение `Failed to write last message file...`; строку следует удалить.

**Итог: да с поправками.** Основной стенд документирован для сборки с нуля; исключение — явно обособленный TEST-пилот.

Проверки: `check-rebuild-docs` — 0, `git diff --check` — 0, механический профиль T; E2E не применялся. Запрошено `gpt-5.6-sol/medium`, фактическая модель, длительность и usage хостом не подтверждены. Новую телеметрию записать нельзя из-за read-only FS; [существующая запись](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/docs/telemetry/p-replicator/20260929T182617Z-docs-rebuild-01-e22b/run.json:1) относится к прежнему прогону и остаётся незавершённой.