# N8 owned synthetic backup/restore — PASS

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-f06-restore-1
ATTEMPT_ID: n8-f06-restore-1
Source-Revision: 8030270f023d83c9cdd597c4578517a1b58b4b35
Launch-SHA256: 62af77b5e91e84aa9ba68bb2f72a2e73ec435107f6d74e153ac2a27ef129be8d

Actual standard pg_dump custom format → pg_restore into a newly created distinct owned DB: 21 tables/451 rows, full-row aggregate digests and constraint definitions equal; source-before equals source-after. Ownership/CPU/noports/quiescence/schema6 gates verified. Started 2026-10-03T03:28:43.410555+00:00, finished 2026-10-03T03:28:59.555391+00:00, 16145ms. Target DB and raw0600 dump removed. Only synthetic ownfixture used; no live database or secret values read/output.

Separate standard tar recovery:10 synthetic privatefiles/8243bytes, hash equality,127ms; rawcopies/archive removed. This proves data/file recovery, not an application restart against the restored pair or operational RPO/RTO. Result metadata in docs/features/f06a-restore. Original ownstack/network/volume and privateenv removed after checks, cleanup0. Sharedbrowser retained. Coordinator mechanical execution; no new product implementation/model switch. Usage/cost null.

Status: completed
