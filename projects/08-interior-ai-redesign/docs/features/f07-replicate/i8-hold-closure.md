# I8 hold correction — independent narrow closure

Verdict: ACCEPT. No blocking findings in the reviewed correction. This accepts only the harness correction at `400bd3dd576b9dd31c917e5683823ec494f6d8d3`, against `c0bd24c84e96049f29e64539972eb31cd25f64a2`. Whole-feature I8 actual browser and hosted-row restore remain pending and parent-owned. The previous whole-F07 conditional acceptance was not repeated.

## Scope and evidence binding

WORK_UNIT_ID: `n8-replicate-i8-hold-review`; RUN_ID: `n8-20261002-1740`.
Original launch: `docs/telemetry/n8-20261002-1740/replicate-i8-hold-review-launch.json`.
Launch SHA-256: `dd02330f9d6dd22354b6915c4afcc2467c7817dfd7dbac434a818734099e8f13`.
Specification SHA-256: `2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad`.
Architecture SHA-256: `c14c88440c537afcb1c09fe4d843c253c3e0ed4e0c904105fc3297e6fe9803b9`.

The production-code delta is confined to the harness; reviewed implementation/test paths and SHA-256:

- `scripts/ui/replicate-cases.js`: `c183d5b3190aa4a3aec29c1c140d509fbc9b23ad918dc60c609bb398d3b92bee`.
- `tests/ui-replicate-corrections.test.js`: `5599f52be39df92baeacfe65de366cc85528b026649cc038fc910732a0c7f095`; only the extraction boundary changed.
- `tests/ui-replicate-hold.test.js`: `b3f660f9221a4e5d58f8cad463bf28951246304da26d03d739f7944c42b63ef1`.

Independent hash/scope observations are in `replicate-i8-hold-review-checks.json` in the telemetry directory above. All checked author candidate/input/evidence hashes matched. Review source-diff SHA-256: `23bee9be56ff9c936df227f85501b511b81f1503164ab42c1e698faae39cf396`.

## Acceptance reasoning

The preserved original actual-PG failure is `docs/features/f07-replicate/i8-ui-1/browser.log`: `monotonic billing state`, `protect_billing_state`, and the original `replicate-cases.js:98:18` finally assignment. Its hash remains `fb8cec502a8e69e44a7b24bde615247e6760fe0bef25313af926d6decd786ed4`.

At `scripts/ui/replicate-cases.js:133`, the first DOM reservation precedes `heldPair`; at lines 37–41 the second DOM reservation precedes the first flight's POST, the helper waits for that POST's response gate, then starts the second flight. `replicate-fixture.js` claims before invoking `beforeRun`; the caller at line 136 sets hold true there. The transport awaits durable authorization and final authorization before POST (`web/replicate.js:221` and `:227`); the database transaction wrapper commits before returning. A live first claim is excluded from the next queue scan (`web/jobs.js:178`), permitting the second claim while still unheld. The hold is permanent: no false reset remains.

The held-before-send flight retains exact zero API/POST/GET/delivery assertions and one ledger release, plus the failed-job DOM and hidden comparison. The previously authorized flight retains successful private completion, canonical evidence and artifact hashes, unverified label, disabled consent/publication and publication POST404; its calls are explicitly two API calls, one POST, one GET and two deliveries. Production worker context rejects held new work while permitting the existing authorized submission under its original identity/deadline. No production, SQL, billing, admission, configuration, limit or test-oracle weakening was found.

The helper releases the response gate at line 43 before either paced DOM callback, preserving the unchanged five-second transport deadline. Finally at lines 47–49 releases, cancels and joins both flights. The gate is bounded to 15 seconds; existing transport/attempt and DB query bounds remain. No new circular wait or detached cleanup was identified. This source reasoning does not prove real DB work will finish within five seconds; deadline failure remains a runtime failure, and actual I8 is pending.

Missing/disabled configuration and deletion precede permanent hold. All five hosted check names match the baseline and run at both 1440/390; unchanged legacy42 plus hosted10 retains expected main52, with disabled2 still pending. R1 still requires matching DELETE200, handler completion and owner GET404 before releasing the gate, then no evidence/private artifacts and exactly one release. R2 still hashes canonical JSONB evidence. R3 still logs in as the existing main owner and matches ID/email. Five registrations and eight legacy plus five hosted reservations per main owner preserve 13 under account/day20, platform/day200 and existing registration limits. No semantic hold scenario was removed.

## Checks and limits

Existing author evidence was inspected, not rerun:

- `replicate-i8-hold-tests-restored-green.log`: focused23 PASS, fail0, skipped0; recorded exit0. Seven new tests exercise the actual extracted helper with programmable boundaries, including failure/expiry cleanup. Their viewport labels do not establish browser execution.
- `replicate-i8-hold-mutation-red.log` and `replicate-i8-hold-mutation.json`: reintroduced false hold reset makes the unchanged scheduling oracle fail with monotonic billing state, exit1; candidate/restored hashes match and restored focused23 are green.
- `replicate-i8-hold-build.log`: static ESM/syntax success, recorded exit0; no runtime/image build claim.
- Author protected-before/after snapshots contain2189 entries and are identical. At integrated source, only existing `events.jsonl` and `run.json` differ from that author snapshot: a correction-start event and current-stage update. All other2187 protected current files match. Thus author-stage zero drift is supported, but literal current-source2189 unchanged is not asserted.
- Reviewer code-only `git diff --check c0bd24c8 HEAD -- <three scoped paths>` returned0. Whole-delta check returned2 solely for trailing whitespace in the saved `replicate-i8-hold-source.patch:104` artifact. This is recorded, not elevated into an optional polishing finding.
- Mechanical route on the three paths returned0/S; substantive review retained inherited XL financial/private invariants. No new implementation stage. Companion preflight is `not_applicable`: source/evidence-only review. The launch existed before review; trace absence was observed before receipt creation, not asserted as an independently measured prelaunch fact.

Applied project-work-companion prepare/handoff and brutal-honesty-review evidence-only, with the owner's narrow scope overriding minimum-finding escalation. No suites, Docker, browser, DB, network, npm, provider calls, code edits, delegation, commit or push were executed by this reviewer.

## Delivery history and handoff

The analysis reached ACCEPT with no blocking findings before delivery. Per the parent continuation instruction, the original240s wrapper ended with timeout/exit124; that interruption is preserved, not relabeled successful completion. This continuation writes the existing conclusion and receipt only, without reopening analysis or running checks. The original save-by210s obligation was not met by that interrupted wrapper. The receipt timestamp records actual delivery; it does not imply the original wrapper delivered on time.

Original launch start: `2026-10-03T17:18:51.510020+00:00`. Last recorded analysis clock: `2026-10-03T17:21:43+00:00`, approximately171.490s after launch; that is an observation, not the final wrapper duration. Full launch-to-delivery elapsed is recorded in the receipt, including interruption/continuation.

Profile: `compact-quality-first-v2`; requested reviewer `gpt-6-astra/high`; reviewer actual model/effort/usage/cost null pending parent host metadata. Author runtime evidence reports `gpt-6.1-sol/high`; no reviewer identity is inferred from that. Active duration and cost remain null; no savings claim.

Parent next step: integrate this source-bound narrow ACCEPT, then perform companion source/build/environment preflight and actual main52 + disabled2 browser/hosted-row restore with fresh evidence. No new runtime acceptance, provider quality, performance, billing or restoration claim is made here.
