# F04a product implementation receipt

Run-ID: 20261002T232200Z-f04
Work-Unit-ID: n7-f04a-sol
Attempt-ID: implement-a1
Source-Revision: 64a093cc75eb4016a55e33196402ca84638bc811 (launch baseline)
Product-Revision: c666af20eea2ff0a054d2febce3fc4ffbf7b5e91
Launch-SHA256: 0560c94f28253b01f2b7c168e287f5a526daf2395386f52f8efb09841242c2c2
Spec-SHA256: 6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38
Started-At: 2026-10-02T23:24:04.407884+00:00
Finished-At: 2026-10-02T23:43:47.251731+00:00
Deadline: 2026-10-02T23:49:04.407884+00:00
Verdict: implementation checks PASS; fresh independent acceptance review pending parent
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol high
Actual-Model: null (host proof pending)
Usage/Cost: null (no attributable host counters; no estimate substituted)
Elapsed-Wall-Ms: 1182843
Active-Wall-Ms: null (complete attributable wait intervals unavailable)
Authority: OWN-N7-002. Sole worker; no agents, push, real email, paid LLM, browser or deploy.

## Six AC matrix

| AC | Production implementation and actual evidence | Result |
|---|---|---|
| A1 | page<=100/header8192bytes/refs50/MessageID254bytes; exact single sender + tenant/mailbox own sent References + decrypted recipient; no/malformed/reused/changed incoming IDs; wrongsender/foreignmailbox/tenant/unrelated stop0 | PASS input unit + real PG |
| A2 | shared lock FIRST, physical observation/valid-ID ledger/semantic event identities; client stop helper; observations/effects/enrollment/cancel/cursor atomic; concurrent page and semantic dedup | PASS real PG |
| A3 | durable fixed H/run/cursor0 on reset; poll pause preserves quarantine; sparse/empty/expunged coverage; second reset and old callback rejection | PASS real PG |
| A4 | persisted20page/120s attempt; exact post-lock clock exhaustion; explicit retry retains H/run/cursor; same-validity bounded tail only refreshes at post-lock clock; failed/future/slow tail stays paused | PASS real PG |
| A5 | canonical R1/S0→R1/S1 BEFORE rollback / AFTER durable crash; same-run/H restart; actual production ingestion advisory wait vs final submitting before0/after1/later0 | PASS real PG |
| A6 | additive006 only; complete type/lint/build/unit/PG; semantic mutation RED and restoredGREEN; actual secret/header/body canary; source/build/image/copied inputs; documented B API | Implementation gates PASS; independent Astra review remains parent gate |

Product artifacts: src/replies/input.ts/store.ts; db/006-replies.sql; db migration registry; client-level dispatch stop helper; dedicated tests. Existing F03 wrappers, final freshness gates and clock-after-lock code remain and their full regression passed. No historical migration, F02 crypto/auth, canonical document, root or other-project change. B public unsubscribe/complaint/pollworker remains outside this unit. Entire F04 requires A+B and fresh reviews; no whole-feature completion is claimed.

## Commands / exits and source binding

- Mechanical ROUTE before preparation and repeated before IMPLEMENT: bash scripts/complexity-router.sh <explicit F04a paths>, exit0, S lower bound. Substantive XL retained because stop/atomicity/freshness carry safety. Existing OWN-N7-002 approval applies.
- npm run typecheck, npm run lint, npm run build: each exit0, host and image build. Full npm test: exit0,16/16. Full npm run test:integration: exit0,64/64 including unchanged F03 and clock-after-lock regression.
- bash scripts/check-f04a-heavy.sh: exit0. Actual heavy lock23:39:06→23:40:54 UTC; released for N8. CPU2, RAM/disk/port checks; isolated n7f04a network/volume, /tmp/n7-f04a-runtime, loopback18705; DB has no published port. Node22.20.0.
- python3 scripts/check-f04a-mutation.py: harness exit0; substantive mutant PG exit1 as expected. Mutant changed once-only effect INSERT into conflict UPDATE/RETURNING, causing replay to repeat stop effect. Canonical/no-ID replay assertions rejected it (ERR_ASSERTION). Host and copied runtime source restored in finally; sha256 matched. Subsequent affected PG exit0,13/13. No unrelated GREEN rerun.
- python3 scripts/check-f04a-secrets.py: exit0 on actual runtime logs/tables, then affected source-secret extension exit0 on own project files including runtime key components. Credential/header-display/body canaries absent from logs/reply data; actual runtime secret values absent from project files/logs/data. Values suppressed.
- npm audit --audit-level=high: exit0,0 vulnerabilities; pinned dependencies unchanged.
- python3 scripts/check-f04a-snapshot.py: exit0 after restoration, verifies every copied src/test/db/package/type input and compiled JS against host, and running container image against built image. See sol-a-source-image.json for individual hashes.

Source-SHA256: e554eddab0edb483efe61cc99fdaec6db37c8c68de4d19d2431d222021e6ee4c
Build-SHA256: 8eb7020e79a4b5ba95e4aefc706a57e1ef2fb5b2c1dca7042fe76d9eaf5ee125
Image-ID: sha256:fdd7aedcce0d2b8d3e207f38fb7a9a555b70f48275e4c60d7a1a493616a40923
Package-Lock-SHA256: 49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a
Dockerfile-SHA256: f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5

Evidence: sol-a-heavy.txt/.exit, sol-a-mutation.txt, sol-a-restored-source.txt, sol-a-secret-source.txt/.exit, sol-a-snapshot.txt/.exit, sol-a-source-image.json, sol-a-preflight.json, sol-a-run.json and sol-a-events.jsonl in this directory. Full tests and mutation refer to product source above; final evidence-only commit does not change image source.

## Delivery and B handoff

Trusted internal API documented in docs/features/f04-reply-suppression/implementation-a.md and reuse-a.md: capture/status/page/failTail/retry; reader supplies strict range/tail evidence outside DB locks; operator authentication for explicit retry belongs to B. Initial empty inbox is explicit local_fixture evidence, not real IMAP. No HTTP fixture/freshness backdoor or external provider connection. Completed same-validity polls may start bounded incremental coverage; unfinished/crashed runs keep existing attempt and immutable H until budget failure/explicit retry.

F03 donor accepted2ff44de2. Requested r1 node_modules was absent; existing F03 sol directory was reused by temporary symlink after identical lock SHA verification, never pruned or mutated. No dependencies/framework/package-lock changes. Product commits1facdc05 and c666af20 use Russian messages, no Co-Authored-By; no push. Caller-owned launch/manifest stay unstaged. Source/build evidence was captured after mutation restoration.

Measurement gaps: actual model/effort, usage, cost and active-time split await host proof; no savings or accepted-review claim. Two routine path errors were corrected: root npm build ENOENT and initial relative-path preflight write; successful project build and absolute preflight replace those failures. First dependency symlink command used wrong cwd and failed before mutation; corrected symlink resolved. No mandatory gate weakened. Parent continues fresh A review, B, all MVP work. Implementation is ready for that source-bound review.

Status: completed
