# Acquisition analytics: проверки

План AC1–9: [analytics-plan.md](analytics-plan.md). Уточнения: [deployment-context.md](deployment-context.md).

## Поведение и ошибки

- Missing/empty/malformed runtime ID: SDK/requests нет, продукт работает.
- Consent unknown/denied: нет SDK/queue/attribution storage. Opt-in работает;
  withdrawal и переход на исключённый путь прекращают последующие вызовы.
- Register200 с dummy cookie + protected401: нет signup goal. Login тоже нет.
  Реальный register+code.apply и discard-referral считаются один раз.
- Initial done+available и поздний polling transition дают ready один раз.
  Queued/failed/expired/unavailable и clicks не дают ready.
- Pending→succeeded с совпадающим intent даёт payment один раз. Wrong intent,
  canceled/timeout/401/404/malformed и plan=paid alone не дают payment.
- SDK blocked/storage throws/network unavailable: signup/navigation/download
  не ждут аналитику; queue/dedupe конечны. Никаких скрытых бесконечных retries.

## Безопасность и доказательства

Тестовые sentinel email, title, filename, transcript/prompt, query/hash/referral,
dynamic IDs и sensitive referrer не должны попасть в actual SDK requests.
Дополнительно: SDK не видит родительские формы/DOM; автоматические form://
и посторонние цели запрещены. SDK загрузка без отправки goals не доказывает воронку. Requests interception
проверяет сериализацию, не получение целей настоящим owner counter.

Negative guards испытать точечной мутацией с красным тестом, затем восстановить.
Новый shared DB ресурс не добавляется; существующие concurrency/payment наборы
остаются обязательными. No real payments, paid models or user recordings.

## Обязательные команды и контур

Полный npm test с обязательными reporters, typecheck, lint, build, env wiring.
Реальные PostgreSQL/Redis/MinIO fixture tests; браузерные UI проверки внутри
существующего codex-ui-playwright Docker. Перед фактическим E2E — read-only
preflight exact source/build/fixture/commands/effects. До старта контейнеров —
port conflict checks. Для consent UI —responsive checks и обе темы.
Недоступная проверка не считается pass. Повторы только по новой находке/изменению.

## В Cloud.ru

Создать owner counter/goals, настроить runtime ID и согласие, проверить HTTP
без interception, затем goal visibility в debugger/отчётах и сверку оплат с БД.
Это planned этап запуска; его нельзя закрыть локальным stub SDK.
