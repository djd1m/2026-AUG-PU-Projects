**Local evidence does not establish that a 1M context window caused weekly usage growth.** Every sampled usage event reports `model_context_window=258400`; no sampled request exceeds 272,000 input tokens. Maximum supported capacity and transmitted input are different measurements.

Scope: read-only audit on **2026-10-06 UTC**. Screened 112 session headers, measured 16 relevant sessions, and used eight unchanged files for final statistics, covering October 3–6. Selection favored recent sessions, large sessions, and previous-day sessions; it is not a representative weekly sample. Eight live/recent files were excluded from final statistics. No selected file was truncated.

| Final cohort measurement | Result |
|---|---:|
| Per-request observations | 3,199 |
| Duplicate cumulative snapshots removed | 181 |
| Median / largest input per request | 114,509 / 236,692 |
| Requests above 272,000 input | 0 |
| Cached input ÷ inclusive input | 97.93% |
| Compaction records | 16 |

Cumulative increments matched `last_token_usage` throughout; no identical usage events crossed files. **Parent-inclusive usage may still overlap child usage**, so these distributions are descriptive and no grand billing total is claimed.

Representative per-session measurements:

| Recorded runtime | Requests | Inclusive input / cached subset | Inclusive output / reasoning subset |
|---|---:|---:|---:|
| Previous Astra/high session | 1,551 | 197,427,355 / 194,484,352 | 468,591 / 102,650 |
| Current Astra/high session | 970 | 108,554,741 / 106,505,856 | 451,803 / 147,880 |
| Sol/high session | 345 | 37,941,618 / 36,828,032 | 251,568 / 81,056 |

Cached tokens are included in input; reasoning tokens are included in output. Neither subdivision was added twice.

N7’s work record contains **55 distinct attempts: 36 completed, 18 failed, one active**. These are workflow records, not billed requests. Its telemetry has 18 null usage entries, no numeric usage objects, and null run-level input, output, and cost totals. Missing native usage remains unknown.

**Unknowns:** actual main-host configuration, a dated transition to 1M, complete before/after weekly usage, and account credit weighting. Token volume cannot be translated directly into weekly credits without model, reasoning, cache, and billing evidence.

**Plausible contributors:** repeated requests carrying roughly 100k-token histories, many bounded attempts, and substantial high-effort/Astra activity. These are supported workload observations, not proven causes of the weekly increase.

Context-management actions preserving AC and required checks:

- At phase boundaries, hand off a compact packet containing accepted revision, remaining AC, constraints, failed-check evidence, required checks, artifact references, and next executor.
- Keep the required planner-only reviewer context and `fork-none`; attach narrowly relevant evidence.
- Bound file/log reads and reference existing evidence instead of repeatedly loading full histories.
- Give each retry a concrete correction and completion check; retain required validation.
- Trial earlier compaction and approved medium-effort routing for routine work. Compare per-request usage, rework, and identical acceptance checks before adopting changes. No savings percentage or quality guarantee is established.

Source SHA-256 prefixes for the eight final files: `e7f630e7fc85`, `c65aaf295122`, `256b29a895e0`, `b72c56db475f`, `ee60e4432f8f`, `5b35f5241c8c`, `7b266b0617be`, `bf867fd822c1`. Full-digest manifest fingerprint: `dd32c6864ccd255e8f2d9a02ae8e760acb0f0d8c9dadd1e85175ded3a1e8ddb1`. N7 run/work-record/events digest prefixes: `28d9e7d3ac5f` / `938f9a044452` / `b40be325a3f6`.

This auditor’s recorded runtime is **gpt-6.1-sol/high**. At 18:06:53 UTC, cumulative usage was 239,335 input, including 188,544 cached; 7,783 output, including 1,910 reasoning. This excludes subsequent reporting usage.