Fixed the bodyless “New client” POST: empty readable streams now reach client creation. Nonempty-body validation and authorization checks remain enforced.

Typecheck passed; 10 focused tests passed. Restoring the original handler caused 2 failures; exact-byte recovery restored all 10 passes. Full regression/build/real UI checks remain coordinator-owned.

Report: [09_correction.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-studio-subaccounts/projects/06b-rag-class/docs/features/studio-subaccounts/09_correction.md). Checks and frozen hashes: `tests/artifacts/studio-subaccounts/{correction-1-checks,final-source-hashes}.json`.

Profile: `compact-quality-first-v2`. Requested model: `gpt-6.1-sol/high`; actual model, effort, usage and cost unavailable. Elapsed: 288.259 seconds. Telemetry: `docs/telemetry/p-replicator/20261003T031332Z-studio-subaccounts/events.jsonl`.

Run-ID: 20261003T031332Z-studio-subaccounts
Work-Unit-ID: studio-subaccounts-correction
Attempt-ID: correction-1
Source-Revision: 902d31343bcfb05819dcca0d8009873679d0f292
Build-Revision: none
Launch-SHA256: ab553415a37710f175e81d09e60c79f20c489061f2e2e8c78e3d2474f7360615
Snapshot-SHA256: dd55491ba57d829f51f15a1b2a6c6ffb2b055151d852986d54afb53327085b02
Finished-At: 2026-10-03T04:05:19.413754+00:00
Status: completed