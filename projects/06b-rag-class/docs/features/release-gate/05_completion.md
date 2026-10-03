# F16 author delivery — implementation-1

Run `20261003T064351Z-release-gate`; work unit `release-gate-implementation`;
source baseline `58b49da642298d991679241ce26c508b22392aee`.
Bounded offline author scope completed; F16 acceptance/public readiness NOT COMPLETE.
No production modules, dependencies/manifests, schema/grants, global configuration,
historical contract receipts, roadmap or Completion checkmarks changed. No commit/push.

| AC | Author result | Remaining external evidence |
|---|---|---|
| REL-01 | Frozen HTML/corpus/questions, exactly20/10, expected facts and omitted details; SHA256 in calibration-report | Independently verify hashes before live attempt and negative measured eligibility |
| REL-02 | Executable gated seed/calibration CLI, existing gateway/RAG/PG/ledger, conservative one-batch budget, sequential no-retry execution, safe failure report | Authorized real key/DB/config/quotas, actual runtime run and source/dist binding |
| REL-03 | Strict10 high-sim unknowns and ≥17 factual/cited known scorer; mutation guard fails when similarity check is weakened | Actual30-case live report, unchanged threshold/prompt/model and human semantic review |
| REL-04 | Explicit-base CJM shell/TS driver, owner marking before queue, job/status/answer/embed/visitor/badge/ref checks | Issued environment, fixed reachable fixture and expected evidence, fresh API receipt; separate browser proof |
| REL-05 | Focused substantive offline unit tests and root/web typechecks; missing-gate nativeCLI probes; score mutation RED→GREEN | Coordinator's mandatory full runtime/regression/security/contract/build/review checks |
| REL-06 | NOT_EXECUTED calibration report, explicit pending gates and commands, source snapshot and full receipt | Append fresh linkage to historical contracts only after real execution; F16/roadmap done only after all gates |

## Author checks

`node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/rag/tests/unit/release-gate.test.ts`:
final focused results in `tests/artifacts/release-gate/focused-tests.txt`.
`npm run typecheck`: root TS graph (new scripts included through test imports) plus web TS,
`tests/artifacts/release-gate/typecheck.txt`.
Similarity mutation: targeted low-sim unknown test red exit1, exact restoration green exit0,
`tests/artifacts/release-gate/mutation.txt`; restored scorer unchanged thereafter.
`npm run build --workspace @n6b/db` then `npm run build --workspace @n6b/rag`: exit0,
necessary to materialize workspace exports for the native tools; full unchanged product build not repeated.
Native calibrate/CJM/no-argument shell return2; shell syntax check exit0, `tests/artifacts/release-gate/native-cli.txt`.
Initial check failures preserved in focused-tests-initial.txt and typecheck-initial.txt:
raw corpus size guard corrected before deduplicating chunking; test public-id typo and readonly test assignments corrected.
No known author check failures remain; exact final check counts and hashes are in the terminal receipt.

Additional artifact paths route-implementation.txt, native-cli.txt, cjm-not-executed.txt and initial logs
are justified evidence for REL02/04/05 and the repeated ROUTE; no extra implementation scope.
Substantive M, mechanical S/exit0; independent preimplementation validation in 02_validation.md.

## Coordinator continuation (responsible owner)

1. Verify full source-bound author receipt against launch SHA and immutable snapshot; independently review the implementation.
2. Run mandatory full checks on that accepted candidate. Supplied F15 baseline646 unit/310PG/type/build/UI pass is historical,
   not a measured F16 result; author did not repeat unaffected full suites.
3. Resolve live key/access/spend prerequisites through existing authority, record read-only E2E preflight and actual runtime identity,
   run one bounded live attempt with frozen dataset; preserve any failure, never manufacture a release pass.
4. After separately authorized environment/public-stand work, run explicit issued-base CJM plus browser foreign-host CSP/CSS/CORS,
   privacy notice and badge proof, spend/long-job/embed contract evidence and rollback on the test stack.
5. Only after all agreed release gates pass update acceptance/roadmap and deliver the authorized result.

Public deployment authorization, live eligibility/results, browser proof, rollback and actual stand receipts remain pending.
This is a handoff to the coordinator, not a declaration that those steps are running in the background.
Author did not start network/Docker/ports/live calls or read secrets/donors; no child agents were spawned.
Profile compact-quality-first-v2. Requested gpt-6.1-sol/high; worker has no authoritative actual model/effort/usage/cost counters.
Telemetry run/events/work-record remain owned by the coordinator at `docs/telemetry/p-replicator/20261003T064351Z-release-gate/`.
The author receipt supplies measured wall time and check results; unavailable usage/cost are null, no estimated usage substituted.
