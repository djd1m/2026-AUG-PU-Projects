# F16 independent review receipt — review-1

Verdict: ACCEPT_WITH_CAVEATS for the bounded offline tooling source. F16 release acceptance remains NOT COMPLETE.
No blocking source-code defect was established. The mandatory full regression gate is currently failed;
this verdict does not authorize live spend, stand publication, or a roadmap completion mark.

- Run-ID: 20261003T064351Z-release-gate
- Work-Unit-ID: release-gate-independent-review
- Attempt-ID: review-1
- Source-Revision: 0c6fb48efacb7ae59ba970c0b8774083405c1ed2
- Build-Revision: none
- Launch-SHA256: f7fca09c1bea9712f768a991045c75f72d358935679a339f6ead3d7d41a4bc6b
- Implementation manifest SHA256: 58dba6fad7322f117aa412c10cbba3504a840e7302023a4867613d0c875f0c7f
- Profile: compact-quality-first-v2; inherited substantive M / mechanical S route.
- Requested model/effort: gpt-6-astra / medium, as recorded in launch metadata.
- Actual model/effort, tokens, active time and cost: null; authoritative runtime counters were not exposed to this reviewer.
- Launched: 2026-10-03T07:12:50.275562+00:00; receipt prepared: 2026-10-03T07:17:04.347819+00:00; elapsed to receipt: 254.1 seconds, within 480-second attempt.

## Independent obligations first

Before reading author completion/validation reports, read root/project CLAUDE, applicable local rules,
Specification SC-US-006-4, FR-n6b-6 and NFR-n6b-1, Completion, ADR-003/004/010/014,
and model-cost/embed/long-job contracts. Used project-work-companion for source/evidence boundaries;
E2E readiness is not_applicable to this offline review. No donor was consulted.

The independent acceptance oracle requires exactly 30 observations from 20 known and 10 unknown questions;
each unknown must actually retrieve similarity >= MIN_SIMILARITY and refuse at the model boundary.
At least 17 known answers need correct facts and expected valid citations. Partial/error runs cannot pass.
Pinned models, the existing quota gateway, attempt logging, fixed input identity and explicit authorization
must precede paid execution. API Origin headers do not establish browser CORS/CSP/CSS behavior.
NFR performance, actual stand identity, rollback and release authorization remain separate obligations.

## Source assessment and AC mapping

| AC | Independent assessment |
|---|---|
| REL-01 | Read all 30 questions against the 10 fictional corpus paragraphs. The 20 facts are supported; the 10 named missing details are absent. Exact 20/10 validation and frozen hashes exist. Live similarity eligibility remains unmeasured. |
| REL-02 | CLI requires explicit live/seed grant, real service DB role, key, threshold and seven limits. It delegates to createLiveGateway/answerQuestion, with one bounded corpus batch and at most 30 sequential questions; no provider bypass or retry. Real model/provider constants remain unchanged. |
| REL-03 | scoreRun requires complete unique observations, all 10 high-similarity model_unknown outcomes, and >=17 term/citation checks. below_threshold and invalid_citation cannot replace a hard negative. main also requires no execution failure and a successful complete ledger. |
| REL-04 | Read real register/bots/jobs/publish/widget contracts: 201/session, 202 and UUID/public IDs, public job state mapping, PATCH publication, widget query IDs, exact CORS and badge302/ref align. Explicit base/source/foreign origin and owner DB are required; no silent localhost fallback. |
| REL-05 | Existing evidence supports 37 focused passes, typecheck success, a failing similarity mutation and restored green result. Full regression evidence is failed; see V-1. No new tests or runtime probes were executed by this reviewer. |
| REL-06 | calibration-report and completion accurately retain NOT_EXECUTED live/stand/browser/rollback gates and distinguish seeded corpus from actual website crawl. Historical contract receipts were not upgraded to current stand evidence. |

