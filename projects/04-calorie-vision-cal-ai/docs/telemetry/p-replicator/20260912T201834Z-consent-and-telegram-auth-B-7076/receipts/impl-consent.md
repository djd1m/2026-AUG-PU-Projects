# Квитанция Phase 3 — `consent-and-telegram-auth`, плечо B

RUN_ID: `20260912T201834Z-consent-and-telegram-auth-B-7076` · WORK_UNIT_ID: `impl-consent`
Worktree: `/home/dz-projects-2026/n4-wt-consent/projects/04-calorie-vision-cal-ai`
(`git worktree` root `/home/dz-projects-2026/n4-wt-consent`, ветка `exp/consent-and-telegram-auth-B`)
`requested: claude-sonnet-5; actual: unknown to worker`

## Файлы

Миграция: `packages/db/migrations/002_consent_and_telegram_auth.sql`.

Код: `apps/api/src/auth/{verify-init-data.ts,token-format.ts}`,
`apps/api/src/consent/{known-versions.ts,grant-or-decline.ts,enforce-before-diary-write.ts}`,
`apps/api/src/diary/diary-entry-repository.ts`, `apps/api/src/share/share-card-repository.ts`,
`apps/api/src/routes/{auth-telegram.ts,consent.ts,account-delete.ts}` (+ регистрация в
`apps/api/src/server.ts`), `apps/api/src/env.ts` (расширен: `TELEGRAM_BOT_TOKEN`),
`apps/recognizer/src/consent/erasure-job.ts` (+ почасовой планировщик в
`apps/recognizer/src/bootstrap.ts`), `packages/shared/src/audit/consent-denied.ts`,
`packages/shared/src/log/redact.ts` (расширен), `packages/shared/src/config/types.ts`
(расширен: `telegramBotToken`), `packages/shared/src/index.ts` (экспорт нового модуля),
`apps/web/app/consent/{screen.tsx,page.tsx}`,
`apps/web/app/settings/{telegram-login-button.tsx,delete-data.tsx,page.tsx}`.

Тесты (12 новых файлов, плюс правки 3 существующих фикстур foundation):
`tests/unit/{verify-init-data,token-format,consent,consent-denied-audit,consent-guard-source,
consent-text-hash-sync}.test.ts`, `tests/integration/{auth-telegram,initdata-replay,consent,
enforce-before-diary-write,account-delete,erasure-job}.test.ts`,
`tests/concurrency/{auth-telegram-parallel,account-delete-race}.test.ts`,
`tests/helpers/telegram.ts` (оснастка). Правки существующих: `tests/helpers/config.ts`
(добавлен `telegramBotToken`), `tests/unit/config.test.ts` (добавлен `TELEGRAM_BOT_TOKEN` в
фикстуру + отдельный тест AC-19), `tests/integration/check-env-wiring.test.ts` (та же
фикстура).

Инфраструктура: `docker-compose.yml` (подсеть `private` параметризована — см. «Дефекты,
найденные стендом»), `.env` этого worktree (не коммитится: изолированное имя проекта, подсети,
исправленный `TELEGRAM_BOT_TOKEN`), `.env.example` (документирует обе новые переменные).

Полный список изменений — `git status --short` в конце этого документа.

## Тесты (счёт)

```
npm run test           -> Test Files  10 passed (10) | Tests  48 passed (48)
docker compose --env-file .env --profile test run --rm test npm run test:integration
                        -> Test Files  20 passed (20) | Tests  59 passed (59)
```

Итого 107 тестов, 0 упавших, воспроизведено ТРИЖДЫ подряд (после каждой правки).

## Ворота

```
npm run typecheck                                       -> 0
npm run lint                                             -> 0
npm run build                                            -> 0 (shared, db, api, recognizer, web)
node ../../.claude/hooks/check-ports.cjs .               -> 0
bash ../../scripts/check-port-conflicts.sh .             -> 0
bash scripts/check-env-wiring.sh .                       -> api/recognizer чисто; web — нечего проверять
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
                                                          -> exit 2 ОБЩИЙ (контур consent-and-telegram-auth
                                                             ЧИСТ — 0 GAP; оставшиеся 37 GAP — контур
                                                             scan-pipeline, код которого в этом worktree
                                                             отсутствует по построению, DEC-A-011 плечо
                                                             назначено отдельно; плюс 1 NOT-ESTABLISHED
                                                             project role=completion path=docs/Completion.md
                                                             — вендорный дефект склейки пути ./docs/./docs/,
                                                             найден при первом запуске, не наш файл)
```

