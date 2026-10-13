# I5b — hosted quality and publication predicates

Bounded implementation from `5f6eb7be0f54967275204ffd8469165d6ea10523`, RUN_ID `n8-20261002-1740`, WORK_UNIT_ID `n8-replicate-i5b`, ATTEMPT_ID `replicate-i5b-1`. Accepted F07 XL PLAN/VALIDATE and I5a/F1 contracts remain authoritative. Sole requested author model Sol6.1/high; actual host resolution, tokens and cost unavailable/null. No delegated review or provider activation.

## API and owned paths

Existing `createQuality(pool, config, {operatorIdentity}).review({jobId, decision, reason, reportPath, reportSha})` is the sole privileged operator entrypoint. Server-only operator identity is still mandatory. There is no user quality setter or new HTTP endpoint. The existing `qualityEligible(pool, jobId, storageDir)` boolean API and sharing APIs remain unchanged.

Exactly seven product/test paths: `web/quality.js`, `web/replicate-quality.js`, `web/sharing.js`, `web/composite.js`, `tests/replicate-quality.test.js`, `tests/replicate-quality.integration.test.js`, `tests/replicate-quality-fixtures.js`. No additional PG fixture was needed. Documents/telemetry use only the I5b namespace. Existing tests/fixtures, DB008, jobs, provider submission/evidence/media/worker/config/packages, public-pages and I1–I4a remain byte-identical; protected hashes and scope check are in the snapshot.

`web/replicate-quality.js` exports `validateHostedCanonical`, `validateHostedRow`, `hostedConfig`, `validateHostedConfig`, `validateHostedCorpus`, `supportedRealMode` and matching `REAL_MODE_SQL`. The common real-mode set is controlnet/replicate. This predicate is classification, not publication authority: publication still requires accepted quality, immutable matching privileged review/corpus SHA, actual four private hashes, nonheld owner, explicit consent and current share/token/version authority.

Hosted row validation removes only DB completion's added `output_key` before reusing the accepted closed `validateHostedOutput`. It binds the full canonical SHA, job/output key, mode/job mode/style and every shared evidence column. SQL null model_revisions/hardware/warm/inference remain null; only nonnull seed/queue PG numeric values are normalized. Hosted rows never enter local manifest/model/numeric assumptions. Local controlnet evidence, config, model revisions and measured-gpu corpus checks remain their separate existing path; fixture cannot receive real quality.

The exact I3 config allowlist is schema_version, mode, provider, quality, submission_id, prediction_id, model, version, contract_sha, request_sha, source_input_sha, transmitted_input_sha, transform, raw_provider_depth_sha, raw_provider_output_sha, depth_sha, output_sha. No worker field, style/seed, local manifest or local revision is added to this artifact. Both exact config equality and canonical config hash are checked; actual artifact bytes must match the immutable config_sha.

## Exact hosted report contract

Top-level closed keys: kind, synthetic, measurement_claim, reviewer, measured_at, measurement_source_sha, attestation, pairs. `kind` is `measured-hosted-corpus-v1`; `synthetic` must be false and `measurement_claim` must be `measured-nonsynthetic`. Reviewer is an opaque bounded operator identity; dates are exact ISO UTC timestamps; source references are lowercase SHA256 digests. Report bytes themselves must match the supplied reportSha and are bounded to4MiB by the existing reader.

Attestation has exactly reviewer, attested_at, source_sha, statement. Its reviewer must differ from the measurement reviewer, attested_at cannot precede measured_at, source_sha must be a SHA256 digest, and statement is `independently-reviewed-measurements`. This is an independently attributable operator declaration and source reference, not a cryptographic proof of real geometry.

Every pair has exactly room_id, style, license_sha, annotations_sha, measurement_source_sha, mode, provider, model, version, contract_sha, worker_source_revision, input_sha, transmitted_input_sha, raw_provider_depth_sha, raw_provider_output_sha, depth_sha, output_sha, config_sha, request_sha, evidence_sha, evidence, config, added_openings, removed_openings, anchor_displacements.

Pair `evidence` is the exact I5a canonical DB evidence including output_key; `config` is the exact I3 provenance above. Closed I5a evidence validation, full evidence SHA, config recomputation/equality and all duplicated hash/style/pin/source values must agree per pair. All pairs use hosted mode/provider, the accepted model/version/contract and the target worker source revision. Different input/style pairs may and normally do have different request/config hashes; they are validated independently. At least one pair must equal the entire target canonical evidence and target style, binding its actual input/output/depth/config/evidence and hosted provenance.

