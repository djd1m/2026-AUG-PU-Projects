# N7 mail library prototype — normative planner packet

Plan v1, 2026-10-07. Owner authorization covers a small isolated local prototype only. This packet is sufficient for the author and a fresh independent reviewer; no author history is required.

## Identity and authority

- RUN_ID: `20261007-mail-library-prototype`; coordinator metadata: `/tmp/n7-client-library-assessment-20261007/prototype-run.json`.
- Exact isolated worktree: `/tmp/n7-mail-library-prototype-20261007`, branch `work/n7-mail-library-prototype-20261007`, base `04ccbb65b0fb78dafecc1ab09106a09c5d267fe4` (coordinator-provided binding).
- Sole author-owned directory: `/tmp/n7-mail-library-prototype-20261007/projects/07-cold-email-warmup/experiments/mail-library-prototype/`. Existing selected N7 worktrees are read-only donors. Do not create another worktree or copy a full checkout/node_modules.
- Frozen candidate reference: `/tmp/n7-f11-context-20261006-a1`, commit `b6e8ae16e8feb6c67888eb2f006cfbb299b40197`. Read donor source through `git show <commit>:projects/07-cold-email-warmup/<path>`; its working tree can drift. This is a candidate, not an accepted product baseline.
- Profile `model-routing-econom`: separate planner Sol6.1/high, author Sol6.1/medium, fresh reviewer Sol6.1/high with `fork_turns="none"`. Requested settings are not actual-model proof; unknown host usage/model fields remain null.
- Substantive ROUTE: L for new transport boundaries and network/TLS safety; full PLAN → VALIDATE → IMPLEMENT → REVIEW, confined to this experiment. Mechanical router remains a lower bound and coordinator records its actual command/result before implementation. No assertion that the product has been migrated.
- No live providers/email, payments, public preview/deployment, external accounts/credentials, database connection/reset/migration, Docker pulls, shared services, root manifests, global config, or scheduler changes. Dependency downloads, if already authorized by the coordinator, are only pinned npm packages into this directory.

## Bound source and normative decisions

Read root and selected project CLAUDE, applicable `.claude/rules/{security,secrets-management,testing,coding-style}.md`, `docs/development/model-routing-econom.md`, F09 `03_architecture.md` and `capability-contracts.md`, and expanded MVP `01_specification.md` §matched incoming limits. The donor F09 architecture's historical native-only dependency decision remains valid for active product source; the owner's new permission allows this separate experiment, not a silent canonical change.

Assessment: `/tmp/n7-client-library-assessment-20261007/assessment.md`, SHA256 `062c23126156f3a00b5001c00eb0847befe81a0013ff4f99be4898b126e3f270`. Package source receipt SHA256 `68a11f40840c02fd684fa1b8337147ea72f551d66c4c2b3b0842afd43afa5371`; N7 source receipt SHA256 `af29e9363970d09221f2275a58dc670fb7d55005177f23e265c2b44eb10f8bad`. These are read-only npm source inspections, not runtime passes or security audits.

Pin exact `imapflow@2.2.6` and `nodemailer@10.0.15`; preserve a private experiment lockfile, npm integrity, direct/transitive resolved versions and license names. Use the published package public exports that actually exist in this version; no guessed legacy deep import, private parser/`_action*` patch, or fork. Install with lifecycle scripts disabled; no broad toolchain or fixture-server dependencies. Existing protected Node binary `/tmp/n6b-f06-node22/bin/node` is coordinator-measured v22.22.3; use it without copying/installing/deleting. Record this difference from the N7 documented Node22.20.0 target. Native loopback fixtures can use existing OpenSSL3.0.13 for ephemeral certificate generation.

Frozen donor limits: imap.ts uses 30s total, numeric UID windows ≤100, UIDVALIDITY+UID identity, authenticated UIDNEXT snapshot horizon, EXAMINE/read-only and BODY.PEEK; channel uses total receive ≤1MiB and pending buffer ≤128KiB. body.ts uses metadata ≤8192B and plain text ≤32768B, unsupported/oversized data held. Preserve these as the compatibility envelope; do not replace them with a library default. DB cursor/dedup/stop-first/privacy/TTL processing are excluded and must remain unclaimed.

## Small implementation and attempt budget

At most eight tracked files in the experiment: `package.json`, `package-lock.json`, `.gitignore`, `fixture.mjs`, `imap.mjs`, `smtp.mjs`, `test.mjs`, `README.md`. Use native Node tests/assertions and standard net/tls/child_process; no new test engine. Modules <500 lines. README records setup and actual verdicts, not duplicate product canon. Raw results, source digests and the coordinator's receipts stay in existing N7 evidence/run locations or the explicitly allocated `/tmp/n7-client-library-assessment-20261007/` staging location. Ignore node_modules, raw logs and key directories.

