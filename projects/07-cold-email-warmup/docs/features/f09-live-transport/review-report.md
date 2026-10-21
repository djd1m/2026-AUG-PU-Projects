# F09 — независимый корректирующий review R2
Reviewer family: codex
Spec revision: sha256:6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9
Source revision: e043bb270a8dec50d2e090379ffff5f655a3461f
Verdict: ACCEPT
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f09-review-r2
Profile: compact-quality-first-v2
Requested model/effort: Astra/high; actual model/effort/usage/cost: null (host_not_exposed).

Независимо проверено узкое исправление подтверждённого F09-R1: diff35039ad3..e043bb27 содержит только smtp.ts и два существующих protocol fixture/test файла. Все девять критериев выполнены в согласованном локальном объёме F09. Неуспешный по времени review-a1 и его исходные доказательства остаются неизменёнными историческими артефактами; этот новый review устанавливает текущую приёмку отдельно.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-f09-live-transport-001 | met | transport-authority.ts: отдельный scoped grant, expected-revision CAS, FIRST lock, DB expiry, tenant/config/transport_revision; f09-live-transport.test.ts: transport grants are separate scoped expiring authority. Нет authority от diagnostics/fixtures/env. |
| AC-f09-live-transport-002 | met | consent/transaction.ts FIRST advisory lock и синхронный callback перед COMMIT; dispatch/submission.ts повторяет consent/capacity/freshness/current-day quota для обоих участников. PG final live submission preserves all eligibility fences включает revokeBefore/revokeAfter, grantExpiryDuringLock, finalQueryAbort; исходные concurrency/crash регрессии завершены. |
| AC-f09-live-transport-003 | met | dispatch/smtp.ts и message.ts: TLS465/STARTTLS587, original hostname, post-TLS EHLO/PLAIN, точные phase codes, MIME/base64/Unicode bounds, persisted Message-ID; protocol-final 9/9 и PG accepted receipt без local_test_message. SMTP acceptance не объявляется доставкой. |
| AC-f09-live-transport-004 | met | dispatch/smtp.ts сохраняет bodyStarted/unknown и no-retry. F09-R1 закрыт: общий10s budget для command/write/drain и полного ответа, включая AUTH334; независимый TLS probe остановился10006ms, только EHLO, pre_data_transient/no_data_submitted. |
| AC-f09-live-transport-005 | met | replies/imap.ts: EXAMINE/read-only, UIDVALIDITY/UIDNEXT, числовые окна100 UID, exact tag/literal framing, empty-tail snapshot; protocol-final подтверждает gaps, fragmentation, UID generation, NIL/missing/duplicate/out-of-range rejection. |
| AC-f09-live-transport-006 | met | replies/adapter.ts fence проверяет grant revision/expiry; worker/store сохраняют owner/current generation, captured horizon плюс fixed tail, одну транзакцию observation/effect/cursor. PG UID reset crash and replay preserve atomic stop effects и parent witness подтверждают crash/replay/semantic dedup. |
| AC-f09-live-transport-007 | met | Неизменённые durable slots/child proofs/parser/TLS bounds подтверждены прежним физическим SIGSTOP и mutations. Новый общий phase budget закрывает slow multiline нарушение; EHLO/AUTH guards проверяют отсутствие MAIL/DATA и sockets0. |
| AC-f09-live-transport-008 | met | AEAD/AAD не ослаблены; tampered envelope открывает0 sockets; production constructors не выбирают fixture через HTTP/env. Typed outcomes/child stderr suppression и27-log canary scan не содержат секретов. protocol_fixture/local_test/live_provider разделены. |
| AC-f09-live-transport-009 | met | Новая точная source/build binding, affected TLS+parent12/12, type/lint/build0, два новых guards красные на старом smtp.ts и зелёные после восстановления. Неизменённые full PG147/unit57/physical1 и девять safety mutations сохранены с явным source composition. Browser not_applicable. |

## F09-R1 — закрыт

`src/dispatch/smtp.ts:11` вводит exchange через существующий TransportBudget.phase: одна внешняя10s граница охватывает command, write/drain и полный многострочный reply. Greeting также обёрнут общим budget; AUTH на строке19 целиком оборачивает начальную команду,334, ответ и235. Внутренние line timers не продлевают внешнюю фазу. При её истечении catch/finally закрывают канал; sealed channel запрещает продолжение оставшейся асинхронной ветви. Новый timeout engine не создан.

Total90s и final-DATA30s сохраняются; bodyStarted выставляется до body write. Классификация pre-body timeout с no_data_submitted, post-body ambiguity/rejection/acceptance и release через child lifetime не изменена. Общий phase budget включает backpressure через await channel.command. Нарушение не повторилось: независимый скопированный исходный real-TLS probe вернул pre_data_transient через10006ms, список команд только EHLO. Старый probe/results не перезаписаны. Это бюджет времени выполнения; миллисекундная задержка доставки таймера не является разрешением следующей SMTP фазы.

Два авторских guard проверяют slow EHLO и AUTH334: итоговые elapsed10012/10018ms, pre_data_transient с proof, MAIL/DATA0, sockets0. Возврат точного старого smtp.ts дал оба красных результата accepted около12s; mutation harness0, original bytes восстановлены. Неподтверждённых новых находок или косметических требований не добавлено.

## Источники и проверки

- `/tmp/n7-f09-review-r2/`: независимые source-verification.json, build-verification.json, build.log, smtp-phase-probe.mts/log и smtp-phase-result.json. Source manifest125 файлов пересчитан без расхождений; отдельная сборка размещена только в reviewer /tmp и сопоставлена с текущим build manifest.
- `/tmp/n7-f09-review-fix-a4/`: реальные terminal exits affected-final/typecheck-final/lint-final/build-final=0; affected-final12/12 включает literal parent `ambiguous SMTP and UID reset preserve recovery safety`. mutation-old-phase exit1, mutation-run0; candidate/restored SHA совпадают. Secret canary scan11 logs, hits0.
- Неизменённые результаты предыдущей полной проверки: PG147/147, unit57/57, focused PG6/6, прежние protocol9/9, физический SIGSTOP1/1 свыше120s, девять safety mutations red/restored. Источники: `/tmp/n7-f09-verify-a2/` и завершённая независимая коллекция `/tmp/n7-f09-final-check-a3-receipt.md`; failed A1/A2 receipts не превращены в успешные.
- Физическое доказательство остаётся составным: transport-slots, child/lifetime, owner fixture, physical test и исполняемая TLS stall branch не изменены. Новые optional slowEHLO/AUTH fixture ветви не исполняются при stall; пустой timers Set и его cleanup не меняют физическую проверку. История точных component hashes сохранена в physical-component-composition.json и unchanged-components.json. Повтор неизменённого120s теста не требовался.

Полный первоначальный source review и его ограничения сохранены в архиве `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/f09-review-a1` coordinator checkout; коммит4cea1252. Текущая проверка сопоставляет узкий diff и новое выполнение с теми неизменёнными компонентами, а не заявляет повтор всех наборов. PhaseI/II ранее exit0; patched whole-project completion сохраняет8 будущих/унаследованных gaps и не объявлен PASS.

Приёмка означает локально проверенный F09. verified_test не считается live proof; fixture receipts остаются protocol_fixture. Нет UI изменений, browser not_applicable. Внешние providers, pilot, deployment, paid models не запускались. F10/F11/F12 остаются следующими стадиями. Координатор принимает эту ревизию, интегрирует отчёт и продолжает F10; незакрытых обязательных замечаний F09 нет.
