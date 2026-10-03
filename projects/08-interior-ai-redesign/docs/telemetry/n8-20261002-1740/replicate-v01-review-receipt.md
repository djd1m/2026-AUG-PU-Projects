# Terminal receipt — F07-V01 narrow revalidation

Verdict: ACCEPT/CLOSED (design-contract finding F07-V01 only)
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-v01-review
Attempt-ID: replicate-v01-review-1
Source: 8ce5b84d53618a807b8177179a9820b05445e812
Project root: /tmp/n8-replicate-plan/projects/08-interior-ai-redesign
Trace path: /tmp/n8-replicate-plan/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-v01-review-receipt.md
Launch: /tmp/n8-replicate-plan/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-v01-review-launch.json
Launch SHA256: e49368220470cb368acfeb2596c993b9913fa6443bacc04ae8cadd8c0304d752
Trace prelaunch state: absent (launch declaration and worker existence check before writing)
Launch created at: 2026-10-03T06:58:04.002717+00:00
First worker clock observation: 2026-10-03T06:58:18Z
Terminal receipt time UTC: 2026-10-03T07:00:44.153150+00:00
Elapsed from launch creation: 160.150 seconds (includes launch-to-worker delay; inference-only duration unavailable)
Budget: hard180s; required terminal report and receipt by145s. Timing check: FAILED — receipt written at160.150s from launch creation, 15.150s late; within hard180s. Review artifacts and gates completed; timing requirement was missed.
Profile: inherited compact-quality-first-v2 / XL; narrow correction review only.
Requested model/effort: gpt-6-astra/high.
Actual model/effort: null; host proof unavailable. Requested identity is not asserted as measured execution identity.
Usage/tokens/cost: null, unavailable; paid calls: 0.
Delegation: none. Network/research/product tests: none.

## Checks and result

- Direct send-CAS mutant contract: ACCEPT. Same stored submission/attempt/identity; changed authorization guard can permit the second POST; unchanged exactly1 transport oracle fails at count2. Only concrete redundant reachability precondition bypass allowed. This is static plan reasoning, not an executed implementation mutant.
- Recovery race remains separate: POST1, release≤1, unchanged ticket. BaselineGREEN/intended assertionRED/restored digest/restoredGREEN are required future implementation evidence.
- Installed vendor1.13.2: report-revision PASS and criterion-scenarios PASS, features1/gaps0/inconclusive0, exit0. Exact argv/cwd/times/checker hash and output are in `replicate-v01-review-1-evidence/report-gate.json` and `report-gate.log`.
- Own unique composed view contains byte-exact current five documents and updated report; hashes rechecked after gate. Checker digest matches prior installed evidence.
- Source HEAD matches launch; five role documents and correction unchanged from source. Initial validation report preserved byte-exact from source. Reconstructing the original report by removing only closure paragraph and reverting the first verdict/source headers succeeds; score, exact AC/scenario table, specification SHA, BDD and historical findings are preserved.
- No implementation, E2E, real pilot or full-MVP acceptance claimed. No run/events/root/canonical design-document edits, commit or push.

## Current artifact SHA256

- `docs/features/f07-replicate/01_specification.md`: `2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad`
- `docs/features/f07-replicate/02_pseudocode.md`: `19a86156135d7751e7414e9a406070c990686d6ec8c095448549be012a10572d`
- `docs/features/f07-replicate/03_architecture.md`: `c14c88440c537afcb1c09fe4d843c253c3e0ed4e0c904105fc3297e6fe9803b9`
- `docs/features/f07-replicate/04_refinement.md`: `43fcc7495be1b92be9537f4c9d9e57fe57b574e7e8e9522c5428af21aff9e02e`
- `docs/features/f07-replicate/05_completion.md`: `91541235061c856f42882e64b047882f8f6fb83b44fcc11708edd510598e491b`
- `docs/features/f07-replicate/correction-v01.md`: `4b0c769cbc1d54ddbbd2efa14cf0525817ab9e74bfb6d4ae06ae6d699960c87d`
- `docs/features/f07-replicate/validation-report-initial.md`: `25e82dfd642c4cf09f8fa1f3ed568da5784de4a91beed1550015fcf0fd4e091f`
- `docs/features/f07-replicate/validation-report.md`: `69bb791ed3ee076331430d7481568e7bb63e0b767a42dd1381a8603304a40ca3`
- `docs/features/f07-replicate/validation-v01-closure.md`: `35c3b7234b10d161233390e103fe21465394be93c7b843074da1895116c55353`
- `docs/telemetry/n8-20261002-1740/replicate-v01-review-launch.json`: `e49368220470cb368acfeb2596c993b9913fa6443bacc04ae8cadd8c0304d752`
- `docs/telemetry/n8-20261002-1740/replicate-v01-review-1-evidence/report-gate.json`: `f330bc863dc921b5d240eb6592617818ea4735a76a9c83315c4e23aaa894cdc7`
- `docs/telemetry/n8-20261002-1740/replicate-v01-review-1-evidence/report-gate.log`: `97bf5725af4d4bc687ac5e75a0852e7e094398598fb4f5b43dd94e2f68166aa5`

Receipt self-hash is intentionally excluded. Measurement gaps: actual model/effort attestation, token usage, monetary cost and inference-only duration unavailable. Scope complete; return to parent coordinator for its already authorized next stage.

Status: completed
