# F02b runtime and remaining gates

Node `scripts/worker.js` is the only queue/SQL controller. It calls the existing
`createJobs` claim/10s heartbeat/fenced completion/failure methods; Python has no
database or payment access. One persistent single-flight Python engine caches
models across successful jobs. Fixed attempt180s/job360s are still enforced in
PostgreSQL and by a cancellable subprocess. Process restart loses cached/warm
state. CUDA absence, model absence, safety flags, protocol overflow and hashes
fail explicitly; failed/stale attempts discard all three UUID artifacts.

The controller independently checks bounded input/output/depth/config bytes,
PNG output/depth and exact input dimensions before completion. `outputs`,
`depths`, `configs` use the same generated UUID in separate private directories.
No caller URL/path/model repository is accepted. Periodic existing maintenance
now cleans all three folders; referenced live UUIDs survive the orphan sweep.
Private `GET /api/jobs/:id/result` requires owner, successful nondeleted input/job,
nonrejected quality and exact output bytes; no-store/noindex are inherited from
the web server. Reads recheck state after hashing. F04 has no public endpoint yet;
`qualityEligible(pool, jobId, storageDir)` supplies the acceptance/byte guard and
F04 must still serialize/recheck owner/consent/hold at final delivery.

## Running, without provisioning side effects

Use Node22 with existing npm dependencies and an independently provisioned Python
environment. Web config keeps `WORKER_MODE=disabled`; the worker process gets its
own explicit `WORKER_MODE=controlnet`, `WORKER_SEED`, immutable
`WORKER_SOURCE_REVISION`, `MODEL_ROOT`, `STORAGE_DIR`, and normal server DB/budget
configuration. `WORKER_PYTHON` selects that trusted server environment. Run
`node scripts/worker.js` (or `--once`). No weights or GPU dependencies were
installed/downloaded by this implementation. Optional Docker packaging is not
required for this source unit; production GPU/container validation stays pending.
Fixture mode needs Pillow, refuses production and draws a visible fixture label;
fixture provenance never passes quality acceptance. The stdlib subprocess test
double is separately labelled, not a product inference adapter.

## Offline manifest

Operator-provision `/absolute/MODEL_ROOT/manifest.json`, version1, `models` containing
exactly `sd`, `controlnet`, `depth`; each directory has that role's name. Each role
has `repository`, immutable40hex `revision`, declared `license`, `license_file`
and `files` mapping every relative regular filename to its actual SHA256. No
extra file is allowed. License material is hashed like configs/weights. Exact
repository/revision/license pins are the existing candidate table in
`docs/model-provenance-candidates.md` and `worker/manifest.py`. Paths/symlinks,
pickle/bin/ckpt/code and unhashed content are denied. All model loads use local
files only and safetensors. Intel's pinned DPT candidate has no upstream
safetensors: **blocked until safe weights are separately provisioned with
documented provenance/compatibility**. This implementation deliberately has no
unsafe loading fallback. Original candidate checkout alone is insufficient.

Dependency candidates are pinned in `worker/requirements.txt` exactly as recorded
in the approved plan. They have not been installed, audited or GPU-tested here.
API references consulted: [Diffusers ControlNet](https://huggingface.co/docs/diffusers/api/pipelines/controlnet),
[ControlNet guide](https://huggingface.co/docs/diffusers/using-diffusers/controlnet),
[DPT](https://huggingface.co/docs/transformers/model_doc/dpt). Spatial conditioning
is an API capability, not a measurement of preserved geometry or latency.

## Trusted review/report contract

`node scripts/quality.js JOB_UUID accepted 'review reason'` uses only server
`QUALITY_OPERATOR_ID`, `QUALITY_CORPUS_REPORT`, `QUALITY_CORPUS_SHA256`. There is
no actor argument and no HTTP quality setter. Rejection uses the same CLI with
`rejected`; it audits accepted→rejected, revokes reads/eligibility and calls the
existing unique reserve release. Rejected never reaccepts. Evidence/reviews are
append-only. All hashing/file checks happen before account→job locks, followed
by state/source/evidence/hold rechecks under locks.

The bounded report is JSON with `kind=measured-gpu-corpus-v1`, `synthetic=false`,
independent `reviewer`, `measured_at`, and `pairs` (36–1000). Every pair contains
`room_id`, style enum, `input_sha`, `output_sha`, canonical `evidence_sha`,
`config_sha`, model revisions, worker source revision, hardware, `mode=controlnet`,
input `license_sha`, `annotations_sha`, `added_openings=0`, `removed_openings=0`,
and nonempty `anchor_displacements` normalized by image diagonal, all≤0.02.
At least12 distinct input hashes/rooms each cover≥3 distinct styles; repeated
room/style is refused. All pairs bind the same model/source/hardware candidate;
the reviewed output binds exact input/output/config/evidence and style. Per-pair
config hashes may differ because styles/seeds differ. Hash verification binds a
trusted independent report's bytes, not the truth of its declarations: the
operator must retain licensed paired files/annotations and independently measure
the actual corpus. Report signing/provider attestation is not implemented.

`tests/quality-fixtures.js` invents a report and controlnet-labelled images for
software branch coverage ONLY. Its `synthetic=false` is intentionally an
otherwise-valid parser fixture, **never a real GPU report**. No checked-in test
data can be used as acceptance evidence. GEOM-02 (12×3 real corpus) and PERF-03
(≥30 actual warm GPU jobs/p95≤25s) remain unknown/pending. Source/build review,
real PostgreSQL integration/regression and dependency security/compatibility
remain independent coordinator gates; successful stdlib/unit tests do not close
them.

## Coordinator checks (commands as data)

After N7 releases the shared heavy mutex, run dedicated PostgreSQL16 with no
published DB port; use the existing internal network/secret availability without
printing credentials. Set `N8_TEST_DB_OWNERSHIP=n8-f02b` and a dedicated internal
`TEST_DATABASE_URL`, then `node tests/quality.integration.test.js`. The suite
creates/drops its own random schema and refuses nonlocal hosts/missing marker.
Because app/jobs/media/migrations/maintenance were integrated, run full existing
F01/F02a PostgreSQL regression too: ownership marker `n8-f01` for
`tests/integration.test.js` (verify that suite's required marker first), and
`n8-f02a` for `tests/jobs.integration.test.js`. Run owner/budget mutations with
their corresponding ownership markers. Acquire `/tmp/codex-heavy-build.lock`
under coordinator control, CPU≤2, and perform the web image build after release.
No Docker commands were attempted here, and no GPU image should be built as part
of this coding attempt.
