# F01 принят: авторизация и приватные загрузки

Принят coordinator 2026-10-02T20:32:31.645178+00:00, итоговый product source `187a14a5af986c3115ae7cbddbc3b67ff0a3937e`. Это приёмка ограниченного F01, не всего MVP, не browser E2E и не GPU quality.

| Критерии | Фактическое доказательство |
|---|---|
| AUTH-01/02 | Реальный PostgreSQL16: конкурентная регистрация даёт ровно1 account/trial/session; bcrypt/Unicode/dummy hash, HMAC-сессии, logout/expiry |
| AUTH-03/04 | Exact Origin/body/rate/IP, два аккаунта и private media404; baseline0→targeted owner mutation1 |
| UPLOAD-01 | JPEG/PNG/WebP magic/decode,10MiB/20MP точные границы, EXIF/orientation и перекодирование |
| UPLOAD-02 | DB insert failure cleanup, orphan/live/recent/symlink, cursor progression через10 отдельных процессов и независимый.tmp |
| Применимые SEC-01/02/03 | Fail-closed config, owner/Origin mutation и negative harness controls; privateDB/no published5432, webloopback, runtime startup; зависимости audit0 |

Канонический Docker build прошёл. Unit:12 основных +2 harness; realPG:9 tests включая родительский test,0fail. Origin mutation baseline0/target1, owner mutation baseline0/target1. Дополнительный Compose startup после конкретной ошибки публикации порта: actual127.0.0.1:18088, localhost curl0 и ответ побайтно совпадает с index.html; internalHTTP200; DBтолькоprivate и5432:null. Стеки/тома/сети проверок удалены. Hostcurl не записывал явный HTTP status — не приписываем его; это проверка доступности и точного тела, не browserE2E.

Независимое Astra-ревью сначала нашло2medium; оба закрыты ACCEPT в `n8-f01-fix-review-receipt.md`. Отдельная подтверждённая runtime ошибка Compose исправлена Sol и принята свежей Astra в `n8-f01-network-review-receipt.md`. Оригинальные отчёты и неудачи неизменяемы. Runtime source binding дополнен coordinator в `n8-f01-network-docker-checks.json`: reviewer видел raw JSON без идентификаторов, теперь зафиксированы source/Compose hash/image и25 неизменных исходников. Это дополнительное наблюдение, не редактирование reviewer verdict.

Профиль compact-quality-first-v2, substantiveXL. Фактические CLI модели подтверждены hostbanner: coder/corrections gpt-6.1-sol, independentreview gpt-6-astra; requestedhigh, per-agent tokens/cost/active-time null. От первого F01 launch до этой ограниченной приёмки 3767645ms, включая координацию, очередь ресурсов, ревью и исправления; часы отдельных receipt наблюдений сохранены отдельно от wrapper duration. Native coordinator actualmodelunknown.

Доказательства: `docs/telemetry/n8-20261002-1740/n8-f01-*-checks.json`, полные immutable receipts/runtime metadata и `events.jsonl`. F02 подключит периодический maintenance worker, jobs/tickets/quality. Глобальные SEC/payments/growth/GPU AC остаются pending согласно roadmap; успешный F01 их не закрывает.
