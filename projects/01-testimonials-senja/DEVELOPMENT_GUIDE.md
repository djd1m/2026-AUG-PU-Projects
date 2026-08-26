# Development Guide — Proofwall

Пошаговый цикл разработки MVP-недели. Контекст продукта, стек и non-negotiable ограничения —
в `CLAUDE.md`. Алгоритмы — `docs/Pseudocode.md`, схема данных и compose — `docs/Architecture.md`.

## 0. Открыть проект правильно (решение D-006)

Репозиторий содержит 8 проектов; корневой `.claude/` — общий пайплайн. Работать над Proofwall
нужно **из этой директории**, не из корня репозитория:

```bash
cd projects/01-testimonials-senja
claude
```

## 1. Поднять окружение

Стек — Docker Compose, все сервисы свои (Architecture §7, §9 — без managed BaaS):

```bash
cp .env.example .env        # заполнить DATABASE_URL, SESSION_SECRET, S3_*, PAYMENT_WEBHOOK_SECRET, OPENAI_API_KEY
docker compose up -d postgres minio
docker compose run --rm web npm run db:migrate   # packages/db миграции
docker compose up -d
```

`depends_on: condition: service_healthy` на `postgres`/`minio` (Architecture §7, W-4) — `web`/
`worker` не стартуют, пока БД и хранилище не отвечают health-check. `transcribe` не имеет
health-check на этой неделе (`condition: service_started`).

Проверить, что всё поднялось:

```bash
docker compose ps
curl -f http://localhost:3000/api/widget/config?slug=test   # ожидается 404/пустой ответ, не 5xx
```

## 2. Порядок реализации фич

Роадмап — `.claude/feature-roadmap.json`, 12 фич упорядочены по риску growth loop, не по номеру
FR. Начинать с `status: "next"` (`FR-001`), дальше — по `depends_on`. Для каждой фичи:

```
/next                 # покажет верхнюю фичу по приоритету/статусу
/plan <feature-id>     # для фич ≤3 файлов
/feature <feature-id>  # для фич ≥4 файлов (полный цикл PLAN → VALIDATE → IMPLEMENT → REVIEW)
```

Перед стартом любой фичи прочитать одновременно (не по одному, см. `CLAUDE.md` «Карта
документов»): `docs/Specification.md` (FR + Gherkin), `docs/Architecture.md` §10 (канон имён),
`docs/Pseudocode.md` (алгоритм), соответствующий ADR в `docs/ADR.md`.

## 3. Как проверять во время разработки

```bash
docker compose -f compose.test.yml up -d postgres   # тестовая Postgres-схема
npm run test:unit           # resolveAttribution, recomputeContentThreshold, ALLOWED_TRANSITIONS
npm run test:integration    # submitTestimonial, moderateTestimonial, apiWidgetConfig, onPaymentWebhook
npm run test:e2e            # форма → модерация → стена → виджет на внешней фикстуре
npm run build:widget && gzip -9 -c apps/widget/dist/widget.js | wc -c   # ≤30 KB gzip — CI-гейт
```

Порядок тестирования по риску (не по номеру FR) — `.claude/rules/testing.md` §1: сначала
мульти-арендная изоляция и XSS, затем идемпотентность вебхука, затем badge/тариф на сервере,
затем гонка на `widget_installs` (метрика недели), затем остальные growth-механики.

Перед каждым PR — прогнать проверку известных пробелов пайплайна и код-ревью чек-лист из
`.claude/agents/code-reviewer.md` (4 неявных `@security`-соответствия):

```bash
bash ../../scripts/check-pipeline-gaps.sh .
```

## 4. Definition of Done недели (Completion.md)

MVP done, когда одновременно:
1. `FR-001`…`FR-007` реализованы и проходят acceptance criteria из `docs/Specification.md`.
2. Метрика недели (виджеты на внешних доменах) **вычисляется** из события `widget_installed`,
   не подсчитывается вручную.

Ни один `FR-GROWTH-00N` не засчитывается частично — тесты без инструментированной метрики не
закрывают Definition of Done (`docs/Completion.md` §3, `.claude/rules/testing.md` §9).

Growth-события, обязательные с первого релиза (постфактум не восстанавливаются):
`invite_shown`, `invite_sent`, `badge_impression`, `badge_click`, `signup_from_badge`,
`widget_installed`, `referral_attributed`.

## 5. Деплой на VPS

```bash
# CI (GitHub Actions): build образов → миграции packages/db → по SSH на VPS:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

- Домен должен резолвиться на VPS **до** первого деплоя — иначе первая ACME-попытка Caddy
  (ADR-007) провалится и уйдёт в backoff до следующей проверки DNS.
- Smoke-проверка после `up -d`, до объявления деплоя успешным: `curl -I
  https://<домен>/api/widget/config` должен отдать `200` с валидной TLS-цепочкой.
- Откат — предыдущий tag образа из registry, `docker compose up -d` с прошлым тегом. Данные не
  откатываются вместе с образом.
- Секреты — через CI secrets в `.env` на сервере, никогда не коммитятся.
- Бэкапы (Architecture §7): `pg_dump` по расписанию для Postgres, `mc mirror` для `minio_data`,
  синхронизировать по времени — рассинхрон создаёт «битые» ссылки `video_object_key` после restore.
  `caddy_data` не бэкапить — переиздаётся автоматически.

## 6. Открытые решения владельца продукта до релиза

Не блокируют начало разработки (`docs/validation/07-final-gate.md` §5), но должны быть закрыты
до подписания Completion.md: цена платного тарифа, лимит free-тарифа по числу отзывов, домен
Wall of Love (поддомен vs CNAME), выбор платёжного провайдера, ставка комиссии партнёра по
умолчанию (блокирует конкретно реализацию `FR-GROWTH-002`, не старт остальной разработки).

## 7. Куда смотреть при затруднении

| Вопрос | Файл |
|---|---|
| «Почему тут именно так?» | `docs/ADR.md` + `.claude/agents/architect.md` |
| «Что считается выполненным?» | `docs/Specification.md` (Gherkin-сценарии) |
| «Какое имя таблицы/поля/пути канонично?» | `docs/Architecture.md` §10 |
| «Как это протестировать (гонка/XSS/виджет на чужом домене)?» | `docs/Refinement.md` + `.claude/rules/testing.md` |
| «Что уже проверено на валидации?» | `docs/validation/07-final-gate.md` |
