# 08. Помощник по ремонту: от обмеров до покупок и бюджета

N8 — модульное приложение для человека, который делает ремонт для себя. Оно связывает измеренную основу комнаты, референсы, варианты оформления, товары, смету, оплатную способность и приватное обсуждение результата. Канон продукта — выбранный владельцем CJM A.

## Что реализовано

Приложение состоит из модулей `identity`, `space`, `design`, `procurement`, `billing` и `sharing` на Next.js 15, React 19, TypeScript и PostgreSQL 16. Web, worker и приватное файловое хранилище запускаются локально через Docker Compose; база данных не публикует порт, web слушает только `127.0.0.1:3088` по умолчанию.

Основной путь работает без внешних ключей:

- регистрация, вход, отдельные проекты и история ревизий;
- распознавание размерных подписей на JPG/PNG/WebP: выбор длины/ширины/высоты без повторного набора чисел, проверка и сохранение приватного чертежа-источника;
- ручной обмер прямоугольной комнаты, окна/двери, 2D-план и Babylon.js 3D;
- приватные изображения и self-contained GLB v2 с проверкой формата и ресурсов;
- публичная HTTPS-ссылка Pinterest как сохранённый референс и ручная загрузка изображения; сервер не скачивает ссылку и не обещает Pinterest API/OAuth import;
- ручной дизайн, согласование, товары, точные упаковки, неизвестные статьи затрат, этапы и CSV;
- приватный export/share с watermark, сроком ссылки и отзывом;
- серверные OpenRouter и ЮKassa adapters, выключенные по умолчанию.

Геометрия основы immutable: вариант дизайна не может менять стены, проёмы и масштаб. Импортированный mesh не превращается автоматически в измеренную комнату, а неизвестная площадь или цена не превращается в ноль.

## Публичный стенд

Адрес: https://n8.77.83.87.178.sslip.io. Создайте свой аккаунт через «Начать мой ремонт». Текущий стенд запускается с `compose.public.yml`: Caddy выдаёт TLS, только порты 80/443 доступны снаружи, PostgreSQL и assets остаются приватными. AI работает в ручном режиме, оплата выключена.

Базовый публичный прогон до импорта чертежей: 21/21 шаг CJM и 57/57 UI-проверок в Chromium, Firefox, WebKit; найденные замечания исправлены. Результаты и границы — в [docs/public-release.md](docs/public-release.md).

## Локальный запуск

Требуются Node.js 24, npm и Docker Compose. Из корня репозитория сначала проверьте конфликт портов:

```sh
bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign
cd projects/08-interior-ai-redesign
npm ci
npm run setup:local
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d web worker
curl -fsS http://127.0.0.1:3088/health/ready
```

Откройте `http://127.0.0.1:3088`. Для доступа к приложению на удалённом сервере используйте SSH tunnel с рабочего компьютера:

```sh
ssh -N -L 3088:127.0.0.1:3088 user@server
```

Подробные команды, проверка health, остановка и конфигурация находятся в [INSTALL.md](INSTALL.md).

## Внешние возможности и честные границы

`npm run setup:local` создаёт приватный `.env` с `N8_AI_MODE=manual` и `N8_PAYMENTS_MODE=off`. В этом режиме приложение не делает AI- или платёжных вызовов. Live AI требует отдельно проверенного OpenRouter key, allowlisted Gemini model ID, актуальных тарифов, `max_tokens`, трёх денежных caps, подтверждённого provider hard limit и явного operator enable. Наблюдавшийся кандидат `google/gemini-4-argon` не считается автоматически пригодным или доступным: ID, тариф и качество нужно перепроверить перед включением. Live payment требует HTTPS origin, реального merchant config и отдельного разрешения.

Scaniverse указан как источник пользовательского экспорта. Валидатор и viewer проверены на синтетических GLB fixtures; реальный файл с устройства Scaniverse в доказательствах отсутствует. Splat/FBX/OBJ/PDF не входят в текущий импорт.

Две проверенные retailer-карточки вернули HTTP 401. Поэтому текущий каталог использует официальный deep link и ручной provenance snapshot; приложение не обходит 401 через CAPTCHA, proxy или скрытый scraping.

## Проверки и текущий статус

65 feature AC сопоставлены с фактическими тестами в `docs/features/*/05_completion.md`. FND-FINAL-1 закрыт RED-воспроизведением, 47 affected tests и 229/229 full regression. Image 9 (`sha256:3ac28e68…11369cb`, build `z7Mp9IiPagz7p0uRCxACH`) совпал с 148 host/runtime файлами и прошёл 21/21 production-browser проверок без external calls. Его API benchmark сохранил 1000 замеров при p95 40.804434 ms; pure 200-line budget дал 1000/1000 хэшей при p95 8.007006 ms. Image-9 before/after restart сравнил 12 проверок двух проектов, ревизий, смет и original asset hashes; readiness 200, provider calls 0.

Проверка completion в `@dzhechkov/p-replicator@1.13.2` имеет ошибку двойного добавления project docs path. Неизменённый tool не считается PASS; временная двухстрочная compatibility-копия дала четыре PASS по 7 features / 65 AC без изменения validator logic. Воспроизведение и SHA описаны в [compatibility receipt](docs/research/pipeline-checker-compatibility.md).

Основные документы: [Pipeline walkthrough — полный user flow и data flow](docs/pipeline-walkthrough.md), [Specification](docs/Specification.md), [Architecture](docs/Architecture.md), [Completion](docs/Completion.md), [Final Summary](docs/Final_Summary.md), [решения](docs/decision-log.md) и [исследования](docs/research/). Решения reuse/adapt/reject и source revisions сохранены отдельно для [foundation](docs/features/foundation/reuse.md), [space](docs/features/space/reuse.md), [design](docs/features/design/reuse.md), [procurement](docs/features/procurement/reuse.md), [billing](docs/features/billing/reuse.md) и [sharing](docs/features/sharing/reuse.md).

## Чертёж с размерами

На шаге «01 Обмеры» используйте «Загрузить и распознать чертёж». После распознавания укажите единицы подписей без обозначений и выберите подписи длины и ширины по номерам на изображении. Высоту выберите, если она указана; иначе введите её отдельно. Нажмите «Перенести размеры в обмеры», проверьте двери и окна, подтвердите обмеры и сохраните. Числа повторно печатать не нужно.

Поддерживается одна прямоугольная комната. Расстановка мебели на исходном плане необязательна; автоматического выделения стен, проёмов или мебели нет. OCR может ошибаться, поэтому исходный чертёж остаётся доступен для проверки. PDF/CAD пока преобразуйте в изображение. [Поток экранов и данных](docs/C4_Diagrams.md#drawing-import-flow).
