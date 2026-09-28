# 01. Сбор отзывов и «Стена любви» — Proofwall

> **Неделя 01** · `отзывы` · референс: **[Senja.io](https://senja.io/) — 7000+ создателей и SaaS, $1M ARR, импорт с 30+ платформ**
> · стенд: **https://proofwall.aicoding.space/**

## Простыми словами

**Проблема.** Клиенты вас хвалят — в переписке, голосом, в письме, на Яндекс.Картах. Но похвалы
разбросаны, а на сайте пусто, и новый посетитель не понимает, можно ли вам доверять.

**Что делает продукт.** Даёт ссылку, которую вы отправляете довольному клиенту. Он оставляет отзыв
текстом или видео прямо в браузере, без регистрации. Вы решаете, что показывать. Одобренное
складывается в публичную страницу-стену и в блок, который вставляется на ваш сайт одной строчкой.

**Зачем это людям.** Отзыв живого человека убеждает сильнее рекламного текста. Продукт превращает
разрозненные похвалы в доказательство, которое висит на вашем сайте круглосуточно.

**Одна честная деталь.** На бесплатном тарифе под блоком стоит знак Proofwall, и решает это сервер,
а не блок на вашей странице. Это и есть главный канал роста продукта, поэтому его нельзя «выключить
в браузере». Снять знак можно оплатой.

**Как этим пользуются.** Отправили ссылку пяти клиентам → получили три отзыва → одобрили →
вставили блок на сайт. Дальше он наполняется сам.

## Что делаем

Аналог Senja: сбор текстовых и видео-отзывов, стена (Wall of Love), встраиваемый виджет без кода.
Импорта с 30+ площадок в неделе нет — момент ценности переопределён как «твоя стена живёт на твоём
домене» ([`CLAUDE.md`](CLAUDE.md), PRD §2.3). Метрика недели — число виджетов на внешних доменах,
цель 10 ([`decisions/D-001-metric-target.md`](decisions/D-001-metric-target.md)).

**Стек:** Next.js в монорепо, PostgreSQL 16 с RLS, MinIO для видео, Caddy, виджет в Shadow DOM
отдельным бандлом. Расшифровка видео — OpenAI STT только через сервис `services/transcribe`,
единственный путь `POST /transcribe`: переписывать или «улучшать» текст отзыва продукт не умеет по
построению (ADR-005, D-007). Оплата — ЮKassa ([`decisions/D-009-yookassa-not-stripe.md`](decisions/D-009-yookassa-not-stripe.md)).

## Механики роста

Требования по росту — FR в [`docs/Specification.md`](docs/Specification.md), список — PRD §4.2.

| Драйвер | Требование | Как реализовано |
|---|---|---|
| **Виральность** — badge loop | FR-GROWTH-003, FR-006, FR-007 | виджет получает `badge_required` только с сервера (`GET /api/widget/config`); на free знак обязателен, снятие отслеживается MutationObserver (ADR-002). После оплаты знак пропадает, по истечении срока возвращается сам |
| **Виральность** — момент ценности | FR-GROWTH-001, FR-013 | событие `widget_installed` на пару «проект + домен», share-CTA на каждый новый домен; домен продукта и его поддомены не засчитываются ([план FR-013](docs/plans/fr-013-external-domain.md)) |
| **Партнёрка** | FR-GROWTH-002, FR-011 | атрибуция до оплаты, промокод важнее cookie (ADR-003), запрет самореферала; партнёр видит свою когорту в своём кабинете по токену |
| **Партнёрка через N3** | вне roadmap | оплаченные покупки передаются в партнёрскую платформу проекта 03; выключено по умолчанию (`N3_BRIDGE_ENABLED=false`) — [архитектура](docs/n3-integration-architecture.md) |
| **Блогеры / люди с аудиторией** | FR-GROWTH-004 | персональные партнёрские коды + анти-фрод по IP на регистрациях |
| **SEO** | FR-GROWTH-005 | стена `/w/<slug>` отдаётся SSR со schema.org/Review; пока отзывов мало — `noindex` (ADR-004) |

## Что построено

По [`.claude/feature-roadmap.json`](.claude/feature-roadmap.json): 25 записей, из них **20 фич `done`**,
FR-015 `planned`, четыре решения владельца DEC-001…004 `blocked`.

- **MVP (13):** регистрация и проект с тремя ссылками (FR-001); форма — текст (FR-002) и видео с
  очередью расшифровки (FR-003); модерация с журналом (FR-004); стена (FR-005); виджет ≤30 KB gzip
  (FR-006); тарифы на сервере (FR-007); оплата с идемпотентным вебхуком (FR-008); пять GROWTH-фич выше.
- **После MVP (7):** вход (FR-009), смена пароля и завершение сессий (FR-010), кабинет партнёра
  (FR-011), повтор расшифровки при сбое (FR-012), определение внешнего домена (FR-013), импорт из
  CSV (FR-014), вход через Yandex ID (FR-016). Квитанции — `docs/features/fr-0NN-*/05_completion.md`.

**Сверх roadmap** (есть в коде и документах, в roadmap записей нет):

- **Приём оплаты по-настоящему** — 990 ₽ за 30 дней, срок в `paid_until`, досрочная оплата не
  сжигает остаток; проверено на тестовом магазине ЮKassa, автопродления и возвратов нет
  ([отчёт](docs/features/paid-tier-checkout/02-completion.md), [подключение](docs/yookassa-setup.md)).
- **Отзыв с площадки** — владелец приносит ссылку на первоисточник и снимок, они видны на стене
  и в виджете (миграция 017; [спецификация](docs/features/platform-proof/01_specification.md)).
- **Приём видео закрыт по умолчанию** (`VIDEO_INTAKE_ENABLED`): расшифровка — единственный путь,
  тратящий деньги владельца, а суточного потолка ещё нет. Цепочка видео проверена сквозным прогоном
  2026-09-02 и оставлена выключенной.
- **Мост к N3** — передача оплаченных покупок в партнёрскую платформу проекта 03
  ([квитанция](docs/features/n3-affiliate-bridge/05_completion.md)).
- **Агентные покупки** — агент через MCP / A2A покупает и продлевает тариф, человек подтверждает
  оплату; отдельный TEST-стенд https://proofwall-agent.212.192.0.33.sslip.io/
  ([пилот](docs/features/agent-purchase/public-pilot.md), [квитанция](docs/features/agent-purchase/05_completion.md)).
- **Демо-отзывы**, помеченные и в данных, и на экране (миграция 016), и
  [прогонный лист демонстрации](docs/demo-script.md).

## Как запустить

Полное описание — [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) §1. Перед любым запуском:

```bash
node ../../.claude/hooks/check-ports.cjs .      # хранилища наружу не смотрят
bash scripts/check-port-conflicts.sh .          # порты этой машины свободны
```

```bash
cp .env.example .env      # пароли, SESSION_SECRET, S3_*, BASE_URL, ключи — см. комментарии в файле
docker compose up -d
PGHOST_IP=$(docker compose exec -T postgres hostname -i | tr -d '\r')
DATABASE_URL="postgres://proofwall:<пароль>@${PGHOST_IP}:5432/proofwall" npm run db:migrate
```

Миграции (сейчас 20) накатываются с хоста: `packages/db` — workspace монорепо, не контейнер.
Тестовая база и `npm test` — там же, в DEVELOPMENT_GUIDE §1. На машине с чужим прокси на 80/443
стенд поднимается как `docker compose -f docker-compose.yml -f compose.demo.yml up -d web`
([`docs/yookassa-setup.md`](docs/yookassa-setup.md)). Раздел «Деплой» DEVELOPMENT_GUIDE ссылается
на `docker-compose.prod.yml`, которого в папке нет.

## Документация

| Файл | О чём |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | контекст, метрика, badge loop, три несущих ограничения |
| [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) | окружение, миграции, тесты, деплой |
| [`README/ru/README.md`](README/ru/README.md) · [`README/eng/README.md`](README/eng/README.md) | руководства пользователя и администратора, API, устранение неполадок |
| [`docs/PRD.md`](docs/PRD.md) · [`docs/Specification.md`](docs/Specification.md) | объём, персоны, FR и сценарии |
| [`docs/Architecture.md`](docs/Architecture.md) · [`docs/Pseudocode.md`](docs/Pseudocode.md) · [`docs/ADR.md`](docs/ADR.md) | где живёт код, как работает, почему так |
| [`docs/validation/07-final-gate.md`](docs/validation/07-final-gate.md) | вердикт Phase 2: 🟢 READY ≈89.4/100 |
| [`decisions/README.md`](decisions/README.md) | журнал развилок D-001…D-010 |
| [`docs/features/`](docs/features/) | SPARC-планы и квитанции фич после MVP |
| [`docs/yookassa-setup.md`](docs/yookassa-setup.md) | подключение магазина ЮKassa |
| [`docs/n3-integration-architecture.md`](docs/n3-integration-architecture.md) | мост к партнёрской платформе N3 |
| [`docs/features/agent-purchase/public-pilot.md`](docs/features/agent-purchase/public-pilot.md) | пилот агентных покупок: демонстрация и границы |
| [`docs/demo-script.md`](docs/demo-script.md) | прогонный лист демонстрации на стенде |
| [`LESSON-01.md`](LESSON-01.md) | тезисы занятия |

## Структура

```
01-testimonials-senja/
├── README.md, CLAUDE.md, DEVELOPMENT_GUIDE.md, LESSON-01.md
├── docker-compose.yml, Caddyfile, compose.*.yml   # основной стек, демо, тесты, мост N3, пилот агентов
├── apps/web/            # Next.js: форма, стена, кабинет, API, оплата
├── apps/widget/         # встраиваемый виджет (Shadow DOM)
├── services/transcribe/ # единственная точка к OpenAI STT
├── services/worker/     # очередь расшифровки, очистка, сверка платежей
├── services/agent-api/  # шлюз MCP / A2A для агентных покупок
├── packages/db/         # 20 SQL-миграций, роли, RLS
├── packages/agent-payments/  # модуль агентных платежей
├── tests/               # E2E агентных покупок и пилота
├── scripts/             # проверки портов, сборки compose, проброса переменных, CJM
├── decisions/           # журнал развилок D-001…D-010
└── docs/                # SPARC, discovery, validation, features, plans, telemetry
```

## Статус на 2026-09-10

Дата — последний коммит в папке проекта. Phase 0–4 и `/start` выполнены; 20 из 25 записей roadmap
`done`. Последний записанный интегрированный прогон — 1016/1016 ([агентные покупки](docs/features/agent-purchase/05_completion.md)).

**Документы расходятся — сторона здесь не выбрана:**

| О чём | Одно | Другое |
|---|---|---|
| Цена тарифа (DEC-001) | roadmap: `blocked`; [`docs/yookassa-setup.md`](docs/yookassa-setup.md) (строки 65–69): «цена не назначена» | [`.env.example`](.env.example) (строка 66) и [отчёт оплаты](docs/features/paid-tier-checkout/02-completion.md): «DEC-001 закрыт 2026-09-02, 990 ₽» |
| FR-015 восстановление пароля | roadmap: `planned`; [квитанция](docs/features/fr-015-password-reset/05_completion.md) пустая | в истории коммиты `feat(fr-015)` и `fix(fr-015)`, миграция `014_password_reset.sql` |
| Число фич | [`CLAUDE.md`](CLAUDE.md): «12 фич MVP» | прежний README: 13; roadmap: 25 записей |
| CSV-импорт | DEC-003 (приоритет CSV) `blocked` | FR-014 CSV `done` |
| FR-016 Yandex ID | roadmap: `done` | в [квитанции](docs/features/fr-016-yandex-id/05_completion.md) пункты готовности не отмечены (таблица мутаций 13/13 заполнена) |
| Состав roadmap | нет записей про оплату-срок, площадки, потолок расхода, агентные покупки, мост N3 | код или планы по ним есть |

## Что осталось

- **FR-015: время ответа `forgot` выдаёт, существует ли адрес** — письмо ждётся внутри ответа (до 8 с) только при выпущенном токене (находка при планировании F3 в N3 по чтению `apps/web/src/app/api/auth/forgot/route.ts`, 28.09; в N3 тот же дефект). Лечение: отправка в фоне + тест с провайдером, который никогда не отвечает. Требует подтверждения прогоном.

- **FR-015** — квитанция пустая, живая отправка письма через Resend для сброса пароля не проверена;
  на стенде `/forgot` отказывает при ненастроенной почте ([квитанция](docs/features/fr-015-password-reset/05_completion.md)).
- **Потолок расхода на модель** — только план; ждёт решений DEC-SPEND-1…3, до этого приём видео
  выключен ([спецификация](docs/features/model-spend-ceiling/01_specification.md), [DoD](docs/features/model-spend-ceiling/05_completion.md)).
- **Отзыв с площадки** — код есть, DoD не закрыт; ждёт DEC-PROOF-1…2 ([DoD](docs/features/platform-proof/05_completion.md)).
- **Агентные покупки** — N3 на пилоте выключен, webhook TEST-магазина для пилота не настроен, ключ
  агента живёт 24 часа, в прод не выпущено ([пилот](docs/features/agent-purchase/public-pilot.md)).
- **Мост N3** — реальная доставка письма и покупка/возврат в TEST-магазине не выполнялись
  ([квитанция](docs/features/n3-affiliate-bridge/05_completion.md)).
- **Превью-домены** (`*.vercel.app` и подобные) засчитываются как установки — вопрос владельцу
  ([план FR-013](docs/plans/fr-013-external-domain.md)).
- **Решения владельца:** DEC-001…004 ([roadmap](.claude/feature-roadmap.json)); лимит free-тарифа по
  числу отзывов и домен Wall of Love — поддомен или CNAME ([`CLAUDE.md`](CLAUDE.md), DEVELOPMENT_GUIDE §6).
  Магазин ЮKassa тестовый, боевой режим включает владелец.

**Принятые риски:**

- сессии: список активных сессий не показывается, отзыв не мгновенен для открытой страницы
  ([FR-010](docs/features/fr-010-password-change/05_completion.md), риски 2–3);
- перебор пароля с ротацией IP ограничен только грубым счётчиком по IP
  ([FR-009](docs/features/fr-009-login/05_completion.md), риск 3; [FR-010](docs/features/fr-010-password-change/05_completion.md), риск 6);
- Yandex ID: соответствие 149-ФЗ — консенсус, а не гарантия; учётка с паролем при первом входе
  Яндексом получает отказ; учётка через SSO без Яндекса недоступна
  ([FR-016](docs/features/fr-016-yandex-id/05_completion.md), риски 1–3).
