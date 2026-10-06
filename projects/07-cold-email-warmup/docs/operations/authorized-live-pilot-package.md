# F15 — пакет разрешений и приёмки внешнего пилота

Подготовлен 2026-10-06 в RUN_ID `20261006T090602Z-n7-expanded-mvp-a1` по [утверждённому XL-плану](../plans/expanded-mvp-plan.md) и OWN-N7-005. Статус: подготовка, внешние действия не запускались. F07/F08 приняты локально; F09 в реализации, F10–F14 ожидают своей реализации и приёмки. Это конкретный перечень будущих входов и результатов, а не запрос повторного разрешения на разработку. Финальная ревизия, команды и отчёты заполняются после локальной приёмки соответствующих slices.

## Область отдельного внешнего решения

| Действие | Конкретные входы решения | Текущее состояние / ответственный |
|---|---|---|
| Реальные SMTP и IMAP | Идентификатор инсталляции/окружения; список tenant/mailbox и consenting peers; SMTP465 либо STARTTLS587 и IMAP993 hostname; разрешённая password PLAIN authentication через TLS и применимая политика каждого провайдера; capabilities smtp_submit/imap_headers и срок grants | Не предоставлено; владелец аккаунтов/оператор. Сами сохранённые credentials или allowlist не являются разрешением |
| Передача контента OpenAI | Явное согласие tenant на disclosure; project/account/model; утверждённая retention notice; перечень разрешённых полей/типов контента | Не предоставлено; владелец tenant и OpenAI project |
| Actual-model synthetic gate | Positive daily token и currency cap, отдельный максимальный расход запуска, разрешённый project/model, approved prompt/policy/snapshot/cases hashes; синтетические C01–C24 | Не предоставлено; владелец бюджета. Ни одного платного вызова в подготовке |
| AI autopilot live | Применимое отдельное AI consent; immutable approved snippet snapshot, intent/topic/language mappings и exact thread/recipient scope; источник/версия и expiry; успешный actual-model gate | Не предоставлено; владелец tenant. Произвольные модельные формулировки остаются HITL |
| Deployment и окружение | Точный хост/инсталляция, frozen source/build/config, допустимое окно, назначенный оператор, ресурсы, backup/restore/rollback evidence | Пока не готово; координатор завершает локальные F09–F14, затем оператор утверждает конкретную поставку |
| Обращения и остановка | Существующий complaint intake и его ответственный, оператор kill switch, контакты и окно дежурства | Не предоставлено; оператор. Этот пакет не отправляет сообщения и не создаёт внешние интеграции |

Секреты передаются через разрешённую runtime-конфигурацию: в этом файле и отчётах только opaque identifiers, digest и ссылки на разрешённое хранилище, без паролей/API keys/тел писем. Billing остаётся TEST. Изменение shared proxy, новые расходы и внешние уведомления требуют применимого конкретного решения.

## Замороженные параметры A1–A3

Уже утверждены OWN-N7-005: 100 подключённых, не более30 активных глобально; ≥3 tenant, ≥2 независимых opt-in tenant пула; полный7-суточный период24×7. Ресурсный ориентир2vCPU/4GiB для app+workers, фактические ресурсы и версии PG/runtime/сети фиксируются перед стартом. Невозможность A1 требует пересмотра до пилота, без уменьшения нагрузки задним числом.

300 заранее пригодных входящих AI-событий за окно, средняя нагрузка≤1/мин, burst6/мин распределённо, ≤8AI-ответов/mailbox/day. Общий default10/day, ceiling30/day и меньший provider cap суммарно для warmup/campaign/AI сохраняются. SMTP≤2global/1mailbox с spacing60s, IMAP≤4global/1mailbox, LLM≤2global. Здоровый poll≤30s, complete poll age<60s, fair due round≤60s, pool round≤5min. Истечение lease не доказывает закрытие сокета: занятые transport slots освобождаются только после подтверждённого close/exit с проверкой владельца.

