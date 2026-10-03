# I6a — actual send-CAS mutation author handback

RUN_ID `n8-20261002-1740`; WORK_UNIT_ID `n8-replicate-i6a`; ATTEMPT_ID `replicate-i6a-1`.
Source `714901f6c59f0e6e51d5d0033eed8943020ccc4c`.
Specification SHA256 `2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad`.
Launch SHA256 `6dc626e3dafb37899297c1a627ad8cb35166faf3c7bff977b901b25fc921e55f`.
Ownership/AC/proof plan: `i6-slice-boundaries.md`, read in full before authoring.
Approved XL F07 scope retained; owner autonomy and external spend0. One author,
requested Sol6.1/high, no delegation, other model CLI, provider call or real PG run.
Profile `compact-quality-first-v2`; actual model/effort/usage/cost remain null until host evidence.

## Implementation and oracle

`tests/replicate-send-cas.integration.test.js` uses actual PostgreSQL16 transactions,
jobs.reserve/claim, provider-submissions.authorize/finalAuthorize and I2 transport.create.
Only HTTPS is mocked using unchanged accepted `mockBoundary`. Existing `privateFixture`
is reused; its local upload bytes become WebP with private_key=id to satisfy real constraints.
No submission row is directly inserted and no DB trigger is bypassed or modified.
Model/version/contract, private source/transmitted hashes and prepared immutable request
are pinned through production preparation. Real spend-envelope fixture ceiling permits
the mutant's second reservation without changing production accounting.

The first actual POST signals a gate and waits for a shared response release. The test
reads the committed submitting row (no prediction ID), then invokes actual transport.create
again using exactly the same authority, claim, fence, attempt, ticket, prepared handle,
request hash and budget/original deadline. A deterministic Promise.race waits for the
second invocation's settlement or its HTTP entry. The unchanged assertion
`F07-CAS exactly one create POST` expects1; actual2 is the only decisive mutant failure.
There is no timing sleep. Gate waits are3s, pending cleanup10s, test90s, runner process120s;
these are failure bounds, not delays. Finally releases held responses, aborts transport
requests and awaits their caught outcomes before schema cleanup.

Both real authorities share one timestamp sampled from PostgreSQL using their existing
test-only trustedClock API. Thus a mutant submitting→submitting update preserves the
original submitting_at exactly. DB immutable identity/state triggers remain active.
Baseline asserts unchanged whole job/tickets/counters/credit ledger, original submission
identity/deadline and exactly300000 reserved microusd before and after the second call,
then lets the first response bind normally. A separate normal regression injects the
first response error, verifies durable ambiguous state, invokes create again and requires
zero additional POST with identical accounting and submission row.

The new runner kind removes exactly one early state-no-replay precondition and exactly
one CAS WHERE state='preflight' guard in the disposable provider-submissions.js only.
Exact replacement counts reject drift. finalAuthorize, I2, triggers and accounting are
unchanged. Existing runner kinds keep their previous paths and default invocation behavior.
New-kind recognition requires exit1 and exactly one failed leaf with the named ERR_ASSERTION,
strictEqual, expected1/actual2, no cancellation or skip. Additional DB/syntax/error leaves
are inconclusive. Runner unit assertion probes are explicitly synthetic, not real PG proof.

## Exact parent CLI and evidence API

Run from the PROJECT root inside the parent's already-owned cached Node22/PG16 environment,
with TEST_DATABASE_URL already securely supplied and N8_TEST_DB_OWNERSHIP=n8-f07-replicate.
Source and resolvable existing node_modules must be read-only; temporary project copy and
separate evidence mount writable. Create only the evidence parent directory; the leaf below
must be absent. No URL, password or environment dump belongs in the command or logs.

```sh
node scripts/mutation.js replicate-send-cas /evidence/replicate-i6a-1
```

Use the container's actual Node22 executable; local author executable was `/tmp/n8-node22`.
The CLI requires the explicit absolute evidence-directory argument before creating its
temporary project. It copies existing web/db/scripts/tests/package files, links read-only
dependencies, runs baseline, mutates only the copied source, runs mutant, restores original
source bytes and reruns the identical test. Evidence leaf is created exclusively (existing
directory/symlink rejected). Success CLI exit0 prints baseline0/targeted1/restored0/SHA identical.
Failure CLI exit1 reports a bounded runner reason; inspect the preserved evidence.

API, only for an already-disposable project directory:

```js
await verifyMutation(disposableProjectDir, 'replicate-send-cas', {
  evidenceDir: '/evidence/replicate-i6a-1'
}); // returns 1 only after targeted red + restored green + identical hashes
```

The evidence directory preserves `baseline.log`, `mutant.log`, `restored.log` and
`receipt.json` before temporary-copy removal. Receipt records source/test/runner paths and
SHA256, mutant/restored source SHA256, restored test/runner SHA256, each raw log SHA256,
exit/signal/spawn error code, UTC start/end, targeted_red/restored_green/identical and verdict.
A baseline/guard failure cannot produce a mutant log; its available failure/restored logs
remain preserved and cannot count as acceptance. Syntax, DB, timeout or residual guard
failure is inconclusive; do not widen mutation scope to manufacture red.

## Checks and pending work

Author checks: Node22 runner units8/8; new PG test syntax exit0; scripts/check.js exit0;
git diff --check exit0;49 protected web/DB/fixture/package files match initial and accepted
source hashes; spec/launch exact digests match. Initial units7/8 failure was a recognizer
bug: passing TAP blocks were counted as failed leaves. The original failure log is retained;
the corrected run8/8 includes nested TAP, mixed infrastructure failure, timeout/spawn refusal,
exact source-replacement drift and inconclusive restoration/raw-evidence checks.
CLI without evidence argument exits1 with mutation_evidence_directory_required (expected).

Telemetry/logs/snapshot/receipt: `docs/telemetry/n8-20261002-1740/replicate-i6a-*`.
Snapshot product_test_files paths are PROJECT-relative and bind the exact three substantive
implementation files; protected hashes, source/spec/launch and diff digest are included.
Companion preparation/handoff applied minimally; E2E preflight not_applicable because
this author stage performs no PG/E2E. No runtime acceptance is claimed.

Parent remains responsible for actual baseline GREEN → decisive mutant RED → identical
restored GREEN on real PG16 and fresh independent Astra review. Any remaining redundant
guard must be reported inconclusive with its exact finding. Then I6b mock UI/env/compose,
I7 full regression/docs and I8 actual shared-Docker UI remain required. Paid activation,
real provider quality/performance/cost and publication remain unauthorized/pending.
