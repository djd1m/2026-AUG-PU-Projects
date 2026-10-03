# I4c independent review

Verdict: REQUEST_CHANGES
Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: 845bc37900d494d0c9f44835fce651a7e646f35d
Scope: six owned product/test files, 9a65eedd11ab166d186412201a0cfc2c884c094d → 59cfb30f0cd93b8d8a1aafa366a95b2b8ea92ee7; runtime evidence at Source above. Independent sole reviewer; no delegation.

## I4c-R1 — P2 / Medium — invalid-token fixture is actually valid

**Location:** `tests/replicate-cleanup.integration.test.js:226`.

The loop replaces every cleanup environment field with `invalid` and expects an exception. The last field is `REPLICATE_API_TOKEN` (`tests/replicate-cleanup-fixtures.js:5–6`). Its accepted contract is 1–512 printable non-space ASCII bytes (`web/replicate-worker-config.js:20`), matching the unchanged worker/I2 validators. The seven letters in `invalid` satisfy that contract. The other four substitutions violate exact opt-in/model/version/contract values and throw. This establishes a fixture defect, not a production token-validation bypass.

**Reproduction:** on the frozen source, the existing PG16 log `../../telemetry/n8-20261002-1740/replicate-i4c-pg-cleanup-pg16.log` records child 12 failing with `Missing expected exception` at line 226. TAP reports 12 pass / 2 fail: one failed child plus its parent, not two independent defects. Line 227's zero-HTTP and row-conservation assertions were consequently not reached.

**Minimal fix:** keep the loop and all other green oracles; substitute an actually invalid token (empty string, space, or 513 ASCII bytes) for the token key while retaining invalid exact-pin cases. Do not tighten production validation to an unsupported token prefix/format.

**Affected checks / closure:** parent corrects the fixture, reruns the complete cleanup PG16 suite on a newly bound source, and obtains fresh independent closure. Preserve the original `overall_exit: 1` and raw failure log. The affected default-disabled/invalid-config oracle and its trailing conservation assertions must all pass before I4c acceptance. No production correction is supported by this failure.

## Scoped review results

No other confirmed defect found in the six-file slice. Read `i4c-slice-boundaries.md` and `i4c-implementation.md` first, then approved cleanup pseudocode (02:50–54,80–83) and architecture (03:24–56).

| Contract | Source/evidence assessment |
|---|---|
| Explicit opt-in, private config, existing loop | Config:16–25,43–49 uses WeakMap/WeakSet, rejects copied flags/settings for cleanup-only configs; absent/false disables. Maintenance:57,60 hooks the existing pass. Unchanged worker:37 supplies registered worker config; ordinary web remains disabled. |
| Locks, ownership, time and retention | Cleanup:16–22,37–85 takes account→job→submission then fresh clock; rechecks identity/fence/lease, claims 30s, skips none/done/unresolved. Unknown/quarantined identity and retention equality at submitting+3600s resolve unresolved without HTTP; no erasure claim. |
| Cancellation and terminal races | Cleanup:69–100 commits request flag before first cancel; later passes GET only. Observation and terminal finalization share one fenced transaction. Stale owners cannot observe/finalize; only observed canceled confirms. Crash before send remains honestly uncertain. |
| Bounded cleanup authority | Cleanup:102–134 scans once ≤100, processes serially, performs one action/row/pass; private ≤5s budget retains original deadline identity after job expiry. Only unchanged I2 GET/cancel used; no create/poll/import, output download/DNS validation, URL/opaque output return, or active-work budget renewal. Remote time is bounded; SQL/filesystem time is not a whole-pass 5s guarantee. |
| Accounting and terminal isolation | Helper writes only cleanup/provider observation fields. Actual PG tests:175–210 protect expired/deleted/held/revoked work, original attempts/tickets/deadlines/spend, no attachment/refund/evidence and terminal monotonicity. |
| Error and injection boundaries | 429/404/protocol/timeout retain needed before retention. Per-row errors collapse to counts; maintenance logs fixed safe messages. Clock injection requires runtime=test; transportOptions remains a trusted programmatic seam, unused by production maintenance and not exposed through user input. |

Actual PG barriers observe lock waits through `pg_stat_activity` (tests:95–107,144–173), then advance the explicitly injected clock to exercise post-lock lease/retention boundaries. Real authorize/bind/observe/job lifecycle creates submissions; no direct submission/evidence inserts or trigger bypass. Full before/after row snapshots plus literal assertions (74–94) meaningfully protect conservation. Mocked HTTP and synthetic time do not establish live provider behavior.

## Evidence and limits

Six `changed_product_test_files` hashes match working tree and both 59cfb30f/845bc379. HEAD, supplied review launch, author launch, spec and boundaries match. Critical protected provider/I2/jobs/config/DB/worker/schema hashes match baseline and runtime source; no old I1–I5 re-audit.

Retained logs: local 186/186, final cleanup 10/10, provider 2/2 and static pass; the 186 run includes an earlier 8 cleanup cases, so these are separate runs, not a unique-test total. Source-bound mutation is 0/1/0 with unchanged oracle SHA and restored helper SHA `41a233accd3fadecfff44fecb8692af0e47455b088c733e547509ef83f55ce6a`. Actual PG authority 16/16, lifecycle 18/18, worker 22/22, jobs 21/21 pass; environment cleanup exit0. New cleanup PG remains failed as above; no overall PG pass claim.

Profile: compact-quality-first-v2, substantive XL retained (recorded mechanical M lower bound). Author host evidence confirms gpt-6.1-sol/high, 1378.845s. Reviewer requested gpt-6-astra/high; actual model/effort/usage/cost null pending host metadata. Review duration and report digest are in the receipt.

No tests, Docker, network/provider access, credentials, installs, product edits, commits/push, run-events/global configuration changes or other model tasks were executed. Only this report and its receipt were written. Companion handoff applied; E2E not_applicable to this source/log review. External spend0; model cost unknown. Parent owns fixture fix → exact PG rerun → fresh closure, then I6–I8. Those later stages and live activation gates are not defects in this slice.
