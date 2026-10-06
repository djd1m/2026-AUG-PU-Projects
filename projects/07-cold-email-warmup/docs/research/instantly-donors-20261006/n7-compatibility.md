# N7 donor compatibility — read-only, 2026-10-06

**Вывод:** готового безопасного drop-in модуля из двух доноров нет. Сохранять N7 как основу; из donor01 можно адаптировать лишь низкоуровневый SMTP/MIME пример, IMAP использовать как перечень протокольных операций, не как алгоритм обработки. Donor00 полезен преимущественно как отрицательный пример retry и как идея отдельного импорта наблюдений. Новый live-адаптер — следующая согласуемая фича, не недостающая настройка уже принятого локального MVP.

Scope: статическое чтение исходников и Git tree, без правок N7/доноров, установок, build/tests, provider calls, ключей, публикаций. Никаких заявлений о работоспособности donor runtime. Начало08:37:11 UTC; бюджет12мин. Исполнитель один, субделегирования нет; фактическая native model/usage не предоставлены host, `null`. Sandbox bootstrap bwrap отказал; read-only команды выполнены с разрешённой auto-review escalation. Отчёт — единственный новый файл этого review.

## 1. Зафиксированные источники и реальное состояние N7

- **N7:** `243f04250d428e28e6869a1aef95bc5dbdab2f91`, project `projects/07-cold-email-warmup` в `feature/07-cold-email-warmup`.
- **D00:** `djd1m/2026-PU-APR-LESSON-05-instantly-00@02689350083fa6961df07d47aca8ea9079b1f527` — Python/SQLAlchemy/aiosmtplib.
- **D01:** `djd1m/2026-PU-APR-LESSON-05-instanly-01@fdf565827880813c97535c9aa68ea7fa08ee4339` — Nest/Prisma/BullMQ/nodemailer/node-imap. Написание `instanly` намеренное, совпадает с remote.

N7 README:7–9 честно говорит local adapters/TEST/unknown reputation; это подтверждено кодом: `src/config.ts:44–47` допускает только `disabled|local_test`; SMTP `SubmissionAdapter` имеет literal mode и no-op sink, mailbox verifier не открывает socket, IMAP worker читает fixture DB. Поэтому **реальные SMTP/IMAP адаптеры отсутствуют**, а не просто выключены переменной окружения. [README][n-readme], [config][n-config], [send adapter][n-adapter], [verify adapter][n-provider], [poll worker][n-poll].

## 2. Точки расширения N7, которые нельзя обходить

| Граница N7 (путь:строки) | Контракт для будущего адаптера |
|---|---|
| `src/mailboxes/provider.ts:4–29`; `src/mailboxes/network.ts:48–56` | `TestAdapter.connect(protocol, PinnedEndpoint, Credentials, AbortSignal)` — только connect/TLS/auth, **никогда DATA**. Раздельные SMTP/IMAP credentials; allowlist, проверка всех DNS IP, socket только на выбранный address, TLS servername исходного host; SMTP587 STARTTLS до auth. Проверка подключения10с, операции30с. Literal `local_test` и `verified_test` нельзя переименовать и считать live доказанным. [Исходник][n-provider] / [network][n-network]. |
| `src/dispatch/adapter.ts:3–8`; `src/dispatch/submission.ts:18–94` | `submit(TestMessage)` сейчас **не получает tenant/mailbox/credential/endpoint**, возвращает accepted/pre-DATA proof/permanent/ambiguous. Нужна новая закрытая server-side transport context/capability, не HTTP credentials и не type cast. Сохранять durable финальный переход до I/O и классификацию результата; `accepted` означает SMTP acceptance, не delivery. [Adapter][n-adapter] / [submission][n-submit]. |
| `src/consent/store.ts:39–62`; `src/consent/transaction.ts:3–9` | Отдельный affirmative pool/campaign consent, версия текста и fingerprint получателей, disclosure peer-visible sender/headers/test body. Все stop writers и финальный submit сериализованы первым `pg_advisory_xact_lock(7,1)`; сеть вне транзакции. Нельзя заменить на donor connected/warmup flag. [Consent][n-consent] / [lock][n-lock]. |
| `src/dispatch/store.ts:7–25`; `src/dispatch/eligibility.ts:2–7`; `src/dispatch/submission.ts:24–41` | Claim45с, fair ordering/SKIP LOCKED; pool и campaign используют **общую** квоту `min(daily,provider,30)` по UTC, включая claimed/submitting/submitted/unknown. Poll должен быть complete и моложе60с. Final повторяет consent/content/enrollment/suppression/quota после lock, включая rollover. [Claim][n-claim] / [freshness][n-fresh] / [final][n-submit]. |
| `src/dispatch/submission.ts:71–94`; `src/dispatch/seams.ts:37–52` | Commit `submitting` — необратимая граница; поздний stop допускает уже in-flight попытку. Exception/обрыв после возможного DATA → `unknown_delivery`, никогда blind retry. Только доказанный no-DATA:5с/30с, максимум3 попытки/120с. Recovery abandoned также unknown. Complaint quarantine и stop отменяют queued/claimed, не переписывают submitted. [Submission][n-submit] / [stop][n-stop]. |
| `src/replies/adapter.ts:4–10`; `src/replies/worker.ts:14–64`; `src/replies/store.ts:41–115` | `snapshot(tenant,mailbox)` → UIDVALIDITY/UIDNEXT/time; `read(...validity,cursor,horizon)` → bounded headers + **доказанное coveredThrough**, timestamps. Capture/scan/tail,20pages×100headers/120с,30с свежесть операций. Store уже допускает provenance `imap_headers`, но adapter snapshot type/worker claim и tick сейчас fixture-only — нужно расширить весь trusted-reader путь. [Adapter][n-replyadapter] / [worker][n-poll] / [store][n-reply]. |
| `src/replies/store.ts:77–115`; `src/replies/input.ts:2–49` | UID observation и входящий Message-ID не authoritative dedup. References должны найти собственный отправленный job, From совпасть с recipient; effect unique tenant/mailbox/enrollment/reply. Header effects и cursor commit атомарны; replay/UIDVALIDITY reset не повторяет stop effect. Headers≤8KiB, references≤50; не скачивать unlimited body. [Store][n-reply] / [input][n-header]. |
| `src/mailboxes/crypto.ts:3–41`; `src/dispatch/message.ts:8–18` | Сохранять versioned AES256GCM envelope, AAD tenant/mailbox/version, отдельный runtime keyring. Renderer владеет стабильным Message-ID/References, plain text, токеном unsubscribe32bytes и One-Click headers; сейчас явно LOCAL TEST. Нельзя подключить donor HTML/tracking renderer вместо него. [AEAD][n-crypto] / [message][n-message]. |

