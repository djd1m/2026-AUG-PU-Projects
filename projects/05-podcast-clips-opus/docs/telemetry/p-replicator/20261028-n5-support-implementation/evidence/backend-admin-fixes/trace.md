# AC7 bounded staff diagnostics corrections
RUN_ID:20261028-n5-support-implementation
WORK_UNIT_ID:support-backend
Attempt-ID:support-admin-stage-precision-ledger-fix-01
Source-Revision:48fcfc11ad88b5875677b27ff59c77959b2ee41c
Baseline-Revision:c54a013a9ce671b00a9cdca2b5ed3261824ee42d
Root-Candidate-Revision:68a2943a (independent review packet)
Spec-SHA256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Original-Launch-SHA256:f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Correction-Launch:root explicitly grouped three confirmed AC7 findings into15min admin attempt AFTER proof receipt
Finished-At:2026-10-28T03:00:28.510362+00:00
Observed-Check-Start:2026-10-28T02:52:39Z
Observed-Elapsed-Seconds:469.510
Verdict:PASS for all three scoped admin corrections; integrated feature acceptance remains root-owned

1.Stage:jobs now includes latest actual job_attempt.stage correlated by owned video, ordered by monotone fence then created_at/id, with existing safe video status/failure/progress/times. LIMIT20videos preserved; no raw logs. RealDB test reads select then later render, with a foreign video's higher fence deliberately present; correct owned stage wins. Render fixture includes required clip+clip_link, preserving existing production trigger.
2.Cursor:opaque cursor uses exact PostgreSQL created_at::text; timestamp is no longer converted through JS Date.toISOString and losing microseconds. Existing Date.parse validation,UUID tie-breaker,authority check and25cap preserved; internal cursor_at stripped from public items. RealDB inserts57accounts with identical .123456 timestamp and traverses every schema account exactly once in DB order, no omission/duplicate; cursor contains all six fraction digits and public list item fields unchanged.
3.Ledger:read-only UNION projects existing owned credit_grant and owned-video video_credit_charge rows as id/kind/delta/status/at/source/video_id, latest20combined. delta is seconds:grant positive total; settled charge negative billable_seconds; reserved/released charge delta0 with actual status, avoiding a false spent-credit claim. Existing balance read unchanged. RealDB verifies signup grant1800 and settled debit-300 both visible, foreign debit excluded,25newdebits reduce combined returned history to20, and no object/token/password fields. No money writes,newtables/dependencies or UI changes.

Final exact-test red/green:old admin source3failed/24passed→fixed27/27PASS,0skipped,12.64s. Includes earlier authority,privacy and proof-lock checks. First green attempt exposed an incomplete render fixture; corrected fixture with actual required clip/link, no guard weakened; historical failed logs retained. Final old-source mutation rerun on corrected fixture and restored safely before final green. DB build,web typecheck,lint,diff-check exit0. No full Next build or overall acceptance claim.
Checks-Receipt:/tmp/n5-support-backend-checks-20261028/stage-fix-01/checks-final.json
Checks-Receipt-SHA256:ae772cbc5a6ca3554d90790f3177c9b2481ee0e8a367628e6ecfc7ef2b1eda73
All per-command private0600 log paths/hashes and source/test SHA snapshots are recorded in JSON and revalidated against this commit.
Changed source:
- projects/05-podcast-clips-opus/packages/db/src/support-admin.ts:SHA256 a9fc1743a33dc553e1685d8822cdf785215b5f7d8527a88eef09089fd6905841
- projects/05-podcast-clips-opus/tests/support-email.integration.test.ts:SHA256 55947e5484a03a958d6bdfbf277e0e0ae60d3387fd28ae0935c4744d8c62421a
Commit:48fcfc11ad88b5875677b27ff59c77959b2ee41c
Worktree:clean
Files remain below500lines(78and234).
Requested model:gpt-6.1-sol medium; actual model/usage/cost:null,host metadata unavailable.
Next executor:root verifies/merges this commit after preceding context/proof commits, runs complete integrated types/full regression/dependent build and continued independent/browser acceptance. No pending scoped admin implementation remains; other feature gates remain root-owned. No production keys,paid calls,mail,new services/schema changes or permission expansion.
endStatus: completed
Status: completed