There are36–1000 pairs, at least12 distinct input hashes with a common set of three distinct allowed styles and every pair in that grid. Duplicate room/style pairs, multiple room aliases for one input and changing input within a room fail closed. Every pair carries licensed-input, annotation and measurement-source references. Added/removed openings are exactly zero; anchors are nonempty, bounded≤1000, finite numbers in[0,0.02]. Missing/unknown fields, old/mixed mode/version/contract/source, bad hashes, substitutions, incomplete grids and aliases reject.

## Authority and trust boundary

Acceptance reads actual owned input/output/depth/config and report bytes and performs hashes/validation before the transaction. Final locks remain account→job; owner/upload/key/style/job-mode/output/evidence/quality/deletion/hold are rechecked before appending a bound review and updating quality. Concurrent changes cannot reaccept rejected output. Rejection uses the unchanged releaseRejected helper and unique release policy, and existing share-revocation triggers remain active.

qualityEligible verifies all four actual private artifacts and exact hosted config, then rereads immutable review/corpus and live owner/upload/mode/style/output/evidence/quality/hold authority. Sharing changes are limited to the shared real-mode predicate and SQL candidate mode set. Existing public prepare/final account→job→share checks, byte binding, consent, token/version, hold, owner and cache authorization remain. Private hosted unverified composites use the existing UNVERIFIED label; fixtures retain DEMO UNVERIFIED, AI marking remains mandatory. Owner private export can remain unverified under existing policy.

JSON declarations/hashes cannot establish that real measurements, licensing review or independent examination happened. The server operator must retain the actual licensed/annotated corpus and independent measurement/attestation source materials, verify their truth, and provide this report through the privileged entrypoint. No attestation service/signature system/measurement engine was added. All new fixture identities, report context, images, hashes and times are explicitly SOFTWARE TEST ONLY; otherwise-valid claim fields exercise software acceptance and establish no real measurement or project acceptance. Actual corpus, privacy/license/safety/billing/paid activation gates remain closed.

## Validation and handback

Allowed author checks on Node22, Sharp concurrency1 and test concurrency1: new strict hosted unit tests, unchanged quality/sharing/composite suites, static scripts/check.js and git diff --check. Candidate result and exact file/log hashes are recorded in `replicate-i5b-checks.json` and `replicate-i5b-snapshot.json`. Focused mutation in a disposable copy removes only synthetic rejection; the unchanged negative oracle must fail for bad corpus acceptance, then pass on restored identical source. Production source is never mutated.

Failures retained: initial fixture heredocs used repo-relative paths from the project cwd and wrote no files; existing suites happened to run18/18, which was not new-suite coverage. The first complete new-suite pass exposed the SQL double's final quality change; explicit final accepted-state checking was added, and subsequent candidate tests passed. Earlier logs remain history, not candidate proof. Routing mechanical result L/exit1 is a lower bound; substantive F07 XL and accepted plan remain in force.

The new parent-only PG suite requires Node22, PostgreSQL16, TEST_DATABASE_URL on a dedicated local/internal host and N8_TEST_DB_OWNERSHIP=n8-f07-replicate; it has no skip/fake path. It uses real I1 authorization/envelope/CAS/prediction identity/observation and I5a completion, never direct evidence insertion or bypassed DB008 triggers. It covers privileged review/immutability/private unverified composite/explicit publish/list/read, old/local report separation and fixture exclusion, rejection/unique release/no reaccept, missing/changed actual input/output/depth/config, real account lock contention and final hold/delete/style races, and actual afterPrepare barriers for public cache/list/owner cache/publication with hold/delete/revoke/reject/version/owner changes. All test artifacts and authorization receipts are synthetic software fixtures.

No PG, Docker, HTTP listener or provider call was run by this author. Parent must run the frozen candidate:

```sh
node --test --test-concurrency=1 tests/replicate-quality.integration.test.js
```

Parent also runs unchanged quality/sharing PG suites using their existing ownership contracts, relevant regressions, fresh independent review, then I7 fullsuite and I8 actual shared-Docker browser checks. These mandatory later checks are pending; no PG/E2E/full-MVP pass is claimed. Preserve the source-bound snapshot overlay and record actual executed bytes/results.

After acceptance: I4b verified hosted worker/request reconstruction and maintenance cleanup, I6 send-CAS mutation/mock browser wiring, I7 canonical docs/full regression/final independent review, I8 sharedDocker UI. Actual measured corpus/provider pilot, privacy/licensing/safety/billing/performance and deployment remain externally gated. No commit/push/run-events/network/credentials/install/globalconfig changes were made.

Status: completed