HTTP остаётся control plane: `POST /api/mailboxes`, `POST .../:id/consents`, `POST /api/campaigns/:id/start|pause`, `GET .../reply-status`; `verify-test` — только local verification. Публичный универсальный `/send` не нужен. Donor callbacks не должны писать `mailbox_poll.scan_complete` или `send_job` напрямую. Complaint подключать через authenticated operator ingestion и `SuppressionStore.complaint`, unsubscribe через capability token, все эффекты под N7 lock. [Routes:172–220][n-routes], [suppression:11–67][n-suppress].

## 3. Ранжирование конкретного повторного использования

| Приоритет / модуль | Решение и причина |
|---|---|
| 1. D01 `src/email/email.service.ts:85–125` | **ADAPT, следующий live этап:** компактный nodemailer send пример ближе к Node22 N7, но вынести без Nest/Prisma/Resend/tracking. Добавить pinning/обязательный TLS, abort/socket teardown, точный outcome mapping, сохранить N7 Message-ID/unsubscribe. Сейчас host берётся напрямую, `secure` только465; requireTLS не задан, headers не используют переданный tracking ID как SMTP Message-ID. Не готовый provider adapter. [Код][d1-email]. |
| 2. D01 `src/email/imap.service.ts:178–219` и `src/workers/imap-check.processor.ts:235–284` | **IDEA ONLY, текущий fetch REJECT:** TLS `rejectUnauthorized:false`; `UNSEEN SINCE` пропускает уже прочитанные письма/старые ответы, нет UIDVALIDITY/cursor/coveredThrough; unlimited full bodies, async parser ждут фиксированные500мс. Нужен иной bounded UID header reader, питающий N7 ReplyStore. Раздельные IMAP credentials также не сохранены — service:27–28 использует SMTP credentials. [Service][d1-imap] / [worker][d1-imapworker]. |
| 3. D00 `services/email_sender.py:72–178`, D01 `src/workers/email-send.processor.ts:32–118` | **REJECT целые send workers:** D00 retry любого SMTPException/OSError/timeout включает неоднозначность после DATA; record только flush перед send, sent counter после. D01 send затем раздельные DB updates и catch rethrow для BullMQ retry; нет N7 final eligibility/stop serialization и unknown state. D01 worker не ставит unsubscribe header. Перенос queue/retry разрушает N7 guarantee. [D00][d0-send] / [D01][d1-worker]. |
| 4. D01 `src/common/encryption.service.ts:7–38` и worker:110–118 | **REJECT crypto donor:** общий GCM формат `iv:tag:cipher`, scrypt static salt; worker ожидает другой двухчастный CBC hex key. Ни один не совместим с N7 versioned AAD-bound envelope; не мигрировать секреты ради reuse. Worker ещё обращается camelCase полям, тогда как Prisma schema:148–157 snake_case — build/runtime не подтверждены. [GCM][d1-crypto], [CBC][d1-worker], [schema][d1-schema]. |
| 5. D01 `src/workers/warmup.processor.ts:44–145,178–198`; D00 `services/warmup.py:136–185` | **REJECT scheduler/health:** D01 выбирает connected peers без отдельного scope consent, заранее планирует reply и mark-not-spam; отношение replies/sends выдаётся как inbox rate. D00 default inbox_rate100 при sent>0 и отсутствии реального наблюдения питает score. N7 pool уже имеет разные tenants, consent, quota, waiting и единственный reply только после submitted parent (`src/pool/store.ts:12–29`). Расширять donor ramp до50 нельзя при N7cap30. [D01][d1-warm], [D00][d0-warm], [N7 pool][n-pool]. |
| 6. D00 `services/mailivery_client.py:30–98` | **IDEA, отдельный будущий connector:** импорт независимо проверенных наблюдений может питать N7 evidence, но credential upload `/connectsmtp` и автоматический выбор Mailivery по наличию key — отдельная передача данных/расход/согласие. Не подменяет собственный добровольный seed cohort. `POST /api/evidence` сейчас требует source/ref/window/count/manualVerified, нельзя автоматически ставить true для provider score. [D00][d0-mailivery], [N7 observation][n-evidence]. |
| DIRECT | **Нет рекомендуемого production code copy.** Возможны только небольшие документированные идеи/negative test cases; право переноса donor кода должно быть отдельно подтверждено. В Git trees обоих доноров не найден отдельный LICENSE/COPYING/NOTICE; это наблюдение, не юридический вывод и не подтверждение разрешения. |