Body≤32KiB, thread≤5messages/64KiB; без загрузки вложений и remote URLs. Terminal content TTL≤24h, absolute TTL7days, metadata30days. LLM input≤8000tokens/output≤500, timeout30s, максимум2generation attempts лишь при доказанном отсутствии результата, общий generation budget≤65s. Финансовые числа не выдуманы: их заполняет владелец бюджета до любого платного запуска.

## Пакет готовности, который координатор должен завершить

| Артефакт | Обязательное содержимое | Статус |
|---|---|---|
| Frozen candidate | Source commit, build digest, миграции, config fingerprint, policy/prompt/snapshot/cases hashes, readonly source-version map | Ожидает F09–F14 |
| Local acceptance | Полные unit/real-PG/local-protocol/concurrency/fault/canary/mutation/type/lint/build; применимый Docker UI; independent review и exact AC witnesses | F07/F08 приняты; остаток F09–F14 |
| Actual-model result | Все24case и variants, все попытки/ошибки, scrubbed outputs, returned model/version/parameters, usage/cost и caps; независимая проверка | Внешний gate: отдельный budget/account/content grant |
| Live launch sheet | UTC start/end ровно7суток, список разрешённых opaque mailbox/tenant IDs, scoped grants/expiry, ресурсный baseline, on-call operator | Ожидает локальной готовности и входов выше |
| Recovery rehearsal | Kill switch revoke под FIRST global lock, drain submitting/unknown без повторов, доказанное socket close/exit, совместимый rollback/backup restore | Ожидает F10/F14 |
| Final evidence | Неизменённый журнал всего окна, raw eligible outcomes и counter totals, nearest-rank p95/p99, misses/errors/unknown/provenance, delivered report | Будущий результат; не заменяется локальными fixtures |

## Порядок разрешённого запуска после закрытия входов

1. Координатор связывает accepted source/spec/build с проверками F07–F14 и заполняет точные существующие runtime-команды, не придумывая ещё не реализованные CLI.
2. Оператор фиксирует отдельное решение для конкретных deployment/account/provider/OpenAI actions и caps. Отсутствующий вход оставляет только соответствующую внешнюю capability disabled; независимая локальная работа продолжается.
3. Отдельно проходит actual-model gate на frozen synthetic cases:0 unauthorized,100% правильных holds, минимум11 из12 полезных разрешённых ответов. Ошибки и неудачные повторы сохраняются; новая model/prompt/policy/snapshot/cases version инвалидирует прежний gate. Local recorded fixtures его не заменяют.
4. После accepted model gate и применимого AI consent оператор выдаёт ограниченные grants, проверяет probes/kill switch и фиксирует полный7-суточный интервал. Реальный provider success сам по себе не означает delivered/inbox placement.
5. Координатор публикует честный результат окна и remaining blockers. Никакая локальная приёмка не закрывает live AC автоматически.

## Правила метрики и остановки

Denominator включает все server-admitted eligible события, зафиксированные до generation; поздние/ошибочные/unknown outcomes остаются в нём с latency=+infinity. Trusted arrival требует доказанного источника/сопоставления часов; Date и непроверенный IMAP INTERNALDATE не принимаются. Unknown arrival блокирует SLO claim. p95 — sorted item ceil(0.95×N), индекс1-based; дляN300 ранг285, latency строго<300s, ровно300s — miss. N0 означает unverifiable. Никакого исключения неудобных событий после результата.

При revoke/жалобе/недоступной authority прекращаются новые claims через общий FIRST pg_advisory_xact_lock(7,1). Уже committed submitting может быть in-flight; неопределённые исходы сохраняются unknown_delivery с quota, без blind retry. Rollback не удаляет evidence и не requeue unknown. Потеря proof закрытия сокета оставляет physical slot занятым до подтверждённого завершения владельца.

## PR delivery

Ветка `feature/07-cold-email-warmup`, target `claude/install-npm-packages-n7l3m5`. Известный прежний create-PR403 остаётся внешним access blocker; повторная попытка лишь после изменения доступа/состояния. Подготовка локального source-bound diff/описания и разрешённые branch push продолжаются независимо. Финальный PR body будет отражать принятую реализацию и отдельно оставшийся live gate.
