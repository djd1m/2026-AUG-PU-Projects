# F09 — независимое ревью транспортов
Reviewer family: codex
Spec revision: sha256:6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9
Source revision: 35039ad32e933d7a4d0bf0f7621f7722e5774ef6
Verdict: NEEDS_WORK
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT_ID: f09-review-a1
Profile: compact-quality-first-v2
Requested model/effort: Astra/high; actual model/effort/usage/cost: null (host_not_exposed).

Ревью ограничено согласованным F09 под OWN-N7-005. Изучены текущая спецификация, validation-report.md, scenarios.md, архитектура, реализация и реальные протокольные/PG доказательства. Выполнен дополнительный независимый локальный TLS probe. Исходный код и тесты не изменялись. Найден один подтверждённый HIGH, поэтому успешные существующие наборы не означают приёмку всех AC.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-f09-live-transport-001 | met | transport-authority.ts: отдельный scoped grant, expected-revision CAS, FIRST lock, DB expiry, tenant/config/transport_revision; f09-live-transport.test.ts: transport grants are separate scoped expiring authority. Нет authority от diagnostics/fixtures/env. |
| AC-f09-live-transport-002 | met | consent/transaction.ts FIRST advisory lock и синхронный callback перед COMMIT; dispatch/submission.ts повторяет consent/capacity/freshness/current-day quota для обоих участников. PG final live submission preserves all eligibility fences включает revokeBefore/revokeAfter, grantExpiryDuringLock, finalQueryAbort; исходные concurrency/crash регрессии завершены. |
| AC-f09-live-transport-003 | met | dispatch/smtp.ts и message.ts: TLS465/STARTTLS587, original hostname, post-TLS EHLO/PLAIN, точные phase codes, MIME/base64/Unicode bounds, persisted Message-ID; protocol-final 9/9 и PG accepted receipt без local_test_message. SMTP acceptance не объявляется доставкой. |
| AC-f09-live-transport-004 | not met | Неопределённость после body и no-retry восстановление реализованы и подтверждены; однако F09-R1: многострочная pre-body фаза EHLO длится 12010ms и завершается accepted вместо timeout в пределах 10s. |
| AC-f09-live-transport-005 | met | replies/imap.ts: EXAMINE/read-only, UIDVALIDITY/UIDNEXT, числовые окна100 UID, exact tag/literal framing, empty-tail snapshot; protocol-final подтверждает gaps, fragmentation, UID generation, NIL/missing/duplicate/out-of-range rejection. |
| AC-f09-live-transport-006 | met | replies/adapter.ts fence проверяет grant revision/expiry; worker/store сохраняют owner/current generation, captured horizon плюс fixed tail, одну транзакцию observation/effect/cursor. PG UID reset crash and replay preserve atomic stop effects и parent witness подтверждают crash/replay/semantic dedup. |
| AC-f09-live-transport-007 | not met | Durable2SMTP/4IMAP и1/mailbox сохраняют expired occupancy; exact-child proof, parser/byte/drain/TLS guards подтверждены. Но SMTP phase≤10s нарушается F09-R1; slow multiline guard отсутствует в проходящем наборе. |
| AC-f09-live-transport-008 | met | AEAD/AAD не ослаблены; tampered envelope открывает0 sockets; production constructors не выбирают fixture через HTTP/env. Typed outcomes/child stderr suppression и27-log canary scan не содержат секретов. protocol_fixture/local_test/live_provider разделены. |
| AC-f09-live-transport-009 | not met | Реальные TLS+PG, literal parent test, unit/type/lint/build/mutations существуют и прошли; независимый probe доказал несоответствие AC004/007. Требование прохождения всех восьми предыдущих критериев поэтому не выполнено. Browser not_applicable: UI не менялся. |

## Подтверждённая находка

### F09-R1 — HIGH: многострочный SMTP ответ продлевает фазу за пределы 10 секунд

Место: `src/dispatch/smtp.ts:6`, особенно строки7–8; вызовы EHLO на строках15–16, AUTH на18. `reply()` вызывает `channel.line(limit)` заново для каждой continuation line. Каждый вызов получает новый10s timeout. Общий90s budget ограничивает операцию, но не одну фазу. Для final-DATA на строке20 уже существует внешний30s budget; аналогичного ограничения pre-body ответов нет.

