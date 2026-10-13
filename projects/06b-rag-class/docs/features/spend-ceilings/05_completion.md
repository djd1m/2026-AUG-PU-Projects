# Фича 2 · spend-ceilings — завершение

**Дата:** 2026-09-30 · **База:** `acdb4c46` · **Код:** `a22c5889` (хвосты foundation), `d803d7d5` (фича), `fa43a9b0`
(правка теста сброса) + коммит с этим файлом · **Исполнитель:** Claude Opus 5.5, worktree; начатое прерванным исполнителем
доведено до конца (незакоммиченная работа принята после разбора, не переписана) · **Ревью:** отдельный новый агент — не
проводилось здесь. Решения владельца: OWN-06B-004, 008…012.

## Шаг 0 — хвосты foundation (`08_review.md`, узкая перепроверка)

| # | Что | Доказательство |
|---|---|---|
| R-1 | строка ролей в `foundation/05_completion.md`: две роли входа, четыре файла int | дифф `a22c5889` |
| R-2 | `pgUrl()` кодирует имя и пароль; кривая `%` в `DATABASE_URL_*` → `ConfigError` с именем, не `URIError`; `migrate` отказывает паролю роли с символами, требующими кодирования; `.env.example` — «только `openssl rand -hex 24`» | `config.test.ts` «R-2» (пароль `a@b/c#d%e:f`); мутация «`decodeURIComponent` без `try`» → 1 failed |
| Origin | `register`/`login`/`logout` без заголовка `Origin` → 403 до предела и до выхода | `auth-handler.test.ts` «R-3» ×3; мутация «`origin !== null &&`» → 3 failed |

## Что сделано

| Требование | Реализация | Тест |
|---|---|---|
| Все ключи попытки одной транзакцией ДО вызова, условие в `UPDATE` (FR-n6b-16, ADR-010) | `packages/db/src/quota.ts` (foundation, без правок) + `packages/rag/src/paid-call.ts` `#reserve`: `reserveQuota` → `startCall` → COMMIT | T-4, T-5a…c; мутации M-1, M-2, M-3, M-6 |
| Единая дверь `paidCall` | `PaidGateway.beginAnswer()` (один резерв на эмбеддинг вопроса + генерацию, каждый вызов разрешён один раз), `embedIndexBatch()` | S-9 по исходнику; «повтор вызова запрещён» |
| Порядок ключей «частный → общий» | `packages/db/src/quota-keys.ts` — единственный построитель ключей | T-5d (50 × 30, без deadlock); M-13 → deadlock |
| Отказ до платного вызова, без деградации (SC-US-016-1) | `QuotaRefused` → провайдер 0 раз, журнала нет | SC-US-016-1, T-4; M-4 |
| Счёт по попыткам (SC-US-016-3) | резерв не возвращается; исход `failed` при таймауте, 5xx, `error` в 200, схеме | T-8 ×4, T-9 (крах дочернего процесса → `started` + резерв списан); M-5 |
| Ровно один исход | `finishCall` — `UPDATE … WHERE state='started'` | T-10 |
| Общий потолок песочницы (SC-US-016-4) | `sandboxKeys`: `answer:sandbox:<acc>` → `answer:sandbox:global` | T-5b; M-11 |
| Разделяемый ресурс | транзакция резерва без сети, провайдер вне её; пул 10, `connectionTimeoutMillis` 5000 | T-6: 200 параллельных, соединений ≤ 10, в провайдере одновременно > 10 |
| Исполнитель закреплён (SC-US-005-4) | `openrouter.ts`: `PROVIDER_ROUTING` константой в обоих телах, один `fetch`, `res.ok` явно | T-11, T-12, S-5, S-7, S-8; M-7, M-7b, M-8 |
| Закрытый список `LIMIT_*`, отказ старта | `limitsFrom()` + Boot config check; переменные сняты из `PENDING_DECISIONS` и читаются `apps/web/src/server/paid.ts` | T-1, `config-wiring.test.ts` (F-6 зелёный честно); M-10a…c |
| Сутки по МСК, час входа с датой | `moscowDay`, `moscowHour` | T-2; M-9, M-12 |
| Текст отказа (OWN-06B-009) | `refusal.ts`: посетителю один код `limit_reached` и один текст на личный, ботовый и общий; песочнице — свой со сроком сброса; `Retry-After` до полуночи МСК | `keys-and-refusal.test.ts`; мутация «свой текст для общего» → 1 failed |
| Ручной сброс (OWN-06B-010) | `ops-cli reset-quota --scope <ключ> --operator <кто> [--day] [--reason]`: только ключ закрытой формы, журнал `quota_reset_log` (миграция 003) в той же транзакции; журнал не правится ролью `n6b_service` | `spend-ops.test.ts` ×9; мутации «без журнала», «форма снята» |
| `limited` с каналом (OWN-06B-012) | `recordLimited()` → `question_log.outcome='limited'`, канал из закрытого множества | `spend-ops.test.ts` |
| Где виден расход (§6) | `spendToday()` + `ops-cli spend-today`: доли глобальных ключей, тревога ≥ 80 %, попытки по видам, «исход неизвестен», доля `failed` за час, оценка $; пусто → `null` | T-13; мутация «`?? 0`» |
| Ключ посетителя | `packages/db/src/client-address.ts`: HMAC(`VISITOR_SECRET`, /24·/64 + `bot_id`); `apps/web/src/server/ip.ts` реэкспортирует | `keys-and-refusal.test.ts`, `ip.test.ts` |

