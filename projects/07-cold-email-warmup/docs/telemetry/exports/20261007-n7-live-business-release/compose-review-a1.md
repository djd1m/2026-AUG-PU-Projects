# Independent live billing CONFIG review

Verdict: **specific_mustfix**. One runtime file-readability finding in the documentation; native rendering/isolation checks pass.
Source:a31029c375b8a973f8a554ee18c66a1fec0ada28; baseline02fd18e1. Reviewed .env.example, docker-compose.live-billing.yml and docs/live-billing-runtime.md against approved live plans/A3 config contract. No author receipt/messages/reasoning read.

## CONFIG-R1 — new merchant files need runtime-readable ownership

The documentation prepares an operator-owned private folder and applies chmod600 to merchant files without aligning file ownership with the application user. Dockerfile ends with USERnode. Read-only current public web inspect/id confirms node UID/GID1000:1000; review-owned fake merchant files are root0:0 mode600. A root deployment operator following the example therefore produces file-secret binds unreadable by node, preventing live startup. Compose config does not exercise application file reads.

Required correction in docs/live-billing-runtime.md: explicitly align only these two new merchant files with the actual accepted image/runtime UID/GID, or grant a narrowly scoped read group/ACL; preserve the protected operator directory and existing AEAD/hash/session/password files. Add a preflight that proves the actual runtime identity can read both mounted paths using predicates/filenames only, with no value output or broad permission change. Current public UID is evidence for this finding, not permission to assume every future image uses that UID.

Independent native Docker Compose config validation used only review-owned fake files in a0700 directory (files0600), --env-file /dev/null and no container command. Disabled and local_test rendered without merchant inputs. Explicit live override rendered with exact25001 price. Missing price/origin/shop-file/key-file each failed natively: seven independent exit expectations met. Parent launch SHA verified; author clean objective and referenced raw native config receipts were read independently and digested.

Merged config assertions passed: merchant mounts/environment and live billing mode affect web only; db and poll-worker exactly match the baseline under identical origin. Existing session/hash/AEAD/password/operator mounts remain. DB has no published port; web remains127.0.0.1 with parameterized host port; poll-worker has no published port. Dispatch and poll modes remain disabled. No numeric price fallback or merchant value in env is introduced; examples contain host/container file paths only.

Compose interpolation requires nonempty inputs; canonical positive integer1..2147483647 and exact HTTPS origin are explicitly application startup requirements in the approved config contract and documentation. Rendering does not validate those semantics or activate a merchant. Backend application integration and its config negatives remain separate required checks. The instructions accurately leave owner price, merchant activation, webhook/refund discovery, accepted image/worker/TLS, backup/restore, actual transactions and container starts to release gates. They preserve existing data keys and make no real payment claim.

Actual model/usage/cost:null, host evidence unavailable; requested Sol6.1 HIGH. Profile: independent bounded CONFIG slice under XL payment plan. Elapsed from immutable launch: 124.084seconds. No installs, pull, provider/network requests, real key reads, deployment or product writes.

Status: completed

Additional runtime metadata inspection was read-only; no secret contents read. Updated elapsed: 202.257seconds.
