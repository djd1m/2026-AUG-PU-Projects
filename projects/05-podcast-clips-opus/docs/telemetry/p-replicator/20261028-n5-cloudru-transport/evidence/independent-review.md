# Independent cold Cloud.ru transport review

Verdict: PASS for scoped code review; no concrete blocker found. This is not final delivery acceptance: full M gates, mutation receipts and target Node22 verification remain integration-owner responsibilities.

Frozen candidate: `de12c7eb327dec11d44349d1cf92b38d41f42626`; baseline: `8c691387402378e1f491526799cb2e63caade6d4`.
Repository: `/tmp/n5-acquisition-analytics-20261026`; project: `projects/05-podcast-clips-opus`.
Planner input: `/tmp/n5-cloudru-transport-plan-20261028.md`, SHA256 `cd48e9eed9f8b60d58c9274ca8153872206c5c459e34fee0bf988a2c1b35b9e1`.
Root-authorized refinement received at launch: three meaningful mutants suffice; full M gates retained.
Cold input consisted of planner, frozen diff/tests, repository instructions and direct caller/constructor context. No coder chats, traces, logs or pre-existing result receipts were read.

Reviewed exactly: worker `src/llm/provider.ts`, `src/llm/cloudru-transport.ts`, project `tests/cloudru-transport.test.ts`, worker `package.json`, project `package-lock.json`; direct context includes existing `cloudru-provider.test.ts`, `workers/select.ts`, runtime/fake construction and installed Undici cleanup implementation. No source/package/deploy/secret/provider mutation was performed.

Findings supporting PASS:

- Worker dependency and lock pin the same public `undici@7.30.1`, integrity matches planner. Per-selection Agent sets both phase limits to 600000, is passed only on Cloud requests, and is destroyed in `finally`, including injected fetch and body failure paths. Using destroy also after success is safe once JSON has been consumed and gives deterministic ownership cleanup.
- Existing combined caller/application signal remains attached through native fetch and response JSON, with post-await checks. Cloud cap is 600000; OpenRouter shared 240000 cap and request routing/body are unchanged. No retry, alternate endpoint, fallback or global dispatcher was introduced. Fence/quota/spend caller behavior is unchanged.
- Native transport errors are reduced to fixed kind and explicit allowlisted codes; HTTP status is bounded 100..599; getter execution is avoided for error/cause/code diagnostics. Original transport errors, arbitrary messages, cause, headers and response body are not retained in generated provider errors. Cancellation failure cannot replace the safe HTTP status. Existing schema classification remains intact.
- New loopback tests exercise production selector wiring plus real Agent/native fetch for delayed headers and delayed body: short phase bound fails with the matching safe code; longer bound succeeds; caller abort rejects promptly; owned dispatchers are disposed and sockets close. OpenRouter has no dispatcher. Existing provider tests independently cover total deadlines in both phases, caller cancellation and rejection of late injected results. These are substantive behavioral tests rather than copied implementation assertions.

Reviewer execution (fresh): `npx --no-install vitest run tests/cloudru-transport.test.ts tests/cloudru-provider.test.ts`, project directory above; exit 0; 2 files, 24 tests passed; Vitest duration 8.45s, including both actual loopback phase cases. This reviewer run uses the available host runtime, not a claim of target Node22 runtime verification. No full build/regression/lint/typecheck or mutation execution was duplicated; integration owner owns those gates.

Profile: bounded independent REVIEW, tier M. Requested model/effort: Sol/high. Actual exact model and effort: null; host execution attestation is unavailable to this agent. Usage input/output/reasoning/cached tokens and cost: null; no host usage export. Review duration: under 3 minutes including instructions, inspection and focused verification (precise launch timestamp unavailable; do not interpret as measured elapsed). E2E readiness: not_applicable, no product E2E or paid provider call performed.

Status: completed
