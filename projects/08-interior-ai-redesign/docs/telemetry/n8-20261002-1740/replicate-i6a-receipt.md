# I6a author terminal receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i6a
Attempt-ID: replicate-i6a-1
Source-Revision: 714901f6c59f0e6e51d5d0033eed8943020ccc4c
Build-Revision: null
Launch-SHA256: 6dc626e3dafb37899297c1a627ad8cb35166faf3c7bff977b901b25fc921e55f
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Started-At: 2026-10-03T14:14:49Z
Source-Frozen-At: 2026-10-03T14:28:37.561518+00:00
Finished-At: 2026-10-03T14:30:24.023154+00:00
Elapsed-Wall-Ms: 935023
Elapsed-Since-Launch-Ms: 947211
Verdict: pass (local author implementation/checks only; real PG mutation and independent review pending)

Profile: compact-quality-first-v2; substantive XL, existing owner approval/autonomy retained. Mechanical author ROUTE S exit0 is a lower bound. Sole requested gpt-6.1-sol/high author; actual model/effort, usage and cost null until host metadata. No fallback/model switch/delegation. Active time null: no host interval measurements. No run events updated.

Substantive owned files: scripts/mutation.js (177 lines), tests/replicate-send-cas.integration.test.js (165 lines), tests/mutation.test.js (174 lines). New kind performs guarded disposable mutation, exact named TAP recognition, restore/retest and persistent raw evidence. Test uses real I1/I2 and same submitting identity, deterministic held-response gate, fixed trusted DB timestamp and separate ambiguous-response no-replay regression. Protected product modules/DB/fixtures/config/packages are unchanged.

Checks: Node22 runner units8/8 GREEN; new PG test syntax exit0; scripts/check.js exit0; git diff --check exit0;49 protected files match initial bytes and accepted source; spec/launch SHA256 exact; scope/snapshot guard exit0. Missing explicit evidence CLI exits1 as expected, before copy or DB. All source files below500 lines.

Failure retained: initial runner units7/8 RED because passing TAP diagnostics were counted as failed leaves. Corrected failureType filtering; affected units rerun8/8 GREEN. Both original and corrected raw logs are retained. Harness-only unit probes do not count as real PG mutation acceptance.

Evidence: docs/features/f07-replicate/i6a-implementation.md (exact CLI/API/proof/pending runtime); docs/telemetry/n8-20261002-1740/replicate-i6a-author.json (checks/log digests/times/null usage); replicate-i6a-snapshot.json (PROJECT-relative product_test_files SHA256, protected hashes/source/spec/launch/diff binding); replicate-i6a-source.diff (tracked edits; new test separately hash-bound); replicate-i6a-mutation-units.log; replicate-i6a-mutation-units-r1.log; replicate-i6a-pg-syntax.log; replicate-i6a-static-check.log; replicate-i6a-protected-hash-guard.log; replicate-i6a-cli-preflight.log; replicate-i6a-author-route.log. Paths without directory above share this receipt directory.

Exact parent CLI from project root inside existing owned Node22/PG16 environment, secure test URL already supplied and ownership marker n8-f07-replicate:

```sh
node scripts/mutation.js replicate-send-cas /evidence/replicate-i6a-1
```

Evidence leaf must be absent beneath a separate writable mount; source and resolvable existing dependencies read-only. CLI exit0 requires actual baseline0, exact named ERR_ASSERTION expected1/actual2 mutant1, restored0 and identical source/test/runner hashes. Raw baseline.log/mutant.log/restored.log and receipt.json persist before disposable cleanup. DB/syntax/timeout/remaining redundant guard is inconclusive, never acceptance.

Remaining/next executor: parent owns actual full baseline→mutant→restored realPG run and fresh Astra review, then I6b mockUI/env/compose → I7 full/docs → I8 actual sharedDockerUI. Parent runtime has not been started by this author; no claim of background work. Companion author E2E preflight not_applicable: no actual PG/E2E authorized here. No commits/push, PG, Docker, network, provider requests, real credentials, installs, host listeners, global config or paid activation performed. External spend authorization0; actual host model cost remains null.

Status: completed
