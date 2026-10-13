# Deployment checkpoints

## Исторический план от 2026-10-03 — подготовлен, не исполнен

Дата: 2026-10-03. OWN-N7-002 разрешает локальный MVP, но не production activation,
живую почту, charge или изменение shared proxy. Этот документ — конкретный план
для будущего согласования, а не выполненный релиз.

## Кандидат и текущее окружение

Product commit `21e42881`, source SHA256
`1144c60cfff6a30ae94be77971274102d5239adbfc8b19f3ee7f7f47f7d98e6a`;
image `sha256:e04c5647ca2e18e97a104b8ee348a1fc5880c9310d3a102371504571e066aeeb`.
Локальная проверка: `n7f06a`, loopback18709, private PostgreSQL16.10, CPU2.
Это dev/test fixtures; переносить их в production как реальные данные нельзя.

## Порядок будущего выпуска

1. Зафиксировать внешний домен, свободный variable port, владельца VPS/backup,
   TLS/proxy routing и окно работ; перед container start выполнить корневой
   `scripts/check-port-conflicts.sh`. PostgreSQL не публиковать.
2. Создать отдельные production runtime keys/DB password и закрытый каталог.
   Существующие данные требуют прежнего keyring; потеря AEAD/HMAC ключей не лечится
   сменой значения переменной. Секреты/backup не попадают в Git и логи.
3. Перед миграцией сделать `pg_dump` и encrypted/off-host backup вместе с отдельным
   защищённым escrow keyring. Восстановить в новую disposable БД, сравнить schema,
   counts, constraints и доступ к test ciphertext. **Actual backup/restore для
   production ещё не выполнялся**; это обязательный deployment gate.
4. Собрать/проверить точный candidate image, просмотреть SQL001–011. Startup
   применяет forward migrations. Down migrations не реализованы: перед необратимым
   изменением согласовать downtime и восстановление проверенного backup.
5. Поднять изолированный стек сначала со всеми режимами disabled. Проверить
   readiness, origin/cookie/TLS, login/tenant isolation, DB isolation и мониторинг.
6. Только после отдельного разрешения интегрировать реального почтового/платёжного
   провайдера с его действующими ограничениями, consent/unsubscribe/complaint flow,
   bounded I/O и небольшим opt-in pilot. Текущий код не содержит live-адаптера:
   одной смены env недостаточно и режим `live` отвергается.

## Откат и критерии остановки

До внешнего запуска сохранить предыдущий совместимый image digest и проверенный
backup. При startup/migration/auth/stop-safety failure отключить dispatch/poll/billing,
не удалять БД/volume, откатить image только при совместимой схеме. Иначе восстановить
backup в отдельную БД и подтвердить данные до переключения. Для первого production
release предыдущего production image нет; rollback означает оставить disabled и
не публиковать сервис. RPO/RTO и длительность downtime ещё не измерены.

Реальный pilot отдельно фиксирует eligible opt-in cohort, complaint threshold,
provider allowances и измерения репутации. Ни TEST payments, ни local sink не
засчитываются в revenue/deliverability/30-box семидневную метрику.


## Публичный preview — подтверждение 2026-10-07, 05:48 UTC

Владелец отдельно разрешил внешнюю публикацию существующего preview через
sslip.io. Root выполнил только routing Caddy и пересоздание web с
`APP_ORIGIN=https://n7.194.85.249.105.sslip.io`. Вход:
[https://n7.194.85.249.105.sslip.io/signin](https://n7.194.85.249.105.sslip.io/signin).

Использован прежний F08 image
`sha256:3791cac50f5b6c2c87dd5cd3975f8141a1dd846b405361ca7456623121ec0b37`,
без rebuild. Git revision image не установлен; текущие F10/F11 кандидаты этим
preview не подтверждаются. БД осталась private; режимы реальной
почты, AI и платежей не менялись. Это публикация preview, а не разрешение
production activation, реальных provider calls или семидневного pilot.

Root подтвердил TLS verify 0, HTTP→HTTPS 308 и `/signin` 200. Docker Playwright
прошёл регистрацию, вход в app и secure-cookie проверку: присутствуют шесть
nav headings/content, page errors 0. Отдельный partner API возвращает 404;
smoke не доказывает полную работу всех вкладок. Caddy добавлен отдельным route
с noindex и закрытием internal paths ответом 404. Точный UTC процесса публикации
не записан; 2026-10-07T05:48:40Z — измеренное подтверждение root. Фактическая модель, usage
и стоимость root для этой операции недоступны (`null`).

Исходный container сохранён остановленным как
`n7f06a-web-before-sslip-20261007`. Новый web подключён к `n7_network` и
`talk-ai-public`. Прежний compose path отсутствовал; root восстановил runtime
из защищённого inspect backup в `/tmp/n7-sslip-publication-20261007`, без
изменения product source или DB. Backup и секреты не публикуются. Исторические
production backup/restore, pilot и provider gates выше сохраняются.

[Санитизированная квитанция публикации](telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/external-preview-sslip-20261007/sanitized-publication-receipt.json), SHA256
`71574838a07a7c9e85b4293d6b5e4047dffc496988d737ac6802d4e787ec154a`.
