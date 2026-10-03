# F04-B independent review

Verdict: **REQUEST_CHANGES**. One confirmed P2 defect in B's worker callback ownership; accepted A is unchanged. Single review lane, no agents. Scope: `c6cbbbfe..99c6bca75a46b6e84db91630299874eb89fd6eb7`, AC-B1–B6 and the specified B design/reuse documents. No product changes or runtime access.

| AC | Verdict | Reviewed evidence |
|---|---|---|
| B1 | ACCEPT | Dedicated hashed canonical 32-byte capability; bound job/tenant/mailbox/enrollment, expiry and campaign digest. GET only charges security counter. Strict single-field form, generic accessible confirmation, no payload scope selection; wrong-purpose/expired HTTP400 assertions. |
| B2 | ACCEPT | Shared lock is first transaction operation; expiry sampled afterward. Atomic suppression/pending cancellation and pool recipient withdrawal; sender preserved. Production stop writers tested before final commit (0 transport calls) and after (1, then 0). |
| B3 | ACCEPT | Separate configured process key, hashed constant-time comparison, no ordinary cookie grant; unsigned401, foreign/malformed400. Payload-bound event dedup and atomic recipient suppression/sender quarantine. |
| B4 | ACCEPT | Atomic fixed-minute socket-IP bucket precedes auth/token/Origin checks. 31 concurrent invalid requests assert 30 failures plus one429/Retry-After; varied forwarded headers cannot evade it. Ordinary unsafe Origin guard preserved. No-store/no-referrer and generic error handling contain no URL/key logging. |
| B5 | REQUEST_CHANGES | Durable header-only fixture, disabled default, bounded operations, explicit incomplete retry and honest 101-header tail are implemented. Delayed worker callbacks lack ownership fencing; finding B-R1 below. |
| B6 | REQUEST_CHANGES | Existing CLI seed→poll→persisted effect/cancellation, HTTP flows, full regressions and mutation evidence pass. The missing worker-level stale-callback regression must accompany B-R1's correction. |

## B-R1 — P2: delayed adapter callbacks overwrite a newer polling epoch

Location: `src/replies/worker.ts:18–19`, `:26–28`, `:40–44` (primary finding: line44).

Trigger: two authorized local poll invocations overlap, e.g. scheduled worker plus operator CLI. The first fixture snapshot remains pending; a second invocation observes a UIDVALIDITY reset and completes the newer run. When the old operation rejects, its local `run` is still null, so line44 unconditionally sets that mailbox's `scan_complete=false`, without checking run/attempt/validity. The newer rescan remains `complete` while its completion evidence is revoked by an obsolete callback. It can block dispatch until another successful poll.

A late successful old snapshot also passes directly into `capture` at line19 (and a changed tail snapshot at line28). The accepted store intentionally trusts capture input: `src/replies/store.ts:47–53` replaces the durable run whenever validity differs. Thus stale B adapter evidence can replace a newer epoch and discard its cursor/H/attempt identity; the subsequent read against the current fixture can then fail and leave the obsolete epoch incomplete. This is reachable with the implemented local fixture; no hypothetical live-provider behavior is required.

Minimal fix: fence B snapshot/capture/failure application against the durable fixture generation and polling ownership observed before the operation, atomically with the mutation. Obsolete callbacks must be no-ops; a current missing/failed fixture must still pause. Preserve A's immutable H/tailH contracts and keep adapter IO outside the eligibility lock.

Required test: deterministic barriers around actual fixture snapshot success and failure; complete a newer reset through a second worker, then release the old callback. Assert newer run ID/validity/H/cursor/attempt and completion remain unchanged, with no obsolete effects. Cover the changed-tail capture branch too. Existing `tests/suppression-integration.test.ts:147` rejects an old **page** directly; it does not exercise these capture/failure branches.

Local evidence: `astra-b-stale-probe.cjs/json` extracts the actual `poll` method and uses deferred adapter/recording SQL doubles. Exit0 confirms the unconditional late-failure UPDATE and forwarding of the old snapshot. This is a control-flow probe, not a PostgreSQL rerun; capture's overwrite behavior was inspected in source.

## Evidence and limits

`astra-b-source-evidence.json`: all 61 source files and 61 copied-input entries, plus Dockerfile/spec, match both worktree and donor `ff9692093aa21b32aa40809c2d9bf9ca4746e1cc`; no mismatches. Source/build aggregate digests recompute correctly. All 36 compiled files are absent locally, so compiled/image verification relies on the inspected author snapshot script and archived runtime evidence. Image: `aa1ce9e037d73d9ca1032d3d0f665e9cd7f7396e4cd026aa5ac26df40a59eded`. Launch/spec digests match the binding. A store and migrations006/007 have no diff; migration008 is additive.

Read actual assertions and `sol-b-heavy.txt`: unit18/18, PostgreSQL80/80, restored14/14, typecheck/lint/host+image builds and secret/canary gates recorded exit0. Mutant removed the public capability rejection: forged GET returned200 instead of400, producing assertion failures (exit1); restored source hash matches. Stop races use actual advisory-lock waiting and transport counters; rate tests assert concurrent response counts. Renderer coverage remains source-identical. No green suite/build/database/browser/network/secret check rerun.

Profile `compact-quality-first-v2`; author actual `gpt-6.1-sol/high` confirmed by `sol-b-runtime.json`. Reviewer requested `gpt-6-astra/high`; actual model/effort, review usage/cost and active-time partition remain null pending host evidence. Timing and commands are in the receipt. F05 billing/growth and F06 full cabinet browser remain outside this verdict; live providers remain disabled. No commits/push or launch/manifest edits.
