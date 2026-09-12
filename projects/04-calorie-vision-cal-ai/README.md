# 04. ИИ-трекер калорий по фото

> **Неделя 04** · `vision` · референс: **[Cal AI](https://www.calai.app/) — 15M загрузок, ~$30M годовой выручки менее чем за 2 года**

## Простыми словами

**Проблема.** Считать калории полезно, но невыносимо скучно: найти блюдо в справочнике, угадать
вес, вбить вручную. Через неделю почти все бросают.

**Что делает продукт.** Вы фотографируете тарелку. Через пару секунд видите, что это за блюдо,
сколько в нём калорий, белков, жиров и углеводов. Если система ошиблась — поправляете руками,
это занимает секунду.

**Зачем это людям.** Тем, кто худеет, набирает массу или следит за здоровьем, нужен не идеальный
подсчёт, а привычка. Когда учёт занимает три секунды вместо трёх минут, привычка выживает.

**Одна честная деталь.** Цифры берутся из справочника продуктов, а не выдумываются на ходу —
и видно, откуда взялось число. Иначе получился бы генератор правдоподобных цифр, а не трекер.

**Как этим пользуются.** Сфотографировал завтрак → увидел цифры → поправил порцию, если нужно →
к вечеру видишь, сколько съел за день.

## Что делаем

Аналог Cal AI: фото еды → калории и БЖУ за секунды. Мультимодель + RAG на открытых базах калорий.

**Целевой стек:** мультимодальная модель + RAG на открытых базах калорий

## Механики роста (обязательный блок)

Главный продукт — не прототип, а **рост**: аудитория и выручка. В требования закладываем на этапе дизайна, а не после.

| Драйвер | Гипотеза для этого проекта |
|---|---|
| **Виральность** | Результат распознавания — готовая карточка для шеринга в соцсети. Прогресс/стрики и челленджи с друзьями. Cal AI вырос на TikTok-контенте — контент-loop встроен в продукт. |
| **Партнёрка** | _заполняется по итогам `/research/GROWTH-MECHANICS-REQUIREMENTS.md`_ |
| **Блогеры / люди с аудиторией** | _заполняется по итогам `/research/GROWTH-MECHANICS-REQUIREMENTS.md`_ |

> Обязательный блок требований по росту: [`/research/GROWTH-MECHANICS-REQUIREMENTS.md`](../../research/GROWTH-MECHANICS-REQUIREMENTS.md)

## Структура

```
04-calorie-vision-cal-ai/
├── README.md              # этот файл
├── CLAUDE.md              # контекст проекта для агентов
├── DEVELOPMENT_GUIDE.md   # порядок работы над фичей, проверки, телеметрия
├── docker-compose.yml     # скелет стека Phase 4: db, storage + профили app/edge/test
├── Dockerfile             # multi-stage монорепо, цели api/recognizer/web
├── .env.example           # имена переменных; порты правятся под машину
├── .claude/
│   ├── agents/            # planner, architect, code-reviewer
│   ├── rules/             # security, coding-style, testing, secrets-management
│   ├── skills/            # project-context, coding-standards, security-patterns, feature-navigator
│   └── feature-roadmap.json  # 8 MVP-фич в порядке зависимостей
└── docs/
    ├── product-discovery-brief.md   # Phase 0 — бриф с Growth Requirements Seed и манифестом
    ├── source-product-profile.md    # Phase 0.5 — облик источника (FR-LOOK-*)
    ├── CJM_Variants.md              # четыре варианта CJM, выбор делает владелец
    ├── prototypes/cjm/              # кликабельный HTML-прототип (index.html, variant-a..d.html)
    ├── discovery/research/          # квитанции исследования (факты, рынок/данные, тренды/рост)
    ├── discovery/screenshots/       # доказательства съёмки источника
    ├── telemetry/p-replicator/      # паспорт, журнал прогона и квитанции агентов
    ├── toolkit-map.md               # Phase 3 — что наследуется из корня, что сгенерировано здесь
    ├── canon.md                     # замороженный источник имён и чисел
    └── Specification.md, Architecture.md, Pseudocode.md, ADR.md, Refinement.md, Completion.md
```

## Статус

| Этап | Статус |
|---|---|
| Phase 0 — Product Discovery | ✅ 2026-09-12 — [бриф](docs/product-discovery-brief.md), [4 CJM](docs/CJM_Variants.md), [прототип](docs/prototypes/cjm/index.html); **выбран гибрид E = A + блок D** ([разбор](docs/discovery/business-model-and-cjm-analysis.md)) |
| Phase 0.5 — Source Product Profile | ✅ 2026-09-12 — [профиль облика](docs/source-product-profile.md), обе оси СНЯТ (публичный веб) |
| Phase 1 — SPARC (`/replicate`) | ✅ 2026-09-12 — [Specification](docs/Specification.md), [Architecture](docs/Architecture.md), [Pseudocode](docs/Pseudocode.md), [ADR](docs/ADR.md) (10 решений), [Refinement](docs/Refinement.md), [Completion](docs/Completion.md); канон заморожен |
| Phase 2 — Validation | ✅ 2026-09-12 — [отчёт](docs/validation-report.md), два раунда исправлений; принятые без владельца решения — [журнал](docs/decisions-autonomous.md) |
| Phase 3 — Toolkit | ✅ 2026-09-12 — 3 агента, 4 правила, 4 навыка, [роадмап](.claude/feature-roadmap.json) на 8 фич, [карта инструментов](docs/toolkit-map.md) |
| Phase 4 — Finalize | ✅ 2026-09-12 — скаффолды: `docker-compose.yml`, `Dockerfile`, `.env.example`, [руководство разработчика](DEVELOPMENT_GUIDE.md). Проверены `docker compose config` и двумя проверками портов; **сборкой не проверены — собирать нечего** |
| Реализация | ⬜ не начиналась: нет `package.json` монорепо, исходников, миграций и ни одного теста |

## Как запустить

Сначала проверки, потом `up`: docker называет один конфликтующий порт за прогон, и часть стека к
этому моменту уже поднята.

```bash
cd projects/04-calorie-vision-cal-ai
cp .env.example .env                              # заполнить значения; .env в git не попадает
node ../../.claude/hooks/check-ports.cjs .        # хранилища наружу не смотрят (Правило №0)
bash ../../scripts/check-port-conflicts.sh .      # свободны ли выбранные порты этой машины
docker compose up -d                              # сейчас поднимутся только db и storage
```

Сервисы `api`, `recognizer` и `web` собраны в профиль `app` и до фичи `foundation` не соберутся:
исходников нет. Наружу стек смотрит ровно одним портом — `127.0.0.1:4180` у Caddy в профиле `edge`;
`db` и `storage` не публикуют портов вовсе, а у `web` хостового порта нет намеренно (публикация
рядом с прокси позволяет его обойти вместе с ограничением частоты, которое он держит).