## 4. Минимальный следующий шаг и границы MVP

Локальный MVP N7 уже имеет нужные consent/pool/campaign/stop/dedup алгоритмы; не переносить donor backend, auth, billing, CRM, AI replies, tracking pixels, Resend fallback, BullMQ или новые метрики ради полноты. **Полезная следующая фича:** отдельно специфицировать live provider capability и verification state, затем SMTP adapter + bounded IMAP header reader за существующими N7 stores. Начинать с fake socket/protocol transcript tests; до реальных sends нужны explicit opt-in, разрешённые provider endpoints/credentials, zero-send verify и утверждённый лимит пилота. Это рекомендация, реализации сейчас нет.

Обязательные будущие доказательства: stop до/после submitting commit; DATA accepted then disconnect→unknown без retry; expired claim/UTC quota rollover; DNS rebinding/TLS/timeout teardown; UIDVALIDITY reset, sparse/expunged ranges, tail failure, crash до/после page commit и semantic dedup. Все нынешние N7 oracle сохраняются. Учебные donor tests и README claims не заменяют эти проверки.

Статический review завершён; ни SMTP, ни IMAP, ни Mailivery, ни paid API не запускались. Source SHA проверены; строки относятся только к ним. Внешние URL ниже — pinned ссылки на прочитанные локальные git sources, не новые web/API проверки.

[n-readme]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/README.md#L7
[n-config]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/config.ts#L44
[n-adapter]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/adapter.ts#L3
[n-provider]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/provider.ts#L4
[n-poll]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/worker.ts#L14
[n-network]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/network.ts#L48
[n-submit]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/submission.ts#L18
[n-consent]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/consent/store.ts#L39
[n-lock]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/consent/transaction.ts#L3
[n-claim]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/store.ts#L7
[n-fresh]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/eligibility.ts#L2
[n-stop]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/seams.ts#L37
[n-replyadapter]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/adapter.ts#L4
[n-reply]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/store.ts#L41
[n-header]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/input.ts#L2
[n-crypto]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/crypto.ts#L3
[n-message]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/message.ts#L8
[n-routes]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/server.ts#L172
[n-suppress]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/suppression/store.ts#L11
[n-pool]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/pool/store.ts#L12
[n-evidence]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/evidence/input.ts#L3
[d1-email]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/email/email.service.ts#L85
[d1-imap]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/email/imap.service.ts#L178
[d1-imapworker]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/imap-check.processor.ts#L235
[d1-worker]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/email-send.processor.ts#L32
[d1-crypto]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/common/encryption.service.ts#L7
[d1-schema]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/prisma/schema.prisma#L148
[d1-warm]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/warmup.processor.ts#L44
[d0-send]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/blob/02689350083fa6961df07d47aca8ea9079b1f527/services/email_sender.py#L72
[d0-warm]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/blob/02689350083fa6961df07d47aca8ea9079b1f527/services/warmup.py#L136
[d0-mailivery]: https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/blob/02689350083fa6961df07d47aca8ea9079b1f527/services/mailivery_client.py#L30

Finished-At: 2026-10-06T08:42:02.565570+00:00
Elapsed: 292 seconds (including source reading, coordination and report).
Checks: 31 pinned source links resolve to existing local files/line anchors; no product tests run.
Status: completed
