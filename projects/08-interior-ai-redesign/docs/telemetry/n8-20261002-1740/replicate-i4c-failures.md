# Observed local failure and correction
Initial new-unit invocation: `/tmp/n8-node22 --test --test-concurrency=1 tests/replicate-cleanup.test.js`, exit1; 7 pass / 1 fail. Original stdout was returned in the tool transcript, not redirected; this is its relevant observed excerpt, not a reconstructed full raw log:

```
# Subtest: unknown, quarantine, missing/future timestamp and retention boundary unresolved zero HTTP
not ok 5 - unknown, quarantine, missing/future timestamp and retention boundary unresolved zero HTTP
location: tests/replicate-cleanup.test.js:60:1
error: Expected values to be strictly equal: 0 !== 1
expected: 1
actual: 0
stack: tests/replicate-cleanup.test.js:65:12
```
The immutable snapshot's missing/invalid submitting timestamp compared NaN to NaN, making the claim appear stale before unresolved disposition. Fixed `sameTime` permits identical raw invalid values while retaining timestamp equality for valid DB Dates. Rerun8/8 green, later required crash/timeout cases added; final10/10 green in cleanup-units.log. Mutation's deliberate failure stdout/stderr and hashes are in mutation.json; initial mutation evidence preserved separately. No failed PG run exists: PG was not executed by author.
Two incidental read-only discovery commands returned exit1 for guessed nonexistent db filenames after other reads completed. Canonical db/007 and actual db/001.sql/002-generation.sql contents were located with rg; no change depended on nonexistent files.

First snapshot generation returned exit1 before writing a snapshot: `git rev-parse --show-prefix` already had a trailing slash, so a second slash made `git show HEAD:projects/08-interior-ai-redesign//.env.example` reject the path. Corrected prefix normalization only, then reran the read-only protected-map hash check. No product/test bytes changed and no snapshot was falsely reported as passing.
