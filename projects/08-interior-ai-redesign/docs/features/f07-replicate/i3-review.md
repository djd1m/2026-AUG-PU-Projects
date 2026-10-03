# F07 I3 independent review

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Verdict: REQUEST_CHANGES
Source: 5a16a2273956e8d29c5d45979c89c81870f4f587
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i3-review
Attempt-ID: replicate-i3-review-1
Profile: compact-quality-first-v2; substantive XL, bounded independent I3 review.
Requested reviewer: gpt-6-astra/high; requested author: gpt-6.1-sol/high. Reviewer actual model/effort and different-actual-model proof remain null pending coordinator host evidence; no model switching or delegation performed.

Scope: `web/replicate-media.js`, `tests/replicate-media.test.js`, accepted five F07 role contracts and exact I1/I2/private-media interfaces. I1/I2 acceptance is retained; this is not a whole-project re-audit or full F07 acceptance.

## Finding

### I3-R01 — MEDIUM: animated PNG bypasses the single-frame requirement

Location: `web/replicate-media.js:31-33` (shared metadata guard), reached by provider normalization at lines227-233. Coverage gap: `tests/replicate-media.test.js:137-151` and233-246 exercise animated WebP only.

The guard interprets absent `m.pages` as one frame. With the available pinned Sharp0.35.4, a valid two-frame APNG is reported as PNG512×512 without a `pages` property. Therefore the import accepts animated provider content, performs both delivery requests and writes the private depth/output/config artifacts. This violates AC-f07-replicate-7, NFR-f07-replicate-2 and pseudocode import step3, which require multi-frame content to fail closed. The normalized result is static; this finding does not claim executable content, public exposure or an unbounded decode.

A narrow offline probe reproduced the failure against byte-for-byte copies of the reviewed production modules using `/tmp/n8-node22` (v22.20.0), the already installed Sharp0.35.4 and the existing test helpers through line95. No production/test file was edited, no dependency installed and no real DNS/HTTPS/listener used. The probe generated a CRC-correct PNG with this chunk sequence:

`IHDR(512,512,8-bit RGB), acTL(num_frames=2,num_plays=0), fcTL(sequence=0,512×512,offset0,delay1/10,dispose0,blend0), IDAT(zlib red RGB scanlines), fcTL(sequence=1,same geometry), fdAT(sequence=2,zlib blue RGB scanlines), IEND`.

Each scanline starts with filter byte0; both frame payloads contain512 rows of512 RGB pixels. This gives4061 bytes with SHA256 `031839f815d9d497abec27a167b236c92816a8ceb6aac41303b387e364d154f5`. The complete PNG uses the standard eight-byte signature and big-endian length/CRC fields. Reproduce with the existing `ready(t)` helper, `network([{bytes:apng},{bytes:e.output}])`, injected resolver returning `[{address:'8.8.8.8',family:4}]`, and `createReplicateMedia({storageDir:e.dir}, collaborators).importArtifacts(e.args)`. Supply the default image/png response MIME. Expected: `provider_output_denied`, no files. Observed:

```text
sharpMetadata: format=png, width=512, height=512, pages=undefined
I3_IMPORT_ACCEPTED_ANIMATED_PNG { requests: 2, artifacts: 1, rawHashMatches: true }
probe exit_code=0 (diagnostic success, contract failure)
```

`artifacts:1` counts the depth directory; import returned a complete successful handback. The probe then called its guarded cleanup and removed its disposable workspace. The initial direct probe could not resolve Sharp because this review checkout has no node_modules; it exited1 before execution. The successful retry used unchanged module copies and the existing dependency directory resolved from `/tmp/n8-replicate-i1/projects/08-interior-ai-redesign/node_modules`.

Minimal fix: validate PNG animation structure before relying on Sharp's page metadata. Use a bounded, length-checked PNG chunk walk (not a byte-substring search) to reject multi-frame `acTL` and malformed animation structure, or conservatively reject APNG altogether. Keep ordinary single-frame PNG accepted. Add a real CRC-correct two-frame APNG negative to the shared input guard and provider import, asserting safe rejection, no second download when depth is animated, and zero artifacts. Retain the existing WebP and literal size/deadline checks. No broader refactor is requested.

## I3 subset assessment