SQL cross-check: scripts/calibration/live-store.ts uses existing account/bot/source/document/chunk columns,
required defaults, compatible composite foreign keys and unique locators. withService issues SET LOCAL ROLE
n6b_service; migration 002 grants its reads/writes and BYPASSRLS. Account is_test is inserted and checked.
CJM owner SQL matches account/email/bot/model_call_log; marking occurs before indexing is queued.
This is static compatibility evidence, not a PostgreSQL execution proof. The new SQL helper has no real-PG
execution evidence in the supplied focused tests.

Accounting cross-check: the existing gateway reserves quota before calls and logs attempts; the tool retains
call IDs/states/tokens, account/global quota rows and question logs. Global rows may include other work, as disclosed.
Unknown usage/cost stay null. Corpus token/byte limits, overall 1200-second hard deadline, provider deadlines,
DB timeouts and pool shutdown bound ordinary operation. Timeout reports preserve failure/unknown inflight outcome;
test fixtures persist as is_test evidence, and this review does not claim fixture deletion.

## Findings and caveats

**V-1 — Medium, verification blocker, not an established product regression.**
Location: tests/artifacts/release-gate/offline-full-unit.txt:105 (root cause at line 116),
services/worker/tests/unit/boot.test.ts:33 and six related assertions.
The supplied coordinator full unit run ended exit 1: 44 files passed, 1 failed; 676 tests passed, 7 failed.
Every failed worker boot case reports ERR_MODULE_NOT_FOUND for /app/node_modules/@n6b/db/dist/index.js,
before reaching the configuration refusal it is intended to test. The log reproduces the missing-runtime-module
condition; 37 new focused tests passing does not close the full-suite requirement.
Next owner: coordinator. Restore/build the required workspace dist exports in the exact source-bound test
runtime, preserve this failed attempt, and rerun the mandatory full suite with a fresh receipt.
Do not classify this log as green or infer a production-code regression without the repaired-runtime result.

**C-1 — Real-PG and external gates remain open.** Static SQL/role review found no mismatch, but cannot establish
execution. Authorized live calibration with frozen hashes, actual deployed-base CJM, foreign-host browser proof,
rollback and current spend/job/embed receipts remain mandatory. NFR-n6b-1 performance is not demonstrated by
per-case elapsed fields or the small seeded corpus. No release acceptance follows from this source review.

**C-2 — Semantic scoring needs the documented human review.** Location: scripts/calibration/evaluate.ts:68.
Term matching detects wrong values such as 1200 vs 120 but cannot reject every contradiction: an answer containing
“not 120 credits” can satisfy K01's terms with a valid citation. This is a disclosed limitation of the agreed
keyword/value guard, not a claim of semantic correctness. The coordinator must review actual answers for
contradictions and unsupported additions before accepting SC-US-006-4; a tool exit 0 alone is insufficient.

## Evidence identity and scope

Read-only SHA verification matched all 20 author files and all 7 unchanged inputs to the implementation manifest;
manifest and launch digests match the brief, and HEAD equals Source-Revision. All author files are below 500 lines.
The baseline-to-source diff leaves product runtime modules, public gateway, schema and dependencies unchanged;
new executable code is confined to the release tools and their test.
Evidence inspected: focused-tests.txt, typecheck.txt, mutation.txt, native-cli.txt, implementation-source-hashes.json,
offline-full-unit.txt, offline-exit.txt, offline-start.txt and offline-finish.txt under tests/artifacts/release-gate/.
Author native CLI evidence records exit 2 for missing prerequisites and shell syntax exit 0. Mutation evidence
records red exit 1 and exact restoration green exit 0; the later focused suite contains 37 passing tests.
The supplied F15 646-unit/310-PG/build/UI baseline is historical and was not independently rerun here.

No network, secrets, paid calls, Docker, ports, child agents, product edits, new probes, commit or push.
Only docs/features/release-gate/08_review.md and the assigned terminal receipt were written.
Telemetry ownership and continuation remain with the coordinator at
/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/.
Review completion means the offline assessment was delivered; unresolved gates are explicitly retained.

Status: completed
