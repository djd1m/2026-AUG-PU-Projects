# F06 implementation-1 source-bound receipt

RUN_ID: 20261002T190728Z-pdf-source
WORK_UNIT_ID: pdf-source-implementation
Attempt-ID: implementation-1
Source-Revision: 3f2dac3af6b3f676f9e0d083199632e94c3216a0
Build-Revision: null (no immutable Docker image built by this executor)
Launch-SHA256: f59c7213e6565f85deafb8abd87569cedf123f38d375b7e72e6c0a7673a22d50
Started-At: 2026-10-02T19:17:57.149747+00:00
Finished-At: 2026-10-02T19:33:51.125318+00:00
Elapsed-Seconds: 953.976
Deadline: 2026-10-02T19:42:57.149747+00:00
Verdict: bounded code implementation delivered; full feature acceptance pending

Profile: compact-quality-first-v2. Requested model/effort: gpt-6.1-sol / high. Actual model: null; actual effort: null; tokens: null; cost: null; active time: null. Reason: native CLI rollout/model/usage and billing counters are coordinator-owned and unavailable here. No model switch, fallback, child agents or savings claimed. Wall elapsed includes reading, implementation, tests, handoff and receipt preparation; per-check elapsed is measured in check JSON. Existing caller run/work-record/launch were not rewritten by this executor. Companion skill applied to preparation and handoff; E2E preflight not_applicable here because coordinator owns fresh Docker UI validation.

## Delivered implementation and AC mapping

- PDF-01: atomic tenant transaction inserts source(kind=pdf,file_name), source_file(bytes,sha256), queued index_job; 202 returns job_id before work. 4MiB/SQL-failure rollback real-DB tests written; DB execution pending.
- PDF-02: Origin/session/visible bot before upload reads; stream bounded to 10485760 + explicitly named 65536 multipart-overhead bytes, cancellation before excess chunks are stored/concatenated, independent actual file limit, exact %PDF- magic. 413/415/422 boundaries and absent/underdeclared Content-Length cancellation pass unit tests; no-extra-record DB assertions pending.
- PDF-03: FOR NO KEY UPDATE visible bot row lock serializes cap check; owner account and existing planOf used; Free maximum three. Ten real tenant requests at two files must accept exactly one and reject nine; foreign bot body unread and direct enqueue null tests written. Real DB concurrency and mutation remain pending.
- PDF-04: local pdfjs-dist6.3.289 Uint8Array, >300 rejected before worker writes, text items separated, empty pages skipped, locator_page 1-based, filename title/content hash, document IDs retained on unchanged upsert; existing chunk/embed reused. Real parser fixtures 2/300/301 pass; real DB documents/chunks pending.
- PDF-05: exact scan reason «в PDF нет текста (скан) — распознавание вне MVP»; fixed safe page-limit and damaged/password reasons. Parser calls alone map to JobOutcome, never raw parser errors; library cleanup in finally. Real image-only/empty/damaged fixtures pass units; runOnce -> DB -> job API reason assertions written and pending.
- PDF-06: source/account owned-file read requires exactly one row; source_file.pages/document writes protected by running/fence row FOR SHARE plus checkpoint/signal. Real DB tests cover cardinality, closed/stale fences, concurrent renewed worker, per-page lease/ceiling stop, abort, partial embed failure -> same-job retry/cache, zero calls on unchanged reindex. Unit checkpoint/abort/nonparser error propagation passes; DB execution pending.
- PDF-07: functional labeled accept file input, multipart fetch, upload pending/accepted/error feedback, refreshed source/job progress, live-task and upload/refresh disable. Filename stays React text. Browser checks at390/1440 overflow/JS/progress/error and real upload remain pending.
- PDF-08: final local Node22 typecheck, focused units and db/rag/worker compilation pass. One fresh full Docker typecheck/all-unit/all-integration/full build, source-bound UI preflight/UI checks, independent Astra review and cleanup are coordinator-owned and pending. No commit or feature acceptance claim.

