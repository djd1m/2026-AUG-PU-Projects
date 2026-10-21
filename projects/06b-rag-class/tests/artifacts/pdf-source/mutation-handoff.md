# Fixed real-DB cap guard mutation: pending coordinator execution

No red/green result is claimed. Local real DB global setup refuses because TEST_DATABASE_URL_OWNER, TEST_TENANT_PASSWORD and TEST_SERVICE_PASSWORD are absent; Docker is outside this executor's allowed scope.

Use the coordinator's isolated Node22 test environment with real Postgres and the existing migration/tenant roles. Do not expose a DB port. Never mutate the fixed test or accept a startup/env failure as an expected red.

1. Verify packages/db/src/pdf-sources.ts SHA256 against implementation-source-hashes.json. Save its exact bytes outside git. Require the file contains exactly one `if (Number(count.n) >= 3) return 'cap';`.
2. Replace only that statement with `if (Number(count.n) >= 4) return 'cap';`. Confirm bytes/hash changed. Rebuild the source-bound candidate if the test image copies rather than mounts the source.
3. Inside the real Node22 test environment, run exactly:

   `./node_modules/.bin/vitest run --config vitest.int.config.ts apps/web/tests/int/pdf-sources.int.test.ts -t 'PDF-03 cap: 10 concurrent requests'`

   Required red: exit 1 from the fixed test assertion, with two accepted uploads instead of one and/or eight 409 instead of nine. A DB/setup/import/environment failure is inconclusive and does not satisfy the mutation requirement.
4. Restore the exact saved file bytes in a finally/cleanup path regardless of red result. Require its SHA256 equals the snapshot again. Rebuild if necessary. Run the same command unchanged.
5. Required green: exit 0, one passing concurrent test (other tests may be filtered). Save both command outputs, exit codes, baseline/mutant/restored file hashes, exact source/build identities and timestamps under tests/artifacts/pdf-source. Record source drift and reconciliation if coordinator edits have already changed the snapshot.

The guard shares a real bot row lock across ten separate tenant transactions: at two existing PDFs, only one may enqueue. Do not replace it with a mocked cap or a source-text assertion. After restoration, run the one mandatory full validation on the final source, then browser UI and independent review. Existing full F05 evidence is not F06 evidence.
