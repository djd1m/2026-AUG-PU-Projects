# V03 crash branch correction

Work-Unit-ID: n7-v03-crash-bdd
Attempt-ID: correct-v03-1
Baseline-Revision: 712a986e27986602db94d201973f6da78e549998
ROUTE: XL subject; bounded documentation-only acceptance correction, budget5minutes.
Corrected: Specification.md SC-US-006-3 and tests/security-scenarios.md same ID.
Both BEFORE and AFTER transaction COMMIT are explicit Examples. Unseen S makes
rollback observable independently of already-counted R. Before commit requires
zero partial durable page observations/effects and unchanged cursor C; restart
keeps same run/H and replays from last committed cursor. After commit retains C2.
Both end R=1,S=1 and zero dispatch until full coverage plus same-validity tail poll.
Pseudocode.md already REALISES SC-US-006-3 and requires atomic page/cursor commit;
no algorithm change or backend execution is claimed. Historical evidence
correction-scenarios.json is preserved; this receipt supersedes only its SC-US-006-3
text. No new scenario ID, unrelated finding, HTML change or browser rerun.

Fresh review scope≤3min: only this scenario's two branches against
validation-recheck-report.md N7-V03, Specification.md and Pseudocode.md ingestion.
Allowed output docs/validation-v03-report.md plus caller-preallocated unique receipt.
Do not rewrite prior reports. Actual model/usage unknown=null unless runtime proof.

Status: completed