Minimal existing helper change: apps/web/src/server/jobs-handler.ts dispatches multipart on the published source endpoint; existing JSON site handler remains intact. The route/runtime already delegates here, so this avoids a second dispatch. Main wires both site/pdf; crawl success notes remain site-only. No manifests/lock/schema/compose/config/roadmap/F05 history edits, no donor reads, Docker attempts, dependency installs/searches, secrets, live provider calls, deployments, merge, commit or push.

## Exact local checks

All Node/npm commands prepend /tmp/n6b-f06-node22/bin to PATH; cwd is projects/06b-rag-class. Final captured checks below use the identical 14-file snapshot.

| Check command | Exit | Result / evidence |
|---|---:|---|
| `npm run typecheck` | 0 | Pass root and web TypeScript checks. tests/artifacts/pdf-source/typecheck.txt |
| `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/pdf-handler.test.ts apps/web/tests/unit/jobs-handler.test.ts services/worker/tests/unit/pdf-extract.test.ts services/worker/tests/unit/crawl-rules.test.ts services/worker/tests/unit/crawl-site-correction.test.ts services/worker/tests/unit/job-guards.test.ts` | 1 | 57 passed / 1 failed; unchanged crawl-rules child-process spawnSync EPERM. PDF suites passed. tests/artifacts/pdf-source/focused-unit.txt |
| `./node_modules/.bin/vitest run --config vitest.int.config.ts apps/web/tests/int/pdf-sources.int.test.ts services/worker/tests/int/pdf.int.test.ts` | 1 | Not executed: global setup reports all three required test DB variables absent; no DB connected. tests/artifacts/pdf-source/focused-integration.txt |
| `npm run build --workspace @n6b/db` | 0 | DB compilation pass. tests/artifacts/pdf-source/build-db.txt |
| `npm run build --workspace @n6b/rag` | 0 | RAG compilation pass. tests/artifacts/pdf-source/build-rag.txt |
| `npm run build --workspace @n6b/worker` | 0 | Worker NodeNext compilation pass. tests/artifacts/pdf-source/build-worker.txt |
| `node --version` | 0 | v22.22.3 tests/artifacts/pdf-source/node-version.txt |
| `git diff --check` | 0 | Pass whitespace check. tests/artifacts/pdf-source/diff-check.txt |
| `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/pdf-handler.test.ts apps/web/tests/unit/jobs-handler.test.ts services/worker/tests/unit/pdf-extract.test.ts services/worker/tests/unit/crawl-site-correction.test.ts services/worker/tests/unit/job-guards.test.ts` | 0 | 51 tests / 5 files passed; tests/artifacts/pdf-source/focused-unit-sandbox-compatible.txt. This is the same final source, narrowed after the recorded sandbox EPERM failure. |
| `git diff --check` (after handoff docs) | 0 | tests/artifacts/pdf-source/final-diff-check.txt |

Earlier implementation probes (recorded in native tool transcript): `npm run typecheck` first exited2 because pdfjs6 DocumentInitParameters no longer accepts isEvalSupported; removed that obsolete option and used installed local types. Two later pre-freeze `npm run typecheck` commands exited0 after related implementation/test edits. The initial `vitest run --config vitest.config.ts apps/web/tests/unit/pdf-handler.test.ts apps/web/tests/unit/jobs-handler.test.ts services/worker/tests/unit/pdf-extract.test.ts` exited0 with23 tests. These are development probes, not substitutes for the final captured run.

## Source file SHA-256 snapshot

Snapshot: tests/artifacts/pdf-source/implementation-source-hashes.json; SHA256: 48be0279b722c9827c2e7ba0515020cb0de4f948c29383c8c72b06cd73c1afbb. All14 entries verified unchanged immediately before this atomic receipt. HEAD is baseline plus these uncommitted source/test edits. Build image identity is null; local compilation does not prove Docker image/UI identity.

