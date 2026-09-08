# Research Findings

Исследование продукта и CJM выполнено ранее в этом прогоне; повторный сбор без нового вопроса не нужен. Сохранённые источники и ограничения: [product research](discovery/research/product-research.md), [market trends](discovery/research/market-trends.md), [payout evidence](discovery/research/payout-evidence.md), [source capture](source-product-profile.md). Публичный облик снят вручную; закрытый кабинет не исследован. CJM D — авторский агентный путь, не наблюдение Rewardful.

Главный вывод для F1: разделить merchant, customer и partner задачи, оставив общий ledger и ручной payout workflow. Выигрыш конкретного интерфейса или модели ещё не измерен; четыре варианта нужны для сравнения, а не доказательства заранее выбранного победителя. Политика quality-first-v2 и снимок матрицы находятся в development/model-routing и discovery/research.

Технологическая конкретизация 2026-09-08: распределённый монолит Docker/Node/PostgreSQL согласно `/replicate` и указанию владельца. `pg` требует один checked-out client на всю транзакцию; финансовая команда удерживает tenant row lock только во время локальной обработки. Источники: [node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL16 row locks](https://www.postgresql.org/docs/16/explicit-locking.html). Проверка этих свойств — настоящими конкурентными запросами к тестовому backend, без публикации DB портов.

Confidence: высокое для прямых решений владельца и документированных transaction semantics; среднее для UX гипотез по публичным аналогам; неизвестное для экономического эффекта/production provider capability до измерений. Регистрация ИП, договоры и сроки подключения не считаются проверенными по написанному коду.