| Contract subset | Source/test evidence reviewed | Result |
|---|---|---|
| Owned input, UUID/no-follow bounded read, persisted SHA | I3 lines37-46; generation boundedRead/artifactRead; owned/path/hash tests | PASS within trusted I4 row contract; DB ownership remains I4 |
| Deterministic512 letterbox, original aspect/dimensions, qualities85/80/75, ≤262144 bytes, EXIF removal and hashes | I3 lines23-68; actual Sharp fixtures, literal inclusive/overflow and quality-sequence assertions | PASS |
| ≤20MP, permitted MIME/magic, real decode, single frame | Shared metadata and Sharp pipelines;20MP boundary, truncation and animated WebP fixtures | REQUEST_CHANGES: APNG bypass I3-R01 |
| Opaque immutable input/request, complete source/transmitted/request/model/version/transform binding, same budget | WeakMaps/frozen snapshots; prepare/import; real I2 getSucceededOutput and renewed-budget/forgery negatives | PASS within trusted I4 durable-row/recovery contract |
| URL/host/IP syntax, global IPv4/IPv6 incl. mapped/compatible/special ranges, all DNS answers | I3 lines93-172; URL/address boundaries and all-answer zero-connect oracle | PASS inspected policy and supplied evidence |
| Bounded cancellable DNS, pinned address, original TLS SNI/certificate verification, no auth/proxy/redirect | I3 lines129-224; injected lookup/options/timer/abort/error tests | PASS offline; no live TLS handshake claim |
| Actual/declared stream bytes≤10485760, identity encoding, MIME/magic/truncation, request5s and original remaining budget | Download/normalize; literal stream bounds and before/after-await deadline tests | PASS except animation finding above |
| Exact512 canvas, recorded crop, original-size PNG≤10MiB, raw/normalized/config hashes, privacy | Normalize/provenance and pixel-axis/config-field/hash tests | PASS; quality remains unverified, metrics null |
| Canonical directories, exclusive O_NOFOLLOW mode0600, partial failure, collision/replacement/winner preservation | Write/discard paths; held descriptors plus dev/inode match; symlink/collision/deadline tests | PASS under server-controlled directory namespace |
| I4 uncertain-commit conjunction and resource ownership | Nonenumerable cleanup(callback) versus release(); callback literal true, sequential owner handback, retained files on denial | Interface feasible; I4 must query DB before deletion, release confirmed/referenced results, reconcile unknowns |

No other concrete I3 defect was established. Read-only review does not prove the absence of every possible defect. In particular, path checks are not an openat sandbox against privileged concurrent ancestor replacement; the documented server-controlled namespace is an explicit integration premise. Sequential disposal is required by the API handback and can be implemented by I4.

## Source and supplied evidence

HEAD matches the requested source. All snapshot hashes matched:2 product/test files,13 accepted contracts/handbacks,11 protected files and11 evidence logs. The launch SHA256 matches `dfd200aa1660b0e7ec03900d9f09bad77c58ef496c7f386221e04ce5f6993bb7`.

- Product SHA256: `6678a59501ee42ece6b10686400965323448c85b77e89454e30fdc5757ca54fc`.
- Test SHA256: `ecdc1c77a39e199f814a3173e603d8e6595ae94646a56030791d9f376c1f96bc`.
- Saved first run125/127 exposed the animation-fixture collapse and inode-reuse cleanup problem; later127/127 and136/136 passes remain recorded. The held-file-descriptor correction is present.
- The136/136 full pass precedes only the DNS negative-effect oracle strengthening. Current DNS baselineGREEN/mutantRED/restoredGREEN is separate delta evidence; historical exact test SHA at full execution is unknown. This is composite evidence, not a same-bytes full rerun claim.
- Saved mutation changes the actual all-answer DNS validation guard. The unchanged strengthened oracle fails at exactly2 HTTPS invocations versus required0 (assertion failure, not syntax/startup). Restored production SHA matches the reviewed file.
- Prior original author process ended on service capacity after973.375s. The300.620s delivery continuation left product bytes unchanged and delivered its receipt/gate0. These are historical supplied execution facts, not this review's duration.
- No green suite rerun, broad regression, installation, real network, Docker, paid provider call, commit/push, global configuration or run-events edit occurred. Only the narrowly justified APNG diagnostic was executed.

## Later gates and handoff

Coordinator owns a bounded I3-R01 correction in the same two files followed by affected independent review and required changed-source checks. I4 still owns DB authority/final owner/deletion/fence/deadline rechecks, worker lifecycle, persisted completion, unique credit release and uncertain-commit DB lookup. Missing I4 wiring is not this review's finding. I5 owns hosted evidence/quality, I6 global send-CAS mutation, I7 full regression/canonical reconciliation and I8 actual browser checks. Real provider output order/quality/safety/latency/billing, activation, release and full MVP remain pending and unauthorized by this review.

Review preflight: not_applicable (offline scoped review, no E2E). Requested profile/model are recorded above; reviewer actual model, effort, usage, cost and active-wall measurement remain null until host proof. External provider spend:0. No savings claim. Exact review timing and terminal delivery are in `docs/telemetry/n8-20261002-1740/replicate-i3-review-receipt.md`.
