Verdict: **ACCEPT — F04a backend scope.** No confirmed product-code findings or corrective changes requested.

Independent review covered private composites, publication eligibility, consent/revocation, entitlement races, events, migration006, HTTP boundaries, and the tests exercising those controls. F04b browser/UI and F05 GPU acceptance remain outside this verdict.

| Receipt field | Value |
|---|---|
| Run-ID | `n8-20261002-1740` |
| Work-Unit-ID | `n8-f04a-review` |
| Attempt-ID | `n8-f04a-review-1` |
| Source revision | `2bec973b8b8a877da4ef3ccfead8ff10e2c5c120` |
| Reviewed delta | `c94174a2..2bec973b8b8a877da4ef3ccfead8ff10e2c5c120` |
| Build/snapshot SHA256 | `784cfc4dc94f222e7bda88474e32f69b7c8c941014030b60870f2cd85883d775` |
| Launch-SHA256 | `de9cb49db83f2fbc432ddf42fe9eca9e1ff0fc1cbcd77f6d2a52558cfc0e6590` |
| Started-At | `2026-10-03T00:31:21Z` |
| Finished-At | `2026-10-03T00:39:12.676816Z` |
| Elapsed | **471.68 seconds**, within 720-second bound |
| Profile | `compact-quality-first-v2`; substantive **XL**; mechanical review route **L**, exit1 |
| Reviewer model | Requested and host-confirmed `gpt-6-astra`, effort `high`; Codex runtime banner |
| Usage / cost / active-time breakdown | `null` — authoritative measurements unavailable |

The reviewed implementation satisfies the bounded software contract:

- Private export checks ownership, canonical evidence and actual input/output hashes. Composites permanently embed AI labeling; fixture exports retain DEMO labeling. Server entitlement and hold determine the RoomKind badge.
- Public serving requires accepted ControlNet evidence and matching privileged review. Consent and metadata boundaries are explicit; HTML escapes otherwise-valid accepted content. Public responses exclude private identifiers, raw paths and EXIF.
- Final authorization follows account→job→share locking after image preparation, including cached responses. Revocation, deletion, rejection and hold deny subsequent public delivery. The paid-cache/hold race rejects stale unbadged output.
- Attempts, native resolved completions and delivered downloads remain distinct and deduplicated. Abort/error/unavailable produce no completion; downloads never count as native completion.
- Public rate, body, query and pagination limits are enforced. Tests exercise actual renderer and service guards; SQL doubles are supplemented by real PostgreSQL tests.

Verification evidence:

- **75/75 snapshot file hashes**, canonical digest, specification digest and **26/26 author log hashes** verified. The coordinator’s corresponding 75 source files also matched. The snapshot’s precommit source label was reconciled through these byte checks.
- Independent syntax check: **exit0**.
- Author focused tests: **12 passed**, plus successful owner/hold mutation checks and permitted regressions.
- Coordinator retry: **27/27 checks exit0**, completed `2026-10-03T00:38:43.919502Z`. This includes F04a PostgreSQL tests (**6 passed**), migration replay, real hold serialization, affected foundation/jobs/quality/payments/attribution PostgreSQL suites, payment HTTP, all listed mutations, service startup, HTTP200, maintenance and cleanup.
- Runtime used Node `v22.20.0`. Web image ID: `sha256:e47a3368b97c527794219bae4ee3cae32f7344318547d6877130b6612b2cbd2a`.

Evidence bindings:

| Evidence | SHA256 |
|---|---|
| `/tmp/n8-f04a-runtime-results.json` | `fbc247ae63981524fa68cdd96ffce8169fb7fc8157e558273e0bdbc757075fda` |
| Retry `sharing-pg.log` | `a8df8d0b0682b6f8d68d02c9961ee9ff08ebda8922ee709a754a7394705c584f` |
| Retry `payments-http.log` | `406f0d040d116516f3d4b6b285eedf6f054e08d847c8d3c6389c8c2a8bfe9688` |
| All 27 retry logs, canonical digest | `eb15a3d1bd22144f85794d2ee663a608970d401b38dfa81475e716084ddc23f7` |

Retry logs reside in `/tmp/n8-f04a-runtime-retry/`. Aggregate hashing uses UTF-8 JSON `{files:[{path,sha256}]}`, entries sorted by absolute path, sorted object keys and compact separators.

Failures remain disclosed: the author’s payment HTTP attempt failed with sandbox `EPERM`; my local composite rerun failed to resolve `sharp`; the first coordinator runtime attempt failed because Docker address pools were exhausted. These were not counted as passes. The completed coordinator retry supplies the successful runtime evidence. Diff whitespace inspection also flagged six intentional Markdown hard-break lines in the author receipt; no code finding resulted.

Synthetic accepted fixtures establish software guards only. They do not establish real geometry quality. F04b browser/native-share behavior—including the documented attribution GET Origin correction—and F05 real GPU corpus/latency remain pending.

No edits, delegation, installation, Docker execution, network/provider calls, deployment or spend were performed by this reviewer. The project-work-companion skill was applied for evidence handoff; reviewer E2E preflight is `not_applicable` because no E2E was executed here.

TRACE remains absent for coordinator atomic installation of this receipt:

`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f04a-review/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f04a-review-receipt.md`

Status: completed