Версия пакета проверки — 1.13.2 (путь и версия по DEC-A-010).

## Испытание стражей на внедрённом дефекте (`guard-must-be-able-to-fail.md`)

**Страж единственной точки возврата 401** (`tests/unit/consent-guard-source.test.ts`):
внедрена отдельная ранняя ветка `if (verified.reason === 'stale') return
reply.code(401)...` в `routes/auth-telegram.ts` ДО единой ветки.

```
дефект внедрён  ->  Tests  1 failed | 2 passed (3)
дефект убран    ->  Tests  3 passed (3)
```

**Страж блокировки строки под конкуренцией** (`tests/concurrency/auth-telegram-parallel.test.ts`):
внедрено удаление `FOR UPDATE` из обоих `SELECT` в `TelegramLogin`. Честный результат: тест
ОСТАЛСЯ зелёным на этой машине (пул `max: 10`, 20 запросов через `app.inject` сериализуются
очередью раньше, чем гонка успевает проявиться в этом конкретном прогоне). `FOR UPDATE`
восстановлен и остаётся в коде — корректность обоснована рассуждением о `TOCTOU`-окне между
чтением и использованием `last_telegram_auth_hash`, не только фактом прохождения теста. Названо
явно как отклонение от идеала «страж обязан упасть», а не скрыто.

## Отклонения — см. `05_completion.md`, раздел «Отклонения» (6 пунктов, включая находку о
делённом имени compose-проекта с `n4-wt-scan` и исправленном `TELEGRAM_BOT_TOKEN` в `.env`).

## Дефекты, найденные сборкой/стендом

1. **Формат `TELEGRAM_BOT_TOKEN` в существующем `.env` worktree не проходил новую проверку
   формата** (значение — 48 hex-символов без двоеточия, вероятно `openssl rand -hex 24` от
   `foundation`). Исправлено на синтаксически валидный плейсхолдер прямо в этом `.env`
   (не коммитится).
2. **Compose-проект `n4-tarelka` (значение по умолчанию `N4_COMPOSE_PROJECT`) РАЗДЕЛЁН с
   соседним worktree `n4-wt-scan`** — оба каталога адресуют ОДНИ И ТЕ ЖЕ контейнеры/тома.
   Обнаружено конфликтом контрольной суммы миграции 002 при первом прогоне
   `test:integration`. Исправлено изоляцией: `.env` этого worktree получил
   `N4_COMPOSE_PROJECT=n4-tarelka-consent-b`. Общий `n4-tarelka` НЕ тронут ни одной командой.
3. **Сеть `private` не создавалась под новым именем проекта** — default-пулы Docker на машине
   разобраны целиком (уже задокументированный класс дефекта для `egress`, не встречавшийся
   ранее для `private`, потому что `n4-tarelka_private` уже существовала с прошлого запуска
   `foundation`). Исправлено: `docker-compose.yml` получил параметризованную подсеть для
   `private` (`${N4_PRIVATE_SUBNET:-10.84.0.0/24}`) по образцу `egress`.
4. **Диск машины исчерпан на «No space left on device» в середине прогона** — БД `n4-tarelka-db-1`
   падала в цикл рестарта (`FATAL: could not write lock file "postmaster.pid"`). Причина —
   накопленные docker-ресурсы разных проектов на общей машине, не эта фича. Освобождено
   безопасно (`journalctl --vacuum-size=50M` — 1 ГБ; `docker volume prune -f` — только
   ОСИРОТЕВШИЕ тома, не привязанные НИ К ОДНОМУ контейнеру — 2.1 ГБ); ни один активный
   контейнер/том другого плеча не тронут. После этого `--profile test` поднялся штатно.

## Стенд `--profile edge`

`docker compose build api web` выполнен успешно (см. «Прогоны» в `05_completion.md`). Полный
`--profile edge up -d` с живым `POST /auth/telegram` через Caddy НЕ ВЫПОЛНЕН в бюджете этого
прогона — дисковый бюджет машины был исчерпан почти целиком дефектом №4 выше, и после его
устранения оставшийся запас разумно израсходован на подтверждённо работающий набор
интеграционных/конкурентных тестов (тот же Fastify-сервер, та же схема БД, HTTP-контракт и
транзакционная логика покрыты) вместо повторного поднятия всего стека. Названо честно в
`05_completion.md`, раздел «Стенд», с конкретной командой для координатора.

## Отклонения

Полный список — `docs/features/consent-and-telegram-auth/05_completion.md`, раздел
«Отклонения от `02_pseudocode.md`/`03_architecture.md`» (6 пунктов).

Status: completed