Стражи по исходнику (`packages/rag/tests/unit/guards.test.ts`): S-5, S-6, S-7, S-9, S-10, порядок `paid-call`. У каждого
рядом синтетический плохой вход и реальная мутация.

## Перенос N4/N5 (поле `reuse`)

Перенос сделан прерванным исполнителем; источник и адаптации записаны в шапке каждого файла. Эти исходники я заново не
открывал — сверял шапки с планом §8. Код `projects/06-rag-sales-chatbase/**` не открывался.

| Модуль | Источник | Что поменяно |
|---|---|---|
| N4 #14 квоты | `04-…/packages/db/src/quota.ts` | в foundation; здесь не менялся. Ключи — новый `quota-keys.ts` |
| N4 #15 журнал вызовов | `04-…/apps/recognizer/src/observability/model-call-log.ts` | носитель — строка `model_call_log`; START коммитится с резервом; исход `UPDATE … WHERE state='started'` |
| N4 #16 порт провайдера | `04-…/apps/recognizer/src/provider/{types,openrouter,fake}.ts` | vision → `embed` + `answer` (JSON-схема, `max_tokens 400`); `provider` константой; `select.ts` не перенесён |
| N5 #19 потолки | `05-…/packages/shared/src/config.ts`, `apps/worker/src/llm/spend.ts` | `limitsFrom()` над уже проверенными значениями; «записано до отправки» — START в транзакции резерва |
| N5 #20 ключ посетителя | `05-…/apps/web/src/server/ip.ts` | из `apps/web` в `@n6b/db`, `addrPrefix(ip, 24|32)`, HMAC + `bot_id`; Redis-лимит не перенесён |

## Проверки

- Полный прогон §5 (`compose -p n6b-f02`, ревизия `fa43a9b0`): **exit 0**, typecheck 0, unit **189/189**, integration
  **92/92** (65 foundation + 15 `paid-call` + 12 `spend-ops`), в `config` 0 `published`/`host_ip` —
  `tests/artifacts/spend-ceilings/full-run.txt`.
- Мутации — `tests/artifacts/spend-ceilings/mutations.txt`: 29 штук, все красные. Две находки по ходу работы.
  (1) Страж S-7 читал комментарий в шапке `openrouter.ts` и оставался зелёным при `allow_fallbacks: true`. Теперь он
  проверяет код без комментариев. (2) Тест сброса зеленел, когда проверку формы ключа убирали: отказ давал «счётчика
  нет». Теперь строка с ключом существует, и тест требует именно отказ по форме.
- `check-port-conflicts.sh` 0 и `check-ports.cjs` 0 (копия с плейсхолдерами `.env.example`), `check-model-cost.cjs` 0,
  `npm run build` 0 (Next собрал `@n6b/rag`) — `check-port-conflicts.txt`, `model-cost.txt`, `build.txt`.

## Отклонения и не сделано

1. План назвал `limits.ts` и `QuotaExhausted`. На деле разбор живёт в Boot config check и `limitsFrom()` (`quota-keys.ts`),
   а исключение — `QuotaRefused` из foundation. Второго файла и второго имени нет.
2. Маршрутов ответа ещё нет: виджет, демо и песочница — фичи 7, 9 и 12. Они берут `getRuntime().paid`. В этой фиче нет
   маршрутов, которые вызывают `quotaRefusal`/`recordLimited`, а 429 проверен на уровне функции.
3. Воркер проверяет `LIMIT_EMBED_TOKENS_*` при старте, но решения по ним пока не принимает: батчи индексации — фича
   `chunk-embed`, она зовёт `embedIndexBatch(embedKeys(…))`. Страж CFG-I5 для воркера не написан. Оценку токенов
   (`js-tiktoken`) тоже делает `chunk-embed`.
4. `beginAnswer` коммитит START эмбеддинга вместе с резервом. Если вызывающий не позовёт `embedQuestion`, строка
   останется `started` и на панели будет «исход неизвестен». Звать его нужно сразу. START генерации пишется отдельной
   короткой транзакцией до отправки. Если БД упадёт на этом шаге, генерация не уйдёт, а резерв останется списан.
5. Мутация M-14 (START после COMMIT) ловится стражем порядка по исходнику, а не T-9. START всё равно происходит до вызова,
   поэтому крах внутри провайдера картину не меняет.
6. Живого вызова OpenRouter не было: T-11 проверяет тело запроса, то есть декларацию. Поведение отказа закреплённого
   исполнителя проверит фича 16 (release-gate, R-6).
7. OWN-06B-011: лимит кредитов на ключе OpenRouter владелец ставит сам. Проверить это отсюда нельзя.
8. Образ `n6b-test-runner:local` (тег из `compose.test.yml`, общий с другими прогонами) оставлен. Контейнеры и сеть
   `n6b-f02` удалены. Docker-образы целей web, worker и migrate не пересобирались, выполнен только `npm run build`.
9. Дорожная карта (`status`) не обновлялась — до ревью.
