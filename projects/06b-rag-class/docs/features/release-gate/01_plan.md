# F16 — release-gate: калибровка, CJM и квитанции

Run20261003T064351Z-release-gate; baseline58b49da642298d991679241ce26c508b22392aee.
15/16 функций приняты. Последняя не становится done по одному наличию скриптов.

## ROUTE и границы

Mechanical ROUTE before PLAN: threeexplicitpaths scripts/calibrate.ts, scripts/check-cjm.sh,
tests/calibration/questions.json -> S exit0 (2026-10-03T06:43:51Z).
Substantive M: release tooling reuses existing paid gateway and RAG pipeline; no changes to quotas/models/provider
or public authorization. Separate Sol high25min implementation/validation, fresh Astra medium8min review.
Read own Specification SC-US-006-4/FR6/NFR1, Completion, ADR003/004/010/014, model-cost/embed/long-job contracts.
No donors; even though OWN007 records permission for credential provision from N6, this author NEVER reads N6/secrets.
Root coordinates any private credential provision and explicit public stand authorization. Offline work continues meanwhile.
No public deployment/paidcalls/network/Docker by author. Existing external gates remain visible, not autoapproved.

## AC

- REL-01: deterministic frozen fixture website/corpus and exactly30questions (20 answerable,10 unanswerable)
  with expected factual evidence per knownquestion, missing detail identified per unknownquestion. Fictional material,
  no private data; UTF8hash identity captured beforelive. Do not revise a question after seeing live output withinsameattempt.
- REL-02: runnable bounded calibration CLI uses existing createLiveGateway + answerQuestion + actual PostgreSQL/search,
  pinned existing MODELS/provider routing and model-call/quota logging. No direct provider construction, no bypass,
  no fakevectors/answer mock in live mode. Fixture corpus may be seeded explicitly (state in report), but embed it via
  gateway.embedIndexBatch with conservative countTokens/minBatchTokens estimate. Test account is_test=true.
  Exactly30answer attempts maximum, sequential, at most30question embeddings+30generations plus bounded corpus batch;
  no automatic retry. Existing400 max answer tokens. Missing key/DB/explicit live switch -> exit2 without paidcalls.
  Script limits fixture bytes/token estimate and complete-run deadline; don't expose URLs with credentials or key.
  Database evidence sums model_call_log/quotas usage; cost unknown unless measured. Stop on provider unavailable, reportfailed.
- REL-03: true pass requires10/10 unknown outcomes WITH measured top retrieved similarity >= configured MIN_SIMILARITY
  for EACH negative (below_threshold nevercounts), >=17/20known correctanswerwithvalidexpectedcitation and factual
  keyword/value evidence. Report each case/status/similarity/outcome/citation IDs/elapsed/usage and aggregate.
  A transparent deterministic scorer and human-reviewable output required; unknowns10/10 cannotbe fabricated bythreshold.
  Capture actual question embedding from existing AnswerAttempt wrapper without an extra paidcall; search realvectors.
  Do not modify production threshold/prompt/algorithm to force a pass. Invaliddataseteligibility or timeout -> nonpass.
- REL-04: scripts/check-cjm.sh <explicitBaseURL> plus smallhelper drives real API registration→markis_test viaownerDB→
  createbotURL202/jobpoll bounded→sandbox citedanswer→publish/embed→visitorconfig/ask with explicit FOREIGN_ORIGIN→
  badge redirect/landingref. Only executed by coordinator against separately authorized environment.
  Requires fixed known SOURCE_URL and question, DBowner/testaccount marking and bounded attempt count; never quietly
  substitute localURL for issued productionaddress. A fetch Origin header test is API proof, NOT browser CORS/CSS/CSP proof.
  Exit0 only actualpass,1failure,2notexecuted/missingprerequisite. Preserve raw safe statuses/IDs, no password/sessionkeys.
- REL-05: offline substantive tests for dataset/cardinality, strict10highsimunknown/17known scoring, failure on
  low-simunknown/fake-mode/livegatemissing, budgets/no retries/errorreport, CJM missingprerequisites and protocolerrors.
  Use test dependency injection only within testtool boundaries, never productrouting monkeypatch. Meaningful scoreguard
  mutation RED→restoreGREEN desirable; no tests that merely echo implementation constants.
- REL-06: docs/calibration-report.md initially explicit NOTEXECUTED with exact commands/gates/fixturehash, never fakepass;
  docs/features/release-gate/05_completion.md maps pendinglive/actualstand/browser/rollback evidence. Preserve historical
  contractreceipts and append accurate linkage only afterexecution; no roadmapdone/publicready untilallmandatorygates.

## Minimal files

Allowed scripts/calibrate.ts plus up to2smallhelpers under scripts/calibration/, scripts/check-cjm.sh and
scripts/check-cjm.ts; tests/calibration/{questions.json,corpus.json,site.html} or small HTML fixturefiles;
packages/rag/tests/unit/release-gate.test.ts and/or apps/web/tests/unit/release-cjm.test.ts;
docs/features/release-gate/{02_validation,05_completion}.md; docs/calibration-report.md;
tests/artifacts/release-gate/{implementation-source-hashes.json,focused-tests.txt,typecheck.txt,mutation.txt}.
No productionmodules/package/lock/migrations/toolkit/globalconfig/Completionhistoricalcheckmarks changes.
Any necessary path adjustment documented and justified byAC; keep everyfile<500lines.

## Attempt and gates

Separate author≤1500seconds includingread/validation/code/localtests/typecheck/snapshot/fullreceipt. Nochildren,
Docker/network/ports/secrets/livecalls/commit/push. Node22/existingdeps available. RepeatROUTE beforeimplementation.
Coordinator executes mandatory verification and externalreadiness; author only writes offline checkedtools.
FinalCLI answer itself full sourceboundreceipt with exactlastlineStatus: completed orStatus: failed (codex-o overwrites).
Timeout ends attempt, not pipeline; disclose unfinishedwork and nextboundedstep. No optionalpolish/newvalidatorengine.