One MEDIUM attempt: 15min work +3min seal/cleanup. Suggested allocation: 2min setup, 7min ImapFlow gate, 5min Nodemailer gate, 1min final assertions. Prioritize a decisive ImapFlow witness over breadth. Never extend the same attempt silently. At the boundary seal source/results, record remaining AC and exact diagnosis; coordinator owns any next bounded correction attempt. Successful unchanged tests are not rerun without changed source or a specific concern.

Before install and each heavy run record `df -B1` free space plus experiment/cache/output `du` and check again afterwards. Last coordinator measurement 06:50:05 UTC: 3,938,045,952B free. Warn coordinator immediately below 2GiB; stop an install/heavy step that could cross that floor. Combined newly created dependency/cache/output footprint ≤100MB, excluding already-existing read-only donors. Dedicated npm cache under the experiment counts toward this cap. No huge literal file: stream a reused small buffer; cap raw logs to concise scenario/result data.

## Common fixture and lifetime gate

Bind owned fixture listeners to `127.0.0.1` and ephemeral ports only. Generate fresh private keys in a unique `/tmp` fixture directory, mode0700 and files0600; never include keys in Git, logs, receipts or output archives. Public certificate/CA PEM is permissible; clean owned temporary key files after confirmed test/child exit. Never reuse a donor fixture private key. Synthetic PLAIN credentials remain local and absent from transcripts including their base64 form; log only safe command classes and numeric outcome data, never arbitrary server text or body.

Use one bounded library client in an exclusively owned child per operation, no socket transfer/descendants. The parent records exact ChildProcess identity and native exit/close events; do not equate `killed`, destroy request, library close event or LOGOUT response with physical closure. Fixture tracks accepted and closed raw connections. At operation completion/abort require sealed outcome plus peer close and exact child exit, zero surviving owned sockets/listeners/timers; bounded cleanup uses ≤5s graceful then SIGKILL and ≤5s exact exit wait. Missing proof is FAIL, never reclaimed capacity. These are local ownership witnesses only, not DB-slot integration acceptance.

Certificate verification stays enabled, minimumTLS1.2. Fixture CA is injected only into trusted test construction. Dial a chosen numeric IP and keep original hostname as SNI/default certificate hostname verification. No automatic second DNS resolution, proxy, provider preset, OAuth/LOGIN fallback, or TLS validation bypass. Positive witness: valid `fixture.invalid` certificate plus numeric127.0.0.1 dial with `fixture.invalid` SNI. Negative witnesses: mismatch hostname/untrusted CA fails before credentials, resolver/endpoint changed after pin still reaches only originally selected loopback peer; no attempt at a non-loopback endpoint. Local-only pinning proves the mechanism, not the product provider allowlist/public-IP policy.

## Gate I — ImapFlow first

Configuration: readOnly mailboxOpen/lock, disableAutoIdle, disableCompression, logger=false/logRaw=false; one instance per bounded operation, no persistent connections/IDLE. Fetch using `uid:true` with a numeric finite range; finish the async iterator before another command. Library mailbox lock is not a DB lock.

| AC | Required oracle |
|---|---|
| I1 read-only UID snapshot/header | Fixture observes EXAMINE and UID FETCH with BODY.PEEK, never SELECT/STORE/EXPUNGE/body mutation. Authenticated UIDVALIDITY/UIDNEXT determine fixed horizon; sparse UIDs return correct identity independent of sequence numbers, coverage advances only on complete tagged OK. |
| I2 malformed/changed UID | Changed UIDVALIDITY returns explicit reset outcome; duplicate/out-of-range UID or truncated/no-tag completion yields rejection and no claimed page/cursor. Missing UID is valid sparse coverage only after tagged OK. |
| I3 bounded partial body | Request metadata/text partials with explicit start/maxLength. Normal server produces metadata≤8192B/text≤32768B; unsupported MIME/oversized metadata or response is held/rejected, no implicit whole-message/attachment fetch. Transcript proves selected PEEK part and partial limit. |
| I4 hostile literal memory | Test both an advertised64MiB literal with only a bounded prefix sent, and a server ignoring partial maxLength and streaming reused16KiB chunks toward8MiB. Stop receive beyond1MiB; never materialize attacker-sized file/buffer. Sample child rss/heapUsed/external/arrayBuffers before and during attack; record peak and delta. Local witness requires peak growth≤32MiB, timely rejection, and closure. A size guard must act before oversized literal allocation/accumulation through a supported public path. A successful ordinary partial FETCH or an RSS sample alone cannot prove this property. No supported enforceable cap, unobserved allocation, timeout-only response, or private-parser patch => I4 FAIL/conditional adoption rejected. |
| I5 abort/deadline/close/pinning | Abort stalled connect/auth/literal and trickled literal at test-scaled≤2s wall deadline; assert no late page publication and physical close/exit within cleanup budget. Run common positive/negative TLS pinning gate. |

