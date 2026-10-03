# F07 I3 private media handback

Run-ID: n8-20261002-1740. Product source: b37b43d88356d7ca53b478c129469e9e0b77d259 plus the two immutable dirty-file hashes in `replicate-i3-snapshot.json`. Profile: compact-quality-first-v2; mechanical S, substantive XL. Implementation: gpt-6.1-sol/high, prior host execution confirmed by owner; continuation actual model/effort and cumulative usage/cost remain null pending host proof. No product edits during completion attempt.

This delivers the bounded I3 adapter and offline proofs. Fresh review, I4 worker/DB wiring, I6 send-CAS mutation, full regression/browser and actual provider/quality acceptance remain separate gates. It does not grant completion, owner, publication or billing authority.

## Exact worker API

```js
const input = await prepareReplicateInput({storageDir, upload, accountId, signal});
const privateInput = getPrivateReplicateInput(input);
const candidate = {version: REPLICATE_VERSION,
  input: {...fixedServerSettings, image: privateInput.image}};
const binding = {...i1Binding,
  source_input_sha: input.source_input_sha,
  transmitted_input_sha: input.transmitted_input_sha,
  transform: input.transform,
  request_sha: hashReplicateRequest(candidate)};
const prepared = prepareReplicateMediaRequest(input, fixedServerSettings, binding, {budget});
// Pass this exact prepared handle and budget to I2 create/get/poll.
const media = createReplicateMedia({storageDir});
const result = await media.importArtifacts({observation, prepared, submission, budget, signal});
// I4: live account/job/submission fence/deadline/deletion checks and atomic completion.
// Confirmed persisted completion: await result.release();
// Unreferenced after a DB query: await result.cleanup(async key => isDefinitelyUnreferenced(key));
```

`upload` must be the trusted owner-scoped, nondeleted DB row containing `account_id`, `private_key`, `sha256`, `width`, `height`, `mime`, `deleted_at`; `accountId` is the trusted worker owner UUID. Equality checks reject forged metadata but cannot authenticate a fabricated row. I4 queries ownership/deletion and repeats the live checks before authorization and completion. The row is shallow-copied before the first await. The source is read with existing `artifactRead`/`boundedRead` (canonical realpath, NOFOLLOW, regular file, bounded read/growth check), then verified against the persisted original hash. No input URL or second-upload fallback exists.

Input supports PNG/JPEG/WebP magic matching MIME, ≤10485760 bytes, ≤20000000 pixels and one frame. Persisted upload pixel axes are preserved; canonical uploads already had orientation applied. The 512 canvas uses `scale=512/max(width,height)`, content sides `max(1,round(original*scale))`, centered coordinates `floor((512-side)/2)` and black padding. Lanczos3 resizing, alpha flattening and JPEG 4:2:0 encoding use qualities 85→80→75, at most three encodes; decoded JPEG bytes must be ≤262144. A real full JPEG decode verifies shape; EXIF/ICC/XMP are absent. All input awaits check abort.

The frozen input handle exposes only original/transmitted hashes, frozen numeric transform and selected quality. Bytes remain in a WeakMap. `getPrivateReplicateInput` returns a frozen object with nonenumerable `image` (precise canonical JPEG data URI), `transform`, `source_input_sha`, `transmitted_input_sha`; JSON is `{}`. It is an internal server accessor: explicitly reading `.image` exposes private data to that caller. Never log/persist/pass this accessor to browser code. Clones lose private identity.

`fixedServerSettings` is exactly I2's fixed prompt/a_prompt/n_prompt, num_samples='1', image_resolution='512', detect_resolution=512, ddim_steps=30, scale=7.5, eta=0, persisted seed. I4 chooses the prompts/seed; I3 does not accept browser configuration as authority. `binding` is the complete accepted I1 prepared binding, including its authorization/privacy/license/safety/billing digests and spend-budget UUID. I3 compares source/transmitted/transform/request hashes and delegates the closed request and pin validation to I2 `prepareReplicateRequest`. Both I2 and I3 snapshot the binding; later mutations cannot alter bytes or crop. I3 remembers the exact budget object with the prepared handle. Import rejects a different/new budget; I4 must use that same object throughout I2 create/poll/import and derive it from original DB remaining time. Recovery reconstructs the same candidate/binding under the remaining original deadline, rather than recreating a prediction.

## Import and private artifact contract

Only I2's genuine WeakMap-backed `getSucceededOutput(observation)` supplies depth0/generated1 references. Cloned/browser/partial/cleanup observations cannot import. The durable submission must match observation IDs, succeeded status, nonquarantine, provider/model/version/contract, original deadline and every prepared binding field. These snapshots precede network awaits. I4 still owns live DB authorization, deleted-source recheck and final fence; the supplied row is not a DB lookup performed by I3.

HTTPS URLs are ≤2048 characters, exact replicate.delivery or proper label subdomain, default/443 only; credentials, fragments, IP literals, escaped authority, whitespace/backslash and spoofed suffixes fail closed. All A/AAAA results are validated; empty/mixed nonglobal/special answers fail before HTTPS. Policy conservatively denies mapped/compatible IPv6, transition/translation ranges, private/loopback/linklocal/multicast/reserved/documentation and listed special-purpose blocks. DNS has ≤5s/original remaining timeout and cancellation; the built-in resolver additionally has 1s/one-try bounds. HTTPS lookup returns only a copied validated address, without another DNS query. Original hostname is TLS SNI, certificate verification stays enabled, TLS≥1.2, port443, agent:false. Built-in HTTPS does not use environment proxy headers; requests contain only Accept and Accept-Encoding:identity. No provider token or redirects.