Независимое воспроизведение на Node v22.20.0 и точной source revision: реальный local TLS fixture отправляет после EHLO `250-fixture` на6-й секунде и завершающий `250 AUTH PLAIN` на12-й. Меняется только способ отправки ответа fixture в probe; production parser/state machine загружаются прямо из неизменённого checkout. Результат: `accepted`, `ehloElapsedMs:12010`, последовательность `EHLO, AUTH, MAIL, RCPT, DATA`. Ожидание AC004/007: остановка этой фазы примерно на10-й секунде, без AUTH/DATA, закрытие сокета и доказанное pre-body timeout outcome. Злонамеренный либо неисправный peer может удерживать один из двух SMTP slots существенно дольше обещанного phase bound, продолжая слать строки чаще10s.

Артефакты: `/tmp/n7-f09-review-a1/smtp-phase-probe.mts`, `smtp-phase-probe.log`, `smtp-phase-result.json`. Команда из корня проекта: `/tmp/n7-expanded-runtime-20261006/bin/node --import ./node_modules/tsx/dist/loader.mjs /tmp/n7-f09-review-a1/smtp-phase-probe.mts`. Probe завершился exit0; это успешное воспроизведение дефекта, а не acceptance PASS.

Узкое исправление: единый абсолютный deadline на полную pre-body фазу, включая command write/drain и все continuation lines; AUTH challenge/response не должен обновлять deadline той же фазы. Сохранить total90s и final-DATA30s, правильную классификацию bodyStarted и cleanup. Добавить реальный TLS regression с slow multiline EHLO; доказать, что без общего phase budget guard красный, после исправления нет AUTH/DATA и сокеты закрыты. Проверить также границу334 challenge. Не требуется менять grant, слоты, схему или каноническую спецификацию.

Других подтверждённых HIGH/blocker в ограниченном проходе не выявлено. Косметические находки и искусственное добирание их количества не заменяют проверяемое заключение.

## Проверенные доказательства и ограничения

Независимо пересчитаны127 исходных файлов и12 файлов финальной дельты: все совпали с непустыми `all-source-manifest.json` и `accepted-source-manifest.json` из `/tmp/n7-f09-verify-a2`. Spec SHA совпал. Результат собственного сопоставления и build binding: `/tmp/n7-f09-review-a1/independent-verification.json`; собственный build помещён только в `/tmp/n7-f09-review-a1/dist`. Первоначальная попытка найти dist в coordinator checkout была недоступным путём, не source drift; проверка заменена собственной сборкой.

Прочитаны реальные завершённые `.exit` и TAP: full PG147/147, full unit57/57, focused PG+parent6/6, protocol9/9, физический SIGSTOP1/1 с runtime124133ms и реальной задержкой свыше120s. Corrected lint/typecheck/build exit0; оба mutation harness exit0, девять отдельных mutation guards exit1 с восстановлением исходных bytes. Эти результаты взяты из завершённой коллекции A3, а не из агрегации failed receipts A1/A2. Первоначальный empty final-source-manifest и неуспешный lint сохранены историческими артефактами.

Физическое свидетельство принято как явно составное: `physical-component-composition.json` связывает неизменённые transport-slots, exact owner fixture, test function и используемую stall branch с действительно выполненным SIGSTOP. Собственно пересчитанные хеши slot module и owner fixture совпали с captured hashes; остальные127 файлов сопоставлены с финальным manifest. Поздние изменения иных optional fixture branches не меняют исполняемый stall путь. Это не утверждение полного побайтового равенства раннего и финального fixture. Повторять120s witness без относящегося к нему изменения не требуется; F09-R1 находится в другом пути.

A3 receipt: `/tmp/n7-f09-final-check-a3-receipt.md`; архив коллекции: `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/f09-final-check-a3/verification.json` в coordinator checkout. Отсутствие старого runtime PID и сохранённые terminal exits подтверждают завершение; неизвестная старая exec session не объявлена работающей. Исходные PhaseI/II exit0; patched completion exit1 сохраняет ровно8 будущих/унаследованных gaps, inconclusive0. Whole-project completion PASS не заявлен.

Местный readiness `verified_test` остаётся местным условием. Внешние providers, pilot, deployment, платные модели и billing не запускались. F10 persistent loops, F11 body context и F12 AI не являются отсутствующими требованиями этого review. Следующий шаг координатора: передать F09-R1 отдельному ограниченному исправлению, проверить относящиеся guards и обязательные checks, затем независимый корректирующий review по новой source revision.
