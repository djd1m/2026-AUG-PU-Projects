# 02. Умный QR для отзывов о заведении — ReviewQR

> **Неделя 02** · `репутация` · референс: **категория review management — [NiceJob](https://nicejob.com/), [Birdeye](https://www.birdeye.com/), [Podium](https://www.podium.com/) (единого оригинала нет)** · стенд: **https://reviewqr.aicoding.space**

## Простыми словами

**Проблема.** У кафе или салона десятки довольных гостей в день, но отзывы на картах пишут
единицы — и чаще те, кому что-то не понравилось. Рейтинг выходит ниже заслуженного, а о
проблеме владелец узнаёт из публичного разноса.

**Что делает продукт.** Даёт заведению QR-код: на столик, на чек, на упаковку. Гость наводит
камеру и попадает на страницу, где **сразу и одинаково** видны две двери: оставить отзыв на
Яндекс.Картах или 2ГИС — или написать владельцу лично. Личное сообщение прилетает владельцу в
Telegram.

**Зачем это людям.** Гостю — простой способ сказать спасибо или пожаловаться, не разыскивая,
куда писать. Владельцу — больше отзывов на картах и шанс решить проблему до того, как она
станет публичной.

**Одна честная деталь.** Продукт не спрашивает оценку заранее и не прячет карты от недовольных.
Внешнего правового запрета на такую фильтрацию для Яндекс.Карт и 2ГИС нет — двойная дверь
здесь **продуктовый выбор владельца**, а не требование площадок
([`DECISIONS-PHASE-0.md`](docs/DECISIONS-PHASE-0.md) D-03). И ещё одно: узнать, опубликовал ли
гость отзыв, продукт не может — у площадок нет API отзывов. Он знает только «гость перешёл на
площадку».

**Как этим пользуются.** Владелец заводит кабинет → вставляет ссылки на свои карточки →
печатает QR → подключает Telegram → гости сканируют → жалобы идут ему лично, отзывы — на карты.

## Что делаем

Страница-развилка `/r/<slug>` с равноправными дверями, приём приватных обращений, доставка
владельцу в Telegram, кабинет владельца с QR и печатными макетами, оплата плана «Точка» через
ЮKassa (990 ₽ / 30 дней). Роутинга по оценке нет — в схеме есть страж на поля, которых **не
должно существовать** (`scripts/check-db-grants.sh`).

**Стек:** Node 22 + TypeScript без фреймворка, PostgreSQL 16 с четырьмя ролями (по одной на
контейнер) и RLS, четыре сервиса Docker Compose за общим reverse-proxy машины.

## Механики роста (обязательный блок)

| Драйвер | Гипотеза | Как реализовано |
|---|---|---|
| **Виральность** ⚠️ | НЕ виральный продукт: гость не приводит новое заведение. Офлайн-QR даёт impression-loop, а не viral loop. Основной loop — продажи | Бренд-строка «Сделано на ReviewQR» на странице бесплатной точки; снимается оплатой (FR-GROWTH-003, `apps/guest/src/render.ts`). Снятие после живого платежа подтверждено ответом страницы |
| **Партнёрка** | _заполняется по итогам [`GROWTH-MECHANICS-REQUIREMENTS.md`](../../research/GROWTH-MECHANICS-REQUIREMENTS.md)_ | Требования есть (FR-GROWTH-002, 004 в [`Specification-GROWTH.md`](docs/Specification-GROWTH.md)); в оплате начисляется комиссия по атрибуции, но **места, где атрибуция записывается, в коде нет** — выдачи кодов и кабинета партнёра нет |
| **Блогеры / люди с аудиторией** | _заполняется по итогам [`GROWTH-MECHANICS-REQUIREMENTS.md`](../../research/GROWTH-MECHANICS-REQUIREMENTS.md)_ | не реализовано |

## Что построено

| Часть | Что делает |
|---|---|
| `apps/guest` | страница-развилка `/r/<slug>`, форма `/r/<slug>/private`, переход `/go/<slug>/<площадка>` (302 + событие «гость выбрал дверь»), кэш ≤ 60 с со сбросом по вызову |
| `services/intake` | приём приватного обращения: Origin → грубый барьер в памяти → два порога в БД (10 в час с адреса на точку, 100 в час на точку) → валидация → одна транзакция |
| `services/notifier` | доставка в Telegram с ретраями, привязка бота одноразовым токеном, истечение подписки |
| `apps/web` | кабинет: регистрация, точки (слаг из названия транслитом), ссылки площадок по allowlist в коде, QR и печатные макеты, привязка Telegram, оплата и вебхук ЮKassa |
| `packages/db` | 12 миграций (`001_types` … `012_bind_token_burn`) и раннер, который помнит применённое |

Несущие свойства, у каждого есть страж: роль гостевой страницы не может писать в чужие таблицы;
изоляция владельцев на RLS; вебхук оплаты проверяет подлинность **до** записи ключа
повторности, ключ составной, недоступность ЮKassa — исключение, а не значение
([`webhook-contract.md`](docs/webhook-contract.md)). 103 теста, `scripts/test-all.sh`.

## Как запустить

Перед любым запуском:

```bash
node ../../.claude/hooks/check-ports.cjs .           # хранилище наружу не смотрит
bash ../../scripts/check-port-conflicts.sh .         # порты этой машины свободны
```

```bash
cp .env.example .env    # пароли: openssl rand -hex 24; BASE_URL дефолта НЕ имеет намеренно
npm test                # = bash scripts/test-all.sh: одноразовая база, каждый набор под СВОЕЙ ролью
npm run guards          # страж матрицы прав
docker compose up -d --build
```

Оговорки. `npm test` — это скрипт, а не голый `vitest run`: одного `TEST_DATABASE_URL` на все
наборы не существует, и голый прогон падает «правами», будто сломан проект. Compose ждёт
внешнюю сеть `talk-ai-public` общего reverse-proxy — своих 80/443 у проекта нет. Раннер
миграций (`npm run migrate`) читает `DATABASE_URL_MIGRATE`, которой в `.env.example` **нет** —
её придётся задать самому. Отдельной инструкции «поднять заново на другом сервере» у проекта нет.

## Документация

| Файл | О чём |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | продукт, метрика недели, риски (R-1 — главный) |
| [`docs/Specification.md`](docs/Specification.md) · [`-GROWTH`](docs/Specification-GROWTH.md) · [`-NFR`](docs/Specification-NFR.md) | требования, рост, нефункциональные |
| [`docs/Architecture.md`](docs/Architecture.md) · [`-DATA`](docs/Architecture-DATA.md) · [`-OPS`](docs/Architecture-OPS.md) · [`-UI`](docs/Architecture-UI.md) | сервисы, схема и роли, эксплуатация, интерфейс |
| [`docs/ADR.md`](docs/ADR.md) · [`docs/ADR-UI.md`](docs/ADR-UI.md) | решения |
| [`docs/Pseudocode.md`](docs/Pseudocode.md) · [`-OWNER`](docs/Pseudocode-OWNER.md) · [`-GROWTH`](docs/Pseudocode-GROWTH.md) | алгоритмы |
| [`docs/Refinement.md`](docs/Refinement.md) | граничные случаи, конкурентные тесты, мутации |
| [`docs/validation-report.md`](docs/validation-report.md) | проход Б вместо полной Phase 2; §7 — что открыто |
| [`docs/DECISIONS-PHASE-0.md`](docs/DECISIONS-PHASE-0.md) | решения на входе в Phase 1 (D-01…D-03) |
| [`docs/source-product-profile.md`](docs/source-product-profile.md) | облик источника (Phase 0.5) |
| [`docs/webhook-contract.md`](docs/webhook-contract.md) | контракт вебхука ЮKassa |
| [`docs/demo-script.md`](docs/demo-script.md) · [`.html`](docs/demo-script.html) | прогонный лист демонстрации 02.09 |
| [`docs/features/payment/`](docs/features/payment/) | фича «оплата»: SPARC-комплект, валидация, DoD |
| [`docs/features/client-account-handover/`](docs/features/client-account-handover/) | передача аккаунта заказчику: только план |
| [`docs/discovery/`](docs/discovery/) · [`docs/research/`](docs/research/) | Phase 0: разведка, право, CJM, скрипт продаж; ограничения слага |

## Структура

```
02-review-qr-reputation/
├── README.md              # этот файл (CLAUDE.md, .claude/ и файла бэклога у проекта нет)
├── docker-compose.yml     # postgres без публикации + guest, intake, notifier, web
├── .env.example
├── apps/guest/            # гостевая поверхность
├── apps/web/              # кабинет владельца, оплата
├── services/intake/       # приём приватных обращений
├── services/notifier/     # доставка в Telegram, привязка, истечение
├── packages/db/           # миграции 001–012 и раннер
├── scripts/               # test-all.sh, check-db-grants.sh
└── docs/                  # SPARC, discovery, features, demo-script
```

## Статус на 2026-09-02

| Этап | Статус |
|---|---|
| Phase 0 — Product Discovery | ✅ 01.09; владелец выбрал вариант A «Смена» (SALES loop) |
| Phase 1 — SPARC | ✅ 01.09, 13 документов |
| Phase 2 — Validation | 🟢 проход Б вместо полной Phase 2 (выбор владельца), находок нет |
| Реализация MVP | ✅ гостевая страница, приём, доставка в Telegram, кабинет, QR, оплата; стенд `reviewqr.aicoding.space` |
| Оплата | ✅ живой **тестовый** платёж 02.09: подписка active до 02.10, бренд-строка снята |
| Передача аккаунта | ⏸ план готов и провалидирован, реализация не запускалась |

**Расхождения в источниках — названы, сторона не выбрана:**

- **Имя продукта.** В PRD рабочее имя **ReviewDoor** ([`PRD.md:7`](docs/PRD.md)); в кабинете,
  бренд-строке, домене и прогонном листе — **ReviewQR**. Решения владельца об имени нет.
- **Число тестов.** DoD оплаты — «90 тестов» ([`payment/05_completion.md:4`](docs/features/payment/05_completion.md));
  коммит `50ebc949` и шапка `scripts/test-all.sh` — 103. Вероятно, разные моменты времени.
- **Цена.** [`DECISIONS-PHASE-0.md:74`](docs/DECISIONS-PHASE-0.md) и [`validation-report.md:91`](docs/validation-report.md)
  называют её нерешённой; позже владелец утвердил 990 ₽ (DEC-PAY-1,
  [`payment/05_completion.md:13`](docs/features/payment/05_completion.md)). Старые документы не обновлены.
- **Номер миграции передачи аккаунта.** План занимает `012`
  ([`03_architecture.md:32`](docs/features/client-account-handover/03_architecture.md)), но `012`
  уже занят `012_bind_token_burn.sql` (коммит `27ee2e6b`, сделан после плана).
- **Прогонный лист устарел в одном пункте.** «Кнопку „уведомления“ НЕ ТРОГАТЬ — она разрывает
  привязку» ([`demo-script.md:29`](docs/demo-script.md), `:281`) — исправлено коммитом `27ee2e6b`
  (02.09, 17:21 UTC); лист правился последний раз в 10:22 того же дня.

## Что осталось

**Открытые задачи**

1. **Передача аккаунта заказчику** (`client-account-handover`) — тир XL, план готов, реализация
   владельцем не запускалась ([`01_specification.md:3-10`](docs/features/client-account-handover/01_specification.md)).
   Ждут утверждения DEC-HAND-1…3: кто платит после передачи, доступ агентства по умолчанию,
   предел в 10 неоплаченных аккаунтов ([`01_specification.md:74-76`](docs/features/client-account-handover/01_specification.md)).
   Перед стартом — перенумеровать миграцию (см. «Расхождения»).
2. **Диплинки площадок на живом телефоне** (~1 ч) — **блокирует пилот**
   ([`validation-report.md:89`](docs/validation-report.md)). На стенде ссылки пока ведут на
   поиск по площадке, а не на карточку ([`demo-script.md:13-16`](docs/demo-script.md)).
3. **Повтор вебхука ЮKassa руками** (кнопка «Повторить» в кабинете ЮKassa) не проверен живьём;
   идемпотентность закрыта тестом P-1 ([`payment/05_completion.md:10-12`](docs/features/payment/05_completion.md)).
4. **Потолок длины сообщения в MAX** — `[GAP]`, закрывается замером
   ([`Refinement.md:311`](docs/Refinement.md)); в коде взято 2000 до замера
   (`services/notifier/src/format.ts:10`). Отправка в коде сейчас реализована только для Telegram.
5. **Строки роста «Партнёрка» и «Блогеры»** — «заполняется» (таблица выше).
6. ✅ **Исправлено, ветка `worktree-agent-ac42582832d8f5df6`, на стенд не выложено** (нужно
   пересобрать `guest` и `intake`): адрес гостя едет в `intake` заголовком `X-Guest-IP`, `guest`
   верит `X-Forwarded-For` только от прокси — [`guest-ip-forwarding/`](docs/features/guest-ip-forwarding/05_completion.md).
   Было: **лимит 10 в час считает всех гостей за одного — подтверждено по коду.** Источник — «Риски на сцене» ([`demo-script.md:283`](docs/demo-script.md), `:351`).
   Форма гостя уходит в `intake` внутренним вызовом из `apps/guest`
   (`apps/guest/src/server.ts:112-114`), и адрес гостя в нём не передаётся. `intake` берёт
   адрес из `X-Forwarded-For`, а без заголовка — адрес сокета, то есть контейнера `guest`
   (`services/intake/src/server.ts:35-38, 72`). Прямого входа в `intake` снаружи нет (он не в
   сети прокси). Итог: порог «10 с адреса на точку» на деле — **10 обращений в час на точку от
   всех гостей**, а грубый барьер (200 в час, `barrier.ts:22`) — **200 в час на весь продукт**.
   Это нарушало критерии C-3 и C-3b ([`Refinement.md`](docs/Refinement.md) §3); тесты были
   зелёными, потому что били в `intake` напрямую.

**Решения владельца**

- **DEC-PAY-2** — боевой магазин ЮKassa перед первым платящим клиентом; сейчас тестовый
  ([`payment/05_completion.md:14`](docs/features/payment/05_completion.md)).
- **Имя продукта и домен** ([`validation-report.md:91`](docs/validation-report.md)).
- **D-01…D-03** приняты исполнителем без ответа владельца и действуют, пока не отменены
  ([`DECISIONS-PHASE-0.md:3-5`](docs/DECISIONS-PHASE-0.md)).

**Принятые риски**

- **У продукта нет свойства, которого нет у конкурента за 900 ₽** — главный риск; сборкой не
  чинится ([`PRD.md:286`](docs/PRD.md), [`validation-report.md:92`](docs/validation-report.md)).
- **Публикацию отзыва проверить нечем**: API у Яндекс.Карт и 2ГИС нет; замена — ручная сверка
  карточек по пяти точкам ([`DECISIONS-PHASE-0.md:22-35`](docs/DECISIONS-PHASE-0.md)).
- **Одна точка на тариф**; «Сеть» и «Агентство» — второй релиз ([`demo-script.md:233`](docs/demo-script.md)).
- **Сбой Telegram не виден гостю**: гость получает «отправлено» в любом случае, ошибка канала
  видна только владельцу в кабинете ([`Refinement.md:307`](docs/Refinement.md), `:312`).