Both downloads are individually ≤5s and consume `remainingReplicateBudget` of the original bound object. Content-Length above10485760 fails early; actual stream counts enforce that same bound without a header, and declared lengths must match. Identity encoding only; PNG/JPEG/WebP MIME must match magic and Sharp format. Sharp validates ≤20MP/single frame and exact512×512 canvas. Real decoding/cropping removes the recorded rectangle and resizes to original dimensions; PNG compression9 without metadata is deterministic and ≤10MiB. Raw provider and normalized hashes occupy separate fields; equal byte sequences can naturally have equal digests. Deadlines/abort are rechecked across DNS, streaming, decoding, directory/file work and return; cleanup after failure cannot grant output.

Existing canonical `outputs`, `depths`, `configs` directories must already exist under the absolute private root; I4 may prepare them with existing `prepareArtifacts`. Canonical realpath and directory checks reject symlinks/traversal. Root/directory namespace must remain controlled by the server, inaccessible to untrusted writers; Node pathname checks are not an openat sandbox against a privileged process concurrently replacing ancestors.

One internally generated UUID names all three exclusive O_EXCL|O_NOFOLLOW files, mode0600. No output URL becomes a key. The safe config is canonical JSON ≤65536 bytes with the exact closed fields: schema_version=1, mode, provider, quality='unverified', submission_id, prediction_id, model, version, contract_sha, request_sha, source_input_sha, transmitted_input_sha, transform, raw_provider_depth_sha, raw_provider_output_sha, depth_sha, output_sha. It has no URI/data URI/token/raw response. It is an I3 provenance artifact; I4 adds separately bound job settings/seed/timestamps and DB evidence where required, without claiming those are already present in this file.

The immutable result contains output_key, mode, quality and frozen evidence (config_sha/artifact_key/input_sha plus provenance; unknown hardware/warm/inference/billing values are null). Nonenumerable `cleanup` and `release` hold the descriptor capability. Descriptors remain open until one method is awaited, preventing inode reuse from disguising a replacement. Partial failure deletes only successfully created matching dev/inode paths and closes descriptors; collisions/preexisting winners survive. Call these disposal methods from one responsible I4 owner, sequentially. `release()` closes descriptors and permanently relinquishes deletion authority without deleting. `cleanup(callback)` requires literal true from a key-bound unreferenced check; false/missing callback preserves files. After an uncertain completion commit I4 MUST query the DB before granting deletion; referenced winners call release, unknown DB state keeps files and relinquishes ownership for later orphan reconciliation. A callback is an authority contract, not pretend DB authorization. Always dispose in I4's finally path. Cleanup failure revokes this capability and leaves orphan reconciliation to the existing sweep; do not retry with generic `discardArtifacts` after uncertain commit.

## Proof and limitations

Node22 v22.20.0; Sharp concurrency1, one test worker, temporary fixture cleanup; no real DNS/HTTPS/listeners/credentials/provider/Docker/install. The full new suite recorded136/136 passing (16 top-level plus120 nested), no skipped/cancelled/todo. Earlier127-test run recorded125 pass/2 fail (identical animation frames collapsed, replacement-inode cleanup defect), then127/127 after correction. All logs remain. After the136 pass, only the DNS negative-effect oracle was strengthened; current exact test bytes passed focused mutation baseline/restored. Historical per-run product/test SHAs were not recorded at execution; final source matches the measured restored production SHA and launch, with current bytes/logs bound by the snapshot. No repeated full green suite is claimed.

DNS mutation in a disposable two-file copy disabled actual all-answer validation. Unchanged oracle failed at exactly2 HTTPS invocations versus required0; baseline0/mutant1/restored0 exits, restored source digest verified. This is meaningful I3 security proof; mandatory global send-CAS mutation remains I6. Syntax, whitespace/conflict markers/<500 lines, scope and protected/pinned hashes passed. The completion scope wrapper initially used the wrong path basis (exit1), then the corrected root-relative comparison passed; product unchanged.

Tests include real JPEG/EXIF/aspect/extreme portrait fixtures, 20MP inclusive/exclusive, malformed/truncated/animated inputs, literal JPEG/stream thresholds, actual codec fallback with test-only padding, URL/IP/DNS/lookup/TLS/auth/redirect policy, stalled DNS/HTTPS, MIME/magic/canvas/encoding/bombs, bound observations/requests/budget, pixel crop axes/hash/config/modes, file permissions, exclusive collision, replaced winner, and deadline before/after decode/open/write. Synthetic fixtures/padded codec probes prove software boundaries only. No hosted quality, safety filtering, actual output order, latency, billing, PostgreSQL completion or real TLS handshake is certified. Fresh independent review and complete F07 AC gates remain pending with the parent coordinator.

Evidence: `docs/telemetry/n8-20261002-1740/replicate-i3-checks.json`, `replicate-i3-snapshot.json`, `replicate-i3-completion-attempt.json`, `replicate-i3-completion-receipt.md`. The first process exited1 after973.375s on service capacity, unrelated to test failure; resumed delivery uses a separate480s attempt and fresh trace. Unknown cumulative tokens/cost stay null.

Status: completed
