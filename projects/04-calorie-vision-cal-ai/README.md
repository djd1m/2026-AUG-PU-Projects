# 04. ИИ-трекер калорий по фото — «Тарелка»

> **Неделя 04** · `vision` · референс: **[Cal AI](https://www.calai.app/) — 15M загрузок, ~$30M годовой выручки менее чем за 2 года**
> Стенд: **https://tarelka.aicoding.space**

## Простыми словами

**Проблема.** Считать калории полезно, но скучно: найти блюдо в справочнике, угадать вес, вбить
руками. Через неделю почти все бросают.

**Что делает продукт.** Вы фотографируете тарелку. Через несколько секунд видите состав блюда,
калории, белки, жиры и углеводы. Если система ошиблась с порцией — поправляете её.

**Зачем это людям.** Тем, кто худеет, набирает массу или следит за здоровьем, нужен не идеальный
подсчёт, а привычка. Учёт за три секунды вместо трёх минут эту привычку сохраняет.

**Одна честная деталь.** Модель называет только ингредиенты и порцию — калории и БЖУ она не
сочиняет. Числа берутся из открытой базы USDA FoodData Central, и рядом с каждым видно, откуда
оно: запись базы, её идентификатор, порция в граммах. Иначе это был бы генератор правдоподобных
цифр, а не трекер.

**Как этим пользуются.** Открыл ссылку → снял завтрак без регистрации → увидел цифры и источник →
поправил порцию → к вечеру видишь итог дня. Упёрся в бесплатный лимит — можно оформить Pro.

## Что делаем

Аналог Cal AI для России и СНГ: фото еды → калории и БЖУ за секунды. Один Next.js-фронт работает
как PWA и как Telegram Mini App. **PWA — первый приоритет, Telegram — вторая очередь** (решение
владельца OWN-012): основной вход — почта с паролем, вход через Telegram — второй способ.

**Стек:** Next.js 15 (`web`), Node 22 + Fastify (`api`), воркер распознавания (`recognizer`),
PostgreSQL 16 + `pg_trgm` (данные, очередь заданий, нечёткий поиск), MinIO (приватные фото),
Caddy (единственная публичная дверь). Модель — Claude Haiku 4.5, при уверенности ниже 0,6 —
эскалация к Claude Sonnet 5. База — USDA FoodData Central (CC0) плюс ручные русские синонимы
блюд в `food_synonym`.

## Механики роста (обязательный блок)

Главный продукт — не прототип, а **рост**: аудитория и выручка. В требования закладываем на этапе дизайна, а не после.

| Драйвер | Гипотеза | Как реализовано |
|---|---|---|
| **Виральность** | Результат распознавания — готовая карточка для сторис; Cal AI вырос на TikTok-контенте | Карточка 9:16 с составом блюда и бейджем «распознано в Тарелке» (матовое стекло в верхней безопасной зоне сторис, OWN-013), публичная ссылка `/c/…`; бейдж снимается на Pro. Мягкий стрик в дневнике. События воронки пишутся в базу (фича `share-card-and-growth-events`) |
| **Партнёрка** | Блогер получает долю с каждой подписки по своему коду | Коды блогеров, атрибуция (ссылка — слабый источник, введённый руками код — сильный, ADR-008), анти-фрод: привязка засчитывается только после первого успешного распознавания, всплеск применений кода блокирует его. Комиссия **50 % бессрочно** от суммы после удержания провайдера (OWN-003, OWN-009), выдержка 14 суток, выплаты 5-го числа (OWN-011) |
| **Блогеры / люди с аудиторией** | Блогер публикует ссылку в канале, аудитория приходит по ней | Ссылка `/r/{КОД}` и поле «есть промокод» на `/pro`; владелец заводит партнёра и шлёт одноразовое приглашение из кабинета; кабинет партнёра: «к выплате 5-го», воронка по коду, лента движений, выгрузка CSV, реквизиты СБП, уведомления о начислениях (в кабинете и в Telegram). Путь целиком — [`docs/operations/partner-journey.md`](docs/operations/partner-journey.md) |

> Обязательный блок требований по росту: [`/research/GROWTH-MECHANICS-REQUIREMENTS.md`](../../research/GROWTH-MECHANICS-REQUIREMENTS.md)

## Что построено

Все 11 фич роадмапа — `done` ([`.claude/feature-roadmap.json`](.claude/feature-roadmap.json)):

| # | Фича | Что даёт |
|---|---|---|
| 1 | `foundation` | монорепо, контейнеры, схема БД, анонимная сессия устройства |
| 2 | `scan-pipeline` | приём фото, три потолка расхода (на пользователя, на сутки, на эскалацию), очередь, вызов модели |
| 3 | `source-and-correct` | расчёт чисел из базы USDA, синонимы, видимый источник, правка порции |
| 4 | `consent-and-telegram-auth` | согласие до первой записи в дневник, удаление данных, вход через Telegram |
| 5 | `diary-and-streak` | дневник дня, итоги, мягкий стрик |
| 6 | `share-card-and-growth-events` | карточка 9:16, бейдж, события воронки |
| 7 | `partner-codes-and-cabinet` | коды блогеров, атрибуция, анти-фрод, кабинет партнёра |
| 8 | `pro-interest-and-limits-ui` | экран лимита и лист ожидания Pro |
| 9 | `subscription-and-commission` | подписка Pro 1000 ₽/мес через ЮKassa, комиссия партнёру, кабинет владельца |
| 10 | `partner-links-and-admin` | ссылка блогера `/r/{КОД}`, заведение партнёра в кабинете |
| 11 | `partner-notifications-and-payouts` | уведомления партнёру, выгрузка движений, реквизиты и реестр к выплате |

**Числа на стенде** ([`partner-journey.md`](docs/operations/partner-journey.md) §«Числа»): бесплатно
20 распознаваний в сутки, Pro — 100; цена и потолки задаются окружением, ненастроенный потолок
валит старт процесса (ADR-007).

**Путь блогера пройден в браузере на стенде 17.09.2026** на тестовом магазине ЮKassa: переход по
`/r/DEMOBLOG` → распознавание → регистрация → оплата тестовой картой (1000 ₽, удержание 42,70 ₽)
→ подписка `active` → начисление партнёру 478,65 ₽ → кабинет партнёра. Обе роли играл владелец.

**Проверки:** 526 unit-тестов и стражей (28.09), 344 интеграционных на настоящем PostgreSQL (на 17.09.2026,
[`partner-notifications-and-payouts/05_completion.md`](docs/features/partner-notifications-and-payouts/05_completion.md)).
У каждой фичи — квитанция `docs/features/<slug>/05_completion.md`: что проверено и чем, что фича
НЕ доказывает, какие стражи испытаны внедрённым дефектом.

## Как запустить

Сначала проверки портов, потом `up`: docker называет один конфликтующий порт за прогон, и часть
стека к этому моменту уже поднята.

```bash
cd projects/04-calorie-vision-cal-ai
cp .env.example .env                              # заполнить секреты и потолки; .env в git не попадает
node ../../.claude/hooks/check-ports.cjs .        # хранилища наружу не смотрят (Правило №0)
bash ../../scripts/check-port-conflicts.sh .      # свободны ли выбранные порты этой машины
bash scripts/check-env-wiring.sh                  # каждая читаемая кодом переменная доезжает до сервиса

npm test                                          # unit + стражи
docker compose --project-directory . --profile test run --rm test   # интеграционные на PostgreSQL
npm run import:fdc                                # разовый импорт USDA (docs/operations/import-fdc.md)
```

Compose запускать **с `--project-directory .`** из каталога проекта. Наружу стек смотрит одним
портом — `127.0.0.1:${N4_EDGE_PORT:-4180}` у Caddy в профиле `edge`; `db` и `storage` портов не
публикуют, у `web` хостового порта нет намеренно (иначе прокси и его ограничение частоты
обходятся). Без ключей ЮKassa платежи работают на детерминированном фейке и журнал `api` пишет
`payments_mode: fake` — такой прогон не является проверкой приёма денег.

## Документация

| Файл | О чём |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | контекст проекта, инварианты, порядок чтения |
| [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) | цикл разработки, проверки, эксперимент EXP-N4-001 |
| [`docs/canon.md`](docs/canon.md) | источник имён и чисел (заморожен 2026-09-12) |
| [`docs/PRD.md`](docs/PRD.md), [`docs/Specification.md`](docs/Specification.md) | что строить: FR, NFR, истории, приёмка |
| [`docs/Architecture.md`](docs/Architecture.md), [`docs/ADR.md`](docs/ADR.md) | устройство системы и архитектурные решения |
| [`docs/Refinement.md`](docs/Refinement.md), [`docs/Completion.md`](docs/Completion.md) | edge cases и тесты; план выпуска (DoD не отмечен) |
| [`docs/validation-report.md`](docs/validation-report.md) | Phase 2: вердикт 🟡 CAVEATS |
| [`docs/decisions-owner.md`](docs/decisions-owner.md) | решения владельца OWN-001…013 и поправки к канону |
| [`docs/decisions-autonomous.md`](docs/decisions-autonomous.md) | 63 решения агента DEC-A-001…063, ждут подтверждения владельца |
| [`docs/operations/partner-journey.md`](docs/operations/partner-journey.md) | путь блогера от предложения до выплаты |
| [`docs/operations/functional-verification.md`](docs/operations/functional-verification.md) | сценарий проверки по адресам стенда |
| [`docs/operations/share-card-badge-research.md`](docs/operations/share-card-badge-research.md) | почему бейдж карточки выглядит так |
| [`docs/model-cost-contract.md`](docs/model-cost-contract.md), [`docs/long-job-contract.md`](docs/long-job-contract.md), [`docs/webhook-contract.md`](docs/webhook-contract.md) | потолки расхода модели, три состояния распознавания, вебхук оплаты |
| [`docs/product-discovery-brief.md`](docs/product-discovery-brief.md), [`docs/CJM_Variants.md`](docs/CJM_Variants.md), [`docs/source-product-profile.md`](docs/source-product-profile.md) | Phase 0 / 0.5: бриф, варианты CJM, облик источника |
| [`docs/toolkit-map.md`](docs/toolkit-map.md) | проектный toolkit и чего в нём сознательно нет |

## Структура

```
04-calorie-vision-cal-ai/
├── README.md, CLAUDE.md, DEVELOPMENT_GUIDE.md
├── docker-compose.yml, Dockerfile, Caddyfile, proxy/   # 6 сервисов + служебный test; профили edge/test
├── .env.example                                        # имена переменных; порты правятся под машину
├── .claude/                                            # агенты, правила, навыки, роадмап 11 фич
├── apps/api, apps/recognizer, apps/web                 # API, воркер распознавания, фронт PWA/Mini App
├── packages/db, packages/shared                        # миграции и общие типы
├── tests/                                              # unit, guard, contract, integration, concurrency, performance
├── scripts/                                            # проброс переменных, импорт USDA, синонимы, судья
├── ops/                                                # блок конфигурации общего прокси машины
└── docs/
    ├── discovery/, prototypes/cjm/                     # Phase 0: исследование, кликабельный CJM
    ├── features/<slug>/                                # 11 фич: план, ревью, квитанция 05_completion.md
    ├── operations/                                     # путь партнёра, проверка стенда, импорт USDA
    ├── telemetry/                                      # журналы прогонов p-replicator
    └── canon.md, PRD.md, Specification.md, Architecture.md, ADR.md, Refinement.md, Completion.md
```

## Статус на 18.09.2026

Дата — последний коммит проекта (`1c4ceab`, починка уборки, удалявшей карточки «поделиться»,
DEC-A-063).

| Этап | Статус |
|---|---|
| Phase 0 / 0.5 | ✅ 12.09.2026 — бриф, 4 варианта CJM, облик источника |
| Phase 1 — SPARC | ✅ 12.09.2026; канон заморожен, поправки — в `decisions-owner.md` |
| Phase 2 — Validation | ✅ 🟡 CAVEATS |
| Phase 3–4 — Toolkit, скаффолды | ✅ 12.09.2026; образы `api`, `web`, `recognizer` собраны и работают на стенде |
| Реализация | ✅ 11 из 11 фич `done` (17.09.2026) |
| Стенд | ✅ `https://tarelka.aicoding.space`; платежи — тестовый магазин ЮKassa |
| Приём настоящих денег | ⬜ нет ИП и живых ключей (OWN-007) |

**Расхождения в документах проекта (не исправлены, названы):**
- прежний README утверждал «Реализация ⬜ не начиналась» и «роадмап на 8 фич» — в роадмапе 11 фич, все `done`;
- `CLAUDE.md:16` — «все девять фич роадмапа `done`», а `CLAUDE.md:156-160` того же файла — одиннадцать;
- `docs/Completion.md:3` — «ни один сервис не развёрнут, код не написан»: шапка плана не обновлена после выкладки;
- `docs/operations/partner-journey.md:205-218` — путь «пройден целиком 17.09», а `:233-236` —
  «путь „переход → скан → оплата → начисление“ целиком ещё не пройден ни разу». Первое — на
  тестовых деньгах, второе написано до этого прогона и не обновлено; на живых деньгах путь
  действительно не пройден;
- OWN-008 (`decisions-owner.md:21`) — бесплатный потолок 10, на стенде окружением задано 20.

## Что осталось

- **`scripts/create-test-database.sh` зовёт `docker compose exec db` без имени проекта** — при пустом окружении команда попадёт в стенд `n4-tarelka`, а не в тестовый стек; добавить обязательный `-p`/проверку проекта (находка 28.09 при прогоне RV-04/06, `docs/features/share-card-and-growth-events/09_review_codex_rv.md`).

**Деньги и подписка**
- Фискальный чек 54-ФЗ провайдеру не передаётся — нужен до первого живого платежа физлицу
  ([`subscription-and-commission/05_completion.md:37`](docs/features/subscription-and-commission/05_completion.md), `:96`).
- Форма интереса «Pro скоро» на экране лимита ещё стоит — снимается вместе с живым режимом (`:93-95`, OWN-001).
- Пороги анти-фрода рассчитаны для мира без денег — пересчитать по реальному трафику (`:97-98`).
- Второй провайдер CloudPayments не подключён, архитектура готова (`:99`, OWN-010).

**Выплаты партнёрам**
- Автоматической отправки денег нет: нужен договор на выплаты, ИП и решение о налоговом статусе
  партнёров (DEC-A-062, [`partner-notifications-and-payouts/05_completion.md:46-48`](docs/features/partner-notifications-and-payouts/05_completion.md)); сейчас владелец платит вручную по реестру CSV.
- Реестр к выплате не помечает выплаченное (`:72`); нет отметки «прочитано» по одному уведомлению (`:71`).

**Отложенные находки ревью (MEDIUM)**
- RV-share-card-and-growth-events-04 и -06: мутационное испытание проверяет функцию-дублёр, а не
  настоящий `buildCardPayload`; плановые файлы тестов не разделены
  ([`share-card-and-growth-events/05_completion.md:161-173`](docs/features/share-card-and-growth-events/05_completion.md)).

**Выпуск**
- Релизный DoD [`docs/Completion.md:10-33`](docs/Completion.md) не отмечен ни одним пунктом.

**Нужно от владельца**
- ИП и договор эквайринга с ЮKassa (OWN-007); живые ключи и `N4_PAYMENTS_MODE=live` в `.env`;
  свой `telegram_user_id` в списке владельцев
  ([`subscription-and-commission/05_completion.md:103-110`](docs/features/subscription-and-commission/05_completion.md)).
- Подтвердить или отменить 63 автономных решения DEC-A-001…063 ([`decisions-autonomous.md`](docs/decisions-autonomous.md)).

**Не проверено**
- Живой приём денег: сети ЮKassa, формат `income_amount`, чарджбэк (`subscription-and-commission/05_completion.md:29-39`).
- Путь «переход → скан → оплата → начисление» на живых деньгах и с живым блогером
  (`partner-journey.md:233-236`, `partner-links-and-admin/05_completion.md:37-46`).
- Вход через Telegram живьём — нет настоящего `initData` ([`consent-and-telegram-auth/05_completion.md:356-360`](docs/features/consent-and-telegram-auth/05_completion.md)).
- Доставка уведомлений в Telegram до настоящего человека (`partner-notifications-and-payouts/05_completion.md:39-42`).
- Двухуровневая частота 30/120 в минуту под реальной нагрузкой ([`scan-pipeline/05_completion.md:102-103`](docs/features/scan-pipeline/05_completion.md)).
- Гонка «правка порции в момент, когда воркер дописывает результат» — управляемым тестом не
  оркестрована ([`source-and-correct/05_completion.md:154-157`](docs/features/source-and-correct/05_completion.md)).
- Конфигурация общего прокси загружена из `/tmp/Caddyfile.current`, примонтированный файл устарел:
  перезапуск контейнера уронит домены N3 и N4 — пересоздание прокси за владельцем (DEC-A-044,
  `decisions-autonomous.md:52`).
