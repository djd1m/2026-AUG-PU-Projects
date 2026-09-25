# DEVELOPMENT_GUIDE — N6 «Суфлёр»

Как вести разработку N6 от пустого монорепо до стенда. Контекст и инварианты — [`CLAUDE.md`](CLAUDE.md);
карта инструментов — [`docs/toolkit-map.md`](docs/toolkit-map.md); порядок фич —
[`.claude/feature-roadmap.json`](.claude/feature-roadmap.json).

## 0. Состояние на 25.09.2026

Документы Phase 0–2 и toolkit Phase 3 готовы; кода нет. `docker-compose.yml`, `Dockerfile`,
`proxy/`, `.env.example` — скаффолды: проверены `docker compose config`, `check-ports.cjs` (`0`) и
`check-port-conflicts.sh` (`0`), но **не сборкой**. Предсказанный риск тот же, что в проектах 01 и 05:
логика `Dockerfile` без прогона сборки оказывалась реальными дефектами. Первое дело фичи
`foundation` — `docker compose build`.

## 1. Подготовка машины

```bash
cp .env.example .env && chmod 600 .env          # заполнить секреты: openssl rand -hex 24 / -hex 32
bash ../../scripts/check-port-conflicts.sh projects/06-rag-sales-chatbase   # → 0 (порт 8086 по умолчанию)
node ../../.claude/hooks/check-ports.cjs .      # → 0; без .env честно отвечает 2 («не выполнена»)
```

Ключ OpenRouter — СВОЙ для N6 (сеть проверена пробой A-N6-019 ключом стенда N5). Передаёт владелец
на машину сам; агент ключ не печатает.

## 2. Цикл одной фичи

```
/next → выбрать фичу из роадмапа
  → bash ../../scripts/complexity-router.sh <файлы>     # 1 = L/XL: план к владельцу; 2 = не выполнено
  → /go <фича>  (или /feature для 4+ файлов, /plan для ≤ 3)
       PLAN      — planner: FR/SC/ADR, строки reuse, порядок операций
       VALIDATE  — requirements-validator, Phase 2 не пропускается
       IMPLEMENT — код Opus 5.5; один писатель на файл; квитанции WORK_UNIT_ID/TRACE_PATH
       REVIEW    — code-reviewer (Sonnet 5), не автор кода
  → квитанция docs/features/<slug>/05_completion.md
  → /next <id>  (отметить done, разблокировать зависимые)
```

Квитанция фичи обязана содержать: ответ по каждой строке `reuse` (`перенесено | адаптировано (что) |
написано заново (почему)`); для каждого тронутого стража — `дефект возвращён → N failed | M passed`
и `код восстановлен → K passed`; что НЕ доказано; фактическую модель исполнителя и ревьюера.

## 3. Порядок фич и где XL

`foundation` → `quota-and-spend` (**XL**, деньги) → `index-job-core` → `crawler` → `pdf-source` →
`chunk-embed` → `rag-answer` (**XL**, главный инвариант) → `design-shell` → `preview-flow` →
`bot-cabinet` → `widget-runtime-and-badge` → `visitor-ask-and-limits` (**XL**, платный вызов
посторонним) → `public-page-and-summary` → `tariffs-and-interest` → `partner-and-studio` →
`source-lifecycle` (Should) → `account-erasure`. На XL — остановка на плане у владельца; в
автономном режиме решение пишется в `docs/decisions-autonomous.md` (A-N6-021 и далее), необратимое
не делается.

Рекомендация из отчёта валидации §9: до `quota-and-spend` — повторный независимый проход
валидатора по правкам H1/M2 (канон §7, Pseudocode квот).

## 4. Проверки — какие и когда

| Когда | Команда | Ожидается |
|---|---|---|
| каждый коммит | `npm test`, `npm run lint` | зелёные; все наборы, не только свой |
| после миграции | интеграционный набор на `compose.test.yml` (`name: n6-test`) с `--build` | зелёный на настоящем Postgres + pgvector |
| фичи с квотой/задачей | конкурентные прогоны `.claude/rules/testing.md` (6 штук) | ровно заявленное число успехов |
| `foundation` | 14 прогонов старта без одной `QUOTA_*` + модели + origin | код 1 и имя своей переменной |
| сборка | `npm run build` | бандл виджета ≤ 45 КБ gzip, иначе падение |
| после правки compose | `check-ports.cjs .`, `check-port-conflicts.sh`, `check-env-wiring.sh` | `0` |
| вёрстка | `bash scripts/check-responsive.sh --base <выданный адрес>` (перенос из N5) | `0` + скриншоты 1440 и 375×667 глазами |
| перед выпуском | калибровка порога 20 + 20 | 0 выдумок, ≥ 16/20 верно |

## 5. Выпуск на стенд (Completion)

1. `.env` на VPS, блок общего TLS-прокси → `127.0.0.1:${N6_HTTP_PORT}`; сузить `trusted_proxies` в
   `proxy/Caddyfile` до подсети общего прокси.
2. `docker compose build` → `up -d db redis` → `migrate` → `up -d web worker-index proxy`.
3. `EmbedProbe` своим ключом: ответ 200 и длина 1536 — иначе `worker-index` не стартует.
4. Сквозной сценарий на ВЫДАННОМ адресе (не localhost): URL → предпросмотр → ответ с источником →
   регистрация → claim → домен → код → виджет на чужой странице (`http://localhost:8099`, CSP и
   враждебный CSS) → первый ответ → установка засчитана.
5. Закрыть контракты: `check-embed-contract.cjs .` → `0`, `check-job-contract.cjs .` → `0`
   (с `index_job_id`), прогон, упёршийся в `visitor_answers`, и сверка журнала с activity OpenRouter.
6. Записать `docs/REPRODUCE.md` по образцу N5 — как собрано и как повторить с нуля.

Откат — `IMAGE_TAG=<предыдущий> docker compose up -d web worker-index`; миграции недели только
добавляющие.

## 6. Автономный режим

После «я спать/ухожу» вопросов не задавать; решения — в `docs/decisions-autonomous.md` с причиной и
условием отмены; стоп только перед необратимым (деньги, внешние действия, чужие данные). Коммит и
пуш — по правилу владельца: локальный коммит без пуша для него неотличим от несделанного.

## 7. Если что-то не так

| Симптом | Где искать |
|---|---|
| виджет виден, ответов нет, в консоли `blocked by CORS` | двойной ACAO (Caddy + web) или origin не в списке бота |
| виджет не появляется у клиента | CSP хозяина: инлайновый script/style; список директив на экране «Установка» |
| «Читаем сайт» висит | `GET /api/index-jobs/{id}`; > 5 мин без обновления → сторож даст `stalled`; воркер: healthcheck по отметке жизни |
| все посетители упираются в лимит сразу | XFF: ключ лимита не `{client_ip}` или `trusted_proxies` не той подсети |
| `web` не стартует | сообщение `LoadCeilings` называет переменную; `.env` против `.env.example` |
| бот «выдумывает» | калибровка порога; `ValidateModelAnswer` на всех ветках; промпт — фрагменты как данные |
| Caddyfile поправлен, поведение прежнее | bind-mount файла привязан к inode — `docker compose restart proxy`, проверить содержимое внутри контейнера |