Use one direct guard mutation: deliberately remove readOnly/partial/range rejection in a temporary source copy and require the related assertion to fail; restore and bind the final source. Do not mutate the lockfile or ship the mutation. Keep a raw per-AC pass/fail/unknown plus command, exit, elapsed, bytes and memory witness. If I4 fails, record exact blocker and freeze it; do not build a generic parser or repeatedly polish. Nodemailer can still be assessed independently, but combined replacement is not recommended on that result.

## Gate S — Nodemailer after recorded Gate I

Use no pooling and one envelope recipient, PLAIN only after verified TLS, raw synthetic MIME≤64KiB, disableFileAccess/disableUrlAccess and logging disabled. Start with SMTP transport/connection public exports only. Keep stable synthetic Message-ID and unsubscribe headers, UTF-8 payload, leading-dot line. Raw MIME has no SMTP terminator and no pre-applied dot stuffing; fixture de-stuffs once and compares exact decoded message bytes. MIME composer migration is excluded. Overall90s/final DATA30s product limits remain normative; local test deadlines may be≤2s with the same phase behavior.

| AC | Required oracle |
|---|---|
| S1 TLS/auth and MIME | Implicit TLS and required STARTTLS witnesses; no plaintext AUTH; mismatch/untrusted certificate no auth/body. Fixture receives exactly one message/recipient, stable headers/body and correct dot escaping. Common numeric-IP/SNI pinning witnesses pass. |
| S2 pre-DATA classification | Disconnect after RCPT before354, valid DATA refusal before body,4xx and5xx each return explicit non-accepted classification; fixture confirms zero body bytes. Fail closed if the API cannot distinguish phase. No automatic reconnect/send retry. |
| S3 post-DATA uncertainty | Drop during body and after terminator before final250 => ambiguous/unknown_delivery. Fixture records phase/body bytes; one send call, one attempt, no retry. `error.command=DATA` alone is insufficient evidence. Unknown would retain quota in later integration; this prototype does not exercise quota DB. |
| S4 final acceptance | Only complete final DATA250 is accepted; MAIL/RCPT250 alone and malformed/truncated final reply are never accepted. Explicit post-DATA4xx/5xx is rejection, with no automatic retry. Distinguish accepted by server from inbox delivery. |
| S5 abort/deadline/close | Stalled/trickled connect/auth/body/final response, abort before and during body; no late accepted publication except an already observed complete final250. Demonstrate exact owned connection close and child exit; non-pooled transporter.close() alone cannot pass. |

A supported public phase witness or conservative all-uncertain classification is mandatory. If a safe pre-DATA distinction is unavailable, record compatibility FAIL/conditional, not an invented safe-retry label. Use one guard mutation changing post-DATA unknown to accepted/safe retry; scenario must fail. One recipient/no pooling/no retry is directly observed through fixture counts.

## Freeze, independent review and verdict

Seal SHA256 of all eight tracked files, lock/dependency versions/integrities, public certificate only, exact runtime binary/version, per-AC raw JSON and native test output with exits, elapsed, socket and memory measurements, disk before/after, actual requested/actual model/effort and unavailable usage/cost fields. No secret material. Run the complete small prototype suite, syntax/module-load check and secret diff scan; an unchanged active N7 source needs no shared product/DB/browser suite for this scope. Existing product regression, consent/quota/tenant mutations,300s healthy/fault cadence workloads/ALL30/HEADER≤30s remain mandatory for any later integrated acceptance and are explicitly not established here.

Fresh HIGH reviewer receives only this normative plan and its SHA/provenance, frozen implementation/lock/public certificate and raw test/measurement evidence. Do not transmit author chat, author narrative, working notes, intermediate coordinator history or a claimed PASS as the review oracle. Reviewer checks required AC and failure-capable assertions, re-executes targeted witnesses only for missing/contradictory evidence. Independent review budget8min; fixes only for confirmed findings in a bounded new MEDIUM attempt.

Verdicts are per library: PASS(local prototype compatibility), FAIL(concrete violated AC), or INCONCLUSIVE(missing evidence). Unknown mandatory AC blocks PASS. A passing ImapFlow gate does not waive SMTP, and vice versa. Combined recommendation requires both complete gates and independent review; even then product integration requires a separately scoped/authorized next step. No claim that libraries fix N7 scheduler cadence, F11 privacy/TTL/stop-first/DB invariants, performance or costs. Report measured findings and footprint; savings are not established.

Planner stage readiness: `not_applicable` for E2E because no implementation is executed here. Author/coordinator record a read-only fixture preflight immediately before runtime tests: exact frozen source, runtime, loopback inputs, commands as data, expected owned side effects and evidence destination. Completed planning is not completed prototype or product delivery.
