# Targeted privacy and integration correction review
Reviewer family: codex
Spec revision: sha256:8ef3b9cf796a21492aee67ec622bfbcbbcff9627a7fdba42fb0e06ab658b975d

Frozen source: `5172578f25643617f3cfd632af8c5797237aae65` in `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus`, confirmed by git HEAD. Reviewed correction diff `77dc69c7..5172578f` limited to adapter and guard test, plus concrete I1/I2 documentation fixes. Coder chat, logs and receipts were not read. No code edits, delegation, stand launch, provider request or deployment occurred; only this report was written. Actual model/effort/usage/cost: null, verifiable execution metadata unavailable.

Verdict: PASS for source-level correction of the known initialization URL/referrer defect and closure of I1/I2. No new material finding in this bounded diff. Actual post-fix SDK transport/privacy behavior remains UNVERIFIED pending the coordinator's production-build browser run. This is not an overall AC2/AC7/AC8 pass or exercise 3.4 completion.

## Privacy correction evidence

The previous init supplied defer but omitted url/referrer; the SDK still issued an initialization nohit request using browser defaults. The correction explicitly supplies:

```text
url: https://clipmkr.ru/analytics/<static route category>
referrer: https://clipmkr.ru/analytics/direct
```

`route` is the existing closed category set, not pathname, query, hash or a resource ID. Existing manual hit sanitization and SDK collection-disable flags remain unchanged. The focused unit guard now requires these exact initialization fields, so deleting either would fail that assertion. The reviewer inspected the assertion but did not execute the full suite or a red/green mutation run.

Read-only inspection of the supplied official cached SDK `/tmp/n5-acquisition-private/tag.js`, SHA-256 `af15fdd8daecef9573eaf27eb55b88b80ced02505531ba67d1d571f1ec64f553`, corroborates the relevant mechanism:

- SDK option mapping includes `Ga:"url"` and `Hb:"referrer"`.
- Initialization function Qu selects `d=b.Ga||""+T(a).href` and `e=b.Hb||a.document.referrer`, then assigns page-url/page-ref; defer marks this request nohit rather than removing it.
- Manual-hit and goal paths also have URL/referrer handling, supporting the requirement to keep both sanitized init and sanitized explicit hit configuration.

Thus the source fix addresses the demonstrated initialization fallback cause. This bounded inspection does not prove that every SDK path, subsequent auto request or browser-generated header avoids sensitive data. Actual loaded-SDK requests and sentinels must still be checked on the corrected build, including consent withdrawal and transition to excluded routes.

An in-memory adapter probe transpiled the frozen TypeScript with installed TypeScript, using a synthetic SDK/clock/storage. Landing, dynamic video path with SECRET_ID, and payment return with SECRET_QUERY/SECRET_HASH yielded respectively static landing/video/payment_return init URLs, the same static direct referrer, and no SECRET sentinel in the wrapper calls. This proves argument construction only; no actual provider transport or receipt is implied.

## I1 / I2 closure

| Finding | Verdict | Evidence |
|---|---|---|
| I1 supplement redefines pilot/funnel | closed | Similarweb analysis now repeats approved channel/tariff/feature/segment, fixed telegram/community/n5_pilot/demo_a and all four n5_* goals; ready is explicitly not download. JSON decision.target_action now names first available clip observed/n5_first_clip_ready in browser scope; successful download is separately labelled a future uninstrumented hypothesis. |
| I2 runtime.env not actually selected by launch process | closed | Cloud.ru instructions now require the env file actually selected by Compose, explain REPRODUCE uses --env-file .env, and explicitly require --env-file runtime.env if that filename is used. Filename alone is correctly stated insufficient for interpolation. |

Previously verified partial Similarweb arithmetic/unknown mapping conclusions are unchanged by these focused corrections. No new research or numeric reinterpretation was performed. Prior R1/R2 closure is unaffected by the two-line init/guard diff; no broad re-review was requested.

Dirty-document byte hashes inspected at this pass:

| File | SHA-256 |
|---|---|
| docs/features/acquisition-analytics/cloudru-launch.md | ffe7bbdb5ca4db634cce6e5584b5f5c85eaabff259884b616e1229798199bb77 |
| docs/research/acquisition-20261026/similarweb-analysis.md | 2a787c462c22bdba2db8306049564c8dba5e6013b898f34fbe021f42c205b4f0 |
| docs/research/acquisition-20261026/similarweb-data.json | e0c9fa1162d3fbb9a7b65a3cab608fa6bef669e8eeaa49f0013e3b781b5d0793 |

Coordinator retains final exact-source/build checks and actual SDK privacy verification. Full suite/build/lint/typecheck results are not independently re-certified here. Analytics remains default off; real owner counter activation and authenticated transport/dashboard receipt remain planned for Cloud.ru РФ. No real delivery claim is established by mocks, this code review or an HTTP response alone.

Status: completed
