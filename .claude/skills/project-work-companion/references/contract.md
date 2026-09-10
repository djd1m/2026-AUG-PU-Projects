# Work-record contract

Use `assets/work-record.json` as a field guide. It is intentionally non-passing
until real roots, revisions, decisions, evidence, and expectations are supplied.
The validator accepts JSON only and rejects duplicate keys.

## Identity and references

- `identity` carries the existing `run_id`, current `work_unit_id`, and
  `current_attempt_id`. `telemetry.run` and `telemetry.events` are rooted links to
  the caller's existing passport and journal; this skill does not parse or copy
  their schema.
- Every file reference is `{ "root": "project", "path": "relative/path" }`.
  The CLI `--root` is an absolute directory. Absolute reference paths, `..`, empty
  segments, path escape, symlink components, non-regular files, and duplicate
  evidence/ownership paths are rejected.
- `source` names baseline, current source, and build revisions plus rooted
  requirements and architecture documents. `source.continuity` compares the
  revision expected at handoff with the observed revision. A mismatch needs a
  completed reconciliation with impact, affected checks, and rerun/pending status.

## Preparation and stage gates

`stage` is one of `prepare`, `plan`, `approved`, `preflight`, `implement`, `paused`,
or `delivered`. For `paused`, `pause.from_stage` determines which earlier gates
remain applicable.

- `prepare` has non-empty scope, exclusions, measurable AC, donor decisions, and
  a forecast. Each donor uses a rooted local path (or explicit `kind: none`),
  revision/digest provenance, useful fragment, compatibility (`compatible`,
  `partial`, `incompatible`, or `not_applicable`), decision (`use`, `adapt`,
  `reject`), and reason. Incompatible donors are rejected. Forecast repeats the
  scope revision and is either source-backed, marked `uncalibrated_expert`, or
  explicitly `insufficient_data`; unavailable numbers are `null`.
- A plan ROUTE is always required. An implementation ROUTE is required from
  preflight onward. Each stores the routed scope revision, substantive rationale,
  risk tier, script input description, and exit code; empty input is not success.
- `approval.requirement` is `required` or `not_required` with a reason. At and
  beyond `approved`, required approval evidence must match the plan revision and
  explicitly cover `plan`, `team`, `roles`, `models`, and `skills`. Earlier stages
  may wait without it. Pausing does not require newer evidence.
- `preflight` must be absent or `null` before the preflight stage and present from
  that stage onward. It is read-only and records source/build/environment, test
  command as inert data, inputs, environment availability, expected effects,
  evidence root, `external_actions_executed: false`, and `e2e_claim: null`.

## Continuity and evidence

Attempts are append-only in meaning and have unique IDs. The current attempt must
exist; prior `interrupted` attempts remain present. A paused record has blockers,
next allowed step, preserved approval IDs, and one continuation mode:

- `checkpoint`: a rooted, digested native checkpoint is required.
- `handoff`: checkpoint status is `not_applicable` with the reason that the caller
  provides no native checkpoint.

The pause block repeats and must match the record's RUN_ID, WORK_UNIT_ID, and
current source revision; this makes a detached handoff self-identifying without
creating a new run.

Delivery maps every required AC to `pass`, an exit code, the expected source
revision, and a receipt. Unknown results use `unknown` with `exit_code: null`; they
cannot pass delivery. A receipt index points to a substantive terminal Markdown
file and its launch JSON, with SHA-256 digests. The launch must say the trace was
absent before launch, bind run/work/attempt/source/build, and precede the receipt.
The receipt repeats those fields plus `Launch-SHA256`, `Finished-At`, `Verdict`,
and a final `Status: completed`. A passing verdict and completion marker are both
required.

For delivered records the caller must also provide independent expectations via
the CLI flags, including `--expect-launch WORK_ID=SHA256` for every receipt. Matching
self-reported strings alone do not prove identity. `delivery` includes an absolute
URI, included/excluded scope, source/build, receipt IDs, and a `pending` list; the
list must be empty for successful delivery.

## Limits

The validator performs structural and local filesystem checks only. It never runs
recorded commands, checks PID liveness, calls a network, determines product
acceptance, proves a model actually ran, interprets telemetry events, or repairs
source drift. Exit `0` is not an E2E or product verdict. Missing inputs yield exit
`2`; malformed or contradictory inputs yield exit `1`. Semantic review remains a
separate gate.
