# DEVELOPMENT_GUIDE — ClipMkr (05a)

Пошаговый цикл разработки. Читать вместе с [`CLAUDE.md`](CLAUDE.md); полные документы — в `docs/`.

## 0. Прежде чем открыть редактор

1. Прочитать `docs/PRD.md`, `docs/Specification.md`, `docs/canon.md` (§1–12), `docs/ADR.md`
   для затронутого решения, `docs/Pseudocode.md` для затронутого алгоритма.
2. Проверить `.claude/feature-roadmap.json`: зависимости фичи `done`? Если нет — работать над
   зависимостью, не над этой фичей.
3. Прогнать роутер сложности (из корня репозитория; скрипт сам переходит в корень через
   `git rev-parse --show-toplevel`, путь безопасен из любого cwd):
   ```bash
   bash scripts/complexity-router.sh
   ```
   `1` (L/XL) — стоп на плане у владельца перед реализацией, это ожидаемо для
   `stt-pipeline`/`llm-selection`/деплоя. `2` — разобраться, не считать тиром T.

## 1. День 0 (владелец, не входит в дни агента)

Без этого агенту НЕКУДА развернуть код: домен `clipmkr.ru` + DNS + TLS (на 2026-09-23 HTTPS не
отвечает, ADR-017); Resend с SPF/DKIM (OWN-05A-011); Cloud.ru аккаунт + бакет с CORS
(`AllowedOrigins=BASE_URL`, `AllowedMethods=PUT,GET`, `AllowedHeaders=content-type`,
`ExposeHeaders=ETag`); сервер в Нидерландах; `OPENROUTER_API_KEY`. **Параллельно** — ручной набор
8–12 авторов беты; каждого до
старта отмечает оператор `ops beta-add <email>`.

## 2. Проба STT дня 1 (первая фича, `stt-probe`)

Выполняется ДО кода конвейера, БЕЗ полного монорепо (TK-05, принято координатором): `stt-probe`
первым шагом создаёт только МИНИМАЛЬНЫЙ корневой скелет — `package.json` с `workspaces`,
заготовки `packages/models` (интерфейс `Transcriber`), `packages/config` (чтение окружения) и
`apps/worker/src/cli/ops.ts` + `apps/worker/src/lib/audio-chunker.ts` — и владеет этими файлами
при создании. Дальше фичи (`foundation-auth` и позже) ТОЛЬКО РАСШИРЯЮТ `package.json`
(добавляют `apps/web`, `packages/db` и т.д. в `workspaces`), не пересоздают его — общие манифесты
правит integration owner (`CLAUDE.md` §Parallel execution strategy). Без сборки в `dist/`:

```bash
npx tsx apps/worker/src/cli/ops.ts stt-probe <файл>
```

После того как `foundation-auth` настроит полную сборку, тот же код доступен и как
`node apps/worker/dist/cli/ops.js stt-probe <файл>` (боевая форма из ADR-001 п.4/Completion §5) —
это тот же файл, скомпилированный, а не вторая реализация.

5 кандидатов OpenRouter, 7 критериев (ADR-001). Результат — `docs/probes/stt-day1.md`,
`STT_MODEL`/`STT_PROVIDER` фиксируются в конфигурации прод-профиля, не в коде. Не прошёл никто из
продуктовых критериев → стоп, вопрос владельцу (тихое снижение порогов запрещено).

## 3. Цикл фичи (`/feature`, PLAN → VALIDATE → IMPLEMENT → REVIEW)

1. **PLAN** — агент `planner`: назвать FR/AC/ADR, алгоритм Pseudocode, порядок операций,
   конкурентные сценарии из `Refinement.md` §2.4, применимые к этой единице.
2. **VALIDATE** — `requirements-validator` (корень): критерии INVEST/SMART, если фича добавляет
   новый пользовательский сценарий.
3. **IMPLEMENT** — код пишет модель семейства OpenAI (Codex), по решению владельца OWN-05A-00M
   (`../../.claude/rules/codex-invocation-local.md`: закрытый stdin, доверенный каталог,
   постановка в файле, барьер приземления). Любая единица, трогающая STT/LLM-вызов или потолки —
   ДО код-ревью прогнать через агента `cost-guard`.
4. **REVIEW** — код-ревью ведёт модель ДРУГОГО семейства (Anthropic), не та, что писала код —
   агент `code-reviewer`. `brutal-honesty-review` (корень) — для крупных фич.

## 4. Проверки перед коммитом

Из корня репозитория:

```bash
npm test && npm run lint && npm run build
node .claude/hooks/check-ports.cjs projects/05a-podcast-clips-opus
bash scripts/check-port-conflicts.sh projects/05a-podcast-clips-opus
bash projects/05a-podcast-clips-opus/scripts/check-env-wiring.sh          # создаётся в Phase 4 (Codex)
node .claude/hooks/check-model-cost.cjs projects/05a-podcast-clips-opus
node .claude/hooks/check-job-contract.cjs projects/05a-podcast-clips-opus
```

Все 15 мутационных стражей (`Refinement.md` §2.5) прогоняются с внедрённым дефектом ДО зачёта
(две строки в квитанции: красный с дефектом, зелёный после восстановления).

## 5. Конкурентные и E2E-прогоны

13 обязательных тестов `Refinement.md` §2.4 — на настоящем Postgres/Redis/MinIO тестового
профиля, не на моках. E2E — по адресу, который выдало РАЗВЁРТЫВАНИЕ, не `localhost`
(`deployment-seams.md`):

```bash
docker compose --profile test up
bash projects/05a-podcast-clips-opus/scripts/check-cjm.sh <адрес тестового стенда>   # создаётся в Phase 4 (Codex)
```

## 6. Коммит и передача

Commit message по `../../.claude/rules/git-workflow.md` (Conventional Commits). Квитанция фичи:
точная ревизия, что проверено и чем, стражи, испытанные мутацией, что осталось хвостом.
`.claude/feature-roadmap.json` обновляется `/next <feature-id>` — статус `done` только после
прохождения всех обязательных проверок этой фичи, не по наличию файла.

## 7. Развёртывание (фича `deploy-netherlands`)

Порядок обязателен, каждый шаг предполагает, что предыдущий прошёл (`docs/Completion.md` §2):
проверки портов/env/buildable → миграции → старт сервисов →
`bash projects/05a-podcast-clips-opus/scripts/check-cjm.sh https://clipmkr.ru` (скрипт создаётся
в Phase 4, до того — заглушка `2` «проверка не выполнена», не «всё чисто»).

## 8. Модели разработки и телеметрия

Локальная политика владельца (`../../.claude/rules/model-routing-local.md`,
`docs/development/model-routing.md`, `docs/development/model-routing-telemetry.md`) применяется к
`/feature`/`/feature-ent`/`/go`/`/run` в этом проекте: профиль `compact-quality-first-v2`, журнал
телеметрии с первой стадии, фактическая модель подтверждается метаданными исполнения.
Cross-family (OWN-05A-00M) — отдельное решение владельца ПРОДУКТА (кто пишет код/ревью), не
заменяет и не отменяет политику разработчика.

## 9. Известные оговорки, с которыми нужно работать осознанно

См. `CLAUDE.md` §«Известные оговорки Phase 2»: `check-canon.cjs` = 2 (дефект стражей, не проекта,
sha256 сверяется вручную), число потолков в некоторых документах может отставать от канона
(9, не 7). Место знака (OWN-05A-015) на 2026-09-23 согласовано во всех документах — сверять с
`Specification.md` FR-GROWTH-003 п.4 при любой новой правке, а не предполагать расхождение.
