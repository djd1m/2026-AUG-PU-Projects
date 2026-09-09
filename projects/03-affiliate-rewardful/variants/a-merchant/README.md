# Вариант A — Владелец запускает программу

[PRD](docs/PRD.md) · [Автономный прототип](prototype/index.html) · [Общие требования](../../shared/docs/PRD.md).

Рабочий F1 реализован в `app/`, отдельный frontend-контейнер использует общий API/PostgreSQL. Приёмка 2026-09-09: 8 критериев, 12 браузерных сценариев (Node13/13), полный набор38/38, независимое ревью с закрытыми замечаниями. [Отчёт](../../docs/features/a-merchant/review-report.md) · [Доказательства и снимки экранов](../../docs/telemetry/p-replicator/20260909T060632Z-go-a-merchant/evidence/).

На VPS: `http://127.0.0.1:13031/`. Для своего браузера подключите SSH-туннель `ssh -L 13031:127.0.0.1:13031 пользователь@VPS`, затем откройте этот адрес локально. БД не требует и не имеет опубликованного порта.

Из корня проекта N3, после установки зависимостей и проверки свободных портов:

```bash
node scripts/setup-secrets.mjs
docker compose up -d --build
docker compose -f variants/a-merchant/docker-compose.yml up -d --build
```

Перед первым запуском: из корня репозитория выполните `bash scripts/check-port-conflicts.sh projects/03-affiliate-rewardful` и аналогичную проверку для `projects/03-affiliate-rewardful/variants/a-merchant`. При обновлении уже работающего контейнера проверьте, что порт принадлежит ему самому. Не меняйте чужие сервисы.

Проверки из корня N3:

```bash
npm run build
docker compose -f docker-compose.test.yml run --rm --no-deps backend npm test
node --test tests/e2e/a-merchant.mjs
```

Браузерный тест требует отдельно запущенного локального WebDriver; переменные `N3_WEBDRIVER_URL`, `N3_WEBDRIVER_SESSION` задают адрес и файл квитанции сеанса. Тесты создают только синтетические данные.

F1 не выполняет реальные списания/переводы. Приглашение — предпросмотр условий текущего демосеанса; публичная публикация программы и настоящий MCP/A2A — последующие этапы. Выгрузка CSV не отмечает отправку. Общая приёмка четырёх вариантов ещё продолжается.

`prototype/index.html` — отдельный исходный CJM, а не рабочее приложение. Его сборка описана в [README прототипов](../../docs/prototypes/cjm/README.md).
