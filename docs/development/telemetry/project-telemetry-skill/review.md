# Independent review receipt: project-telemetry-skill / review-1

Reviewed the uncommitted local skill at `.claude/skills/project-telemetry` in read-only mode against root `CLAUDE.md`, `docs/development/model-routing-telemetry.md`, `projects/TELEMETRY-AGENT.md`, `.claude/rules/skill-interface-protocol.md`, and the Codex `skill-creator` guidance. No product runtime, network, application checks, or source edits were performed. Synthetic fixtures were isolated under `/tmp`.

Snapshot reviewed:

- repository HEAD: `36b17cae877f5cf9204cf59a1c97eb1eece1db60`
- `SKILL.md`: `44eda5f707d6c8a60d9a29133a5319dbe5018d6311c84074444d42095e86dc09`
- `references/analysis.md`: `ccc0ec5249fff30c0fedf6ed87d40a7a31e179609e7596691e2b92255efa4cd0`
- `scripts/analyze.py`: `277ba0ed123d0a3dabfb45c78cc2ccc6ccb9627193cfab3296ea8d48e363b0cf`
- `scripts/test_analyze.py`: `4ab813c03e6935ba845e04d61c0dc6a7df0f8b7ac63f13a330f292e3d7f90ea8`

Verdict: PASS for the requested bounded skill review. No unresolved must-fix finding remains in the reviewed snapshot.

Material findings and disposition:

1. The initial extractor silently chose `type` over conflicting `event`, chose `timestamp` over conflicting `at`, and paired attempt endpoints whose stage or run differed. A hostile fixture therefore could have produced a precise stage duration from contradictory evidence. The implementation now reports the conflicts, excludes those events/endpoints from interval calculations, and checks event `run_id` against the passport. Re-running the hostile fixture produced two explicit line-located issues and no attempt interval.
2. The initial extractor accepted an empty `{}` passport with an empty `events.jsonl` as one clean run and would have returned CLI exit 0. The implementation now reports missing/invalid `run_id`, `status`, and `started_at`, reports an empty journal as unknown chronology, and the same fixture maps to exit 2.
3. Duplicate event IDs are excluded symmetrically rather than retaining the first occurrence, and scaled numeric metrics are checked for overflow/non-finite results. Focused tests cover these cases.

Behavioral assessment:

- Numeric claims are deliberately limited to normalized elapsed/active aliases, timestamp-derived elapsed duration, individually paired attempt intervals, and unioned paired wait intervals. The skill text correctly warns that agent-duration sums are not wall time or a critical path and that partial wait coverage is only observed evidence.
- Unknown values remain `null`; usage, cost, actual-model verification, acceptance, and forecasts are not inferred by the script. The analysis reference gives sound gates for causal comparisons, small-sample forecasting, censored runs, usage deduplication, tariff snapshots, and quality-first comparisons.
- Malformed JSON, duplicate JSON keys, malformed JSONL rows, duplicate event IDs, non-finite/overflow metrics, invalid or conflicting duration aliases, timestamp conflicts, negative/ambiguous intervals, symlinked sources, missing selections, empty passports, and empty/missing journals are surfaced rather than silently converted to zero.
- The instructions are usable by both Claude Code and Codex through an explicit path-based prompt even when the host does not auto-discover `.claude/skills`; the script also documents resolving its path relative to the copied skill directory. Its repository-specific telemetry dependency is explicitly conditional on being in this monorepo.

Verification completed:

- `python3 .claude/skills/project-telemetry/scripts/test_analyze.py` — 12/12 passed.
- `python3 /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py .claude/skills/project-telemetry` — passed (`Skill is valid!`).
- `python3 -m py_compile .claude/skills/project-telemetry/scripts/analyze.py` — passed.
- `git diff --check -- .claude/skills/project-telemetry` — passed.
- Hostile alias/run/stage fixture — conflicts reported and no interval emitted.
- Empty passport/journal fixture — four completeness issues and effective CLI exit 2.
- Real corpus smoke was observed by the coordinator across 31 runs; this independent pass also exercised the analyzer read-only on the 18-run `projects/03-affiliate-rewardful/docs/telemetry` subtree and saw expected explicit legacy chronology/interval gaps rather than a crash.

Limits: this was a static and data-extraction review. It did not verify external usage provenance, current pricing, provider model metadata, acceptance receipts, application behavior, or forecast calibration because those require run-specific evidence outside the helper's intended responsibility.

Status: completed
