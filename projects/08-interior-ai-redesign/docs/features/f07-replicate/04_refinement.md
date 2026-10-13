# F07 — Refinement, failure policy and bounded slices

Source e2dded9898d8b00f2fa5613e5f5d3fb63281715b. All slices require accepted PLAN and separate VALIDATE first. Each attempt≤25min; at timeout save diff/checks/receipt and coordinator assigns concrete continuation, never declares success from timeout. No optional polishing after required checks.

## Failure and race matrix

| Boundary | Required result/test injection |
|---|---|
| Before preflight/submitting commit | Rollback has zero external effects; restart can acquire one CAS |
| Commit before POST then kill | Ambiguous unless original sender proves unsent; no second POST |
| Remote accepted, HTTP response lost | One POST, one ticket, terminal local failure + one credit release; reserved spend retained |
| ID received, SQL commit response lost | Read identity by submission UUID; never POST again |
| ID arrives after deletion/lease loss | Persist identity for cancel/cleanup only; never attach result |
| Two reclaimers | One new fence, same attempt deadline and ticket; old worker cannot complete |
| Hold before submitting CAS | No invocation; queued job release preserves hold semantics |
| Hold after CAS, deletion after final pre-send check | Previously authorized remote race cannot be undone atomically; hold permits private completion, deletion denies and cancels when ID known |
| Healthy heartbeat past180s | Terminal despite heartbeat; no renewal beyond fixed deadline |
| Provider queued until timeout | Cancel-After helps remotely; app fences at its own deadline regardless provider state |
| Cancel acknowledgement lost/success races cancel | GET known ID for observation; never revive local failed/deleted job or refund provider budget automatically |
| API401/422/429/5xx, unknown enum, body bomb | Safe bounded error; no automatic POST replay. GET limited backoff only |
| Input deleted while encoding/uploading | Recheck before submitting; if race after authorization, output revoked and remote residual disclosed |
| Commit success but response lost | Read output reference before removing artifacts; do not delete committed result |
| TLS/DNS/redirect/MIME/oversize/animation attacks | Fail before prohibited connection or before attach; bounded buffers/decode and own-file cleanup |
| Changed model/schema/output order | Fail closed; contract hash mismatch blocks create/import; pilot confirms source-inferred order |
| Missing depth / safety rejection / empty output | Explicit failure; never fake depth, create replacement silently or declare quality pass |
| Budget midnight/recovery | Current UTC ticket before new submission, never double charge recovery, never refund tickets |
| Privileged report with fabricated measurements | Software schema cannot prove measurements; independent actual corpus attestation required; synthetic branch is never public evidence |

## Implementation slices (each≤25min)

| Slice / accountable executor | File boundary (see architecture for exact paths) | Deliverable/check / stop condition |
|---|---|---|
| I1 Sol6.1 high | db/007-replicate.sql; web/provider-submissions.js; tests/replicate.integration.test.js | Migration + immutable unique identity/spend CAS; real PG two-contender and rollback tests. Stop with receipt at25min; coordinator owns manifests |
| I2 Sol6.1 high | web/replicate.js; tests/replicate.test.js | Config/async transport; lost-response one-create tests and explicit no retry; no real credential/network |
| I3 Sol6.1 high | web/replicate-media.js; tests/replicate-media.test.js | Data URI and secure stream/crop/hash import; DNS/redirect/limits matrix green |
| I4 Sol6.1 high | web/jobs.js; web/generation.js; scripts/worker.js; scripts/maintenance.js; web/config.js | Same-deadline reclaim and cleanup integration; focused existing jobs/generation plus new PG crash/hold/deletion cases |
| I5 Sol6.1 high | web/quality.js; tests/replicate-quality.test.js; necessary sharing/composite/public mode predicates | Hosted evidence/corpus gate; old quality/public guard tests unchanged plus mixed-provenance negatives |
| I6 Sol6.1 high + integration coordinator | scripts/mutation.js; scripts/ui/browser-cases.js; scripts/ui/fixture-driver.js; existing env/compose and minimal UI labels | Guard mutation proves failure; static/config and hosted mock browser scenario prepared; no real provider |
| I7 coordinator / fresh Astra reviewer | Canonical doc files listed in03; feature completion/test map; review evidence | Reconcile docs and full regression/source-bound fresh review, fix concrete findings only |
| I8 coordinator E2E executor | Existing shared Docker scripts plus own evidence | Read-only preflight then actual browser1440/390 plus disabled mode, locks/CPU2; stop at25min with evidence if infrastructure blocks |
| P1 later operator | Licensed corpus/pilot authorization and evidence only | Only after explicit spend/access/privacy/license/safety authorization; max36 creates, one concurrency, no automatic replacements |

Sequential slices avoid concurrent writers. Independent validator/reviewer belongs to coordinator followup, not this attempt. Before each slice pass source SHA + accepted role-doc digests + AC subset + prior checks; record actual host model if available, otherwise null. If slice exceeds budget, next attempt targets remaining concrete item, not repository rediscovery.

## Operational limitations and readiness

The initial model is old/community and may become unavailable; pinning does not guarantee availability. Output mapping source is from author main, not proof of deployed image internals. Version-specific schema is verified publicly; a later authorized smoke must confirm output shape/order and safety. Fail-closed paths can ship disabled without asserting real quality.

Provider deadline or per-second pricing is not a hard account billing cap. Local admission enforces an authorized modeled ceiling; if a contractual maximum cannot be verified, require bounded prepaid/account-level spending controls or explicit operator risk acceptance before paid pilot. Unknown identity means no reliable API cancellation/deletion target. Stop further pilot admission on first ambiguous outcome and reconcile before any continuation.

No webhook is needed for this bounded initial integration. Do not add one merely to make unknown-create matching convenient: signature verification, durable nonce and replay protocol would enlarge scope and still require concrete provider evidence.