| Project-relative path | SHA256 |
|---|---|
| apps/web/src/app/cabinet/add-pdf.tsx | 12adde97db7c293c86e3b157b3b22b2528251954b1e220426f33137495fd81a9 |
| apps/web/src/app/cabinet/page.tsx | 830cb003e70baddc7a3ee50b81f3fe0f0a7ee6204ca22d2525d6ebdf11ceb027 |
| apps/web/src/server/jobs-handler.ts | 1b6a54baf2e47c203aeb09fbec3ba234d2822ec9280e893636051b762c726fc3 |
| apps/web/src/server/pdf-handler.ts | 6989eb874cd1ebd6f5d19ec1b9de229c2ac3653cc4524a2b6df5dad73f97f765 |
| apps/web/tests/int/pdf-sources.int.test.ts | acb895c8f91b862a0ab6b579bc5f971974460bafcc5f6f696cde8fa0e45553b3 |
| apps/web/tests/unit/pdf-handler.test.ts | 1406bcf14c38e79451b994b68f534670b415f4e5d5dd03d0bb2fdde83683ba76 |
| packages/db/src/index.ts | db5eaac297eae0d8afd3f2335e2b625335c8b8d97ecef78fb9512b952af0eafd |
| packages/db/src/pdf-sources.ts | 7723a4511017075321cc4bca01b5b6c01027a5564f43192e4151d77a20889156 |
| services/worker/src/main.ts | bf86b8f3bc7291b30ed5834c0d31014c34ae1755730a86fa45a7e79f274fcec0 |
| services/worker/src/pdf/extract.ts | 61c3fc1aa43317c03662a6ede1610d2a1ab8cc58618a14d6345a5cb10dc83c85 |
| services/worker/src/pdf/store.ts | f09dd7d5800374bac9399d58e6e044de9088e77d31bccde26fedb5a6ec4f6137 |
| services/worker/tests/fixtures/pdf.ts | 0487c5e46e50bcbe6265698b7a02d10e1eb6c55c198684a7ddabfdd293d3396b |
| services/worker/tests/int/pdf.int.test.ts | 7c6fa1659abcc5d06432d266cb05873d56987ee2fee1074220f23036544a4dae |
| services/worker/tests/unit/pdf-extract.test.ts | d26d478b5b23e64b9b234e58768e918969bc83f53b86b3ed7432f6e5788e5a32 |

## Evidence and pending coordinator gates

- Exact commands, exits, start times and elapsed: tests/artifacts/pdf-source/implementation-checks.json; narrowed focused run: focused-unit-sandbox-compatible.json.
- Completion map: docs/features/pdf-source/05_completion.md (SHA256 6e3652207a980dde9bacc73932db8b50b2d3955050526276c248d1c953b2040e).
- Real DB mutation instructions: tests/artifacts/pdf-source/mutation-handoff.md (SHA256 f3f876a02f12f4e5d535b1f6af8f55ea1ebbda25ad5ece7433410bae0fe279bc). Fixed concurrent-cap test must run red after changing only `>= 3` to `>= 4`, then green after exact-byte restoration; require assertion failure rather than environment failure. No red/green pass claimed here.
- Execute real DB F06 tests and mandatory fresh Docker Node22 typecheck/all-unit/all-integration/full build after final source freeze. Local integration exit1 is a blocked execution, not a passed DB test.
- Readiness preflight immediately before source-bound real browser PDF validation at390/1440; independent Astra review, resolve concrete findings, rerun affected checks, cleanup. Existing F05 evidence cannot count as F06 validation.
- Caller owns remaining telemetry/native usage/model reconciliation and source-bound integration commit after mandatory checks. No historical records rewritten. Savings not established; measured usage/cost/model gaps remain null.

Terminal status describes this bounded code work unit only. Full feature acceptance is explicitly pending the gates above.

Status: completed
