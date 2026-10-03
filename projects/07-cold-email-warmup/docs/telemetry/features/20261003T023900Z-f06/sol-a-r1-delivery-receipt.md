# F06a R1 recovery delivery receipt

New recovery receipt; original bound receipt was absent and original delivery failed. This packages saved evidence only; no acceptance claim. Fresh Astra R1 closure and B browser verification remain pending.

Identity: run `20261003T023900Z-f06`; work unit `n7-f06a-r1-delivery-sol`; attempt `delivery-a-r1`; profile `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol` / `high`. Actual model, usage and cost: null, pending host evidence; no model switch asserted.

Binding source: `3423e72201ac3ac7a8f943c3d4d42b9e99acee47`; product commits `fad3385b`, `3423e722`. Git history records two removed/replaced page lines, actual-script tests and checking scripts; saved provisional reports seven VM tests.
Spec SHA256: `72b44888ddab0405d955084d572130649fbdddc70b33d53a364db7dd80f05de5`.
Launch SHA256: `9c779a63ed849821e0808fe38457c5445b13575b1256890149fba421ccc9aec3` (owner binding; launch file excluded).

Independently read saved R1 evidence: test.exit=0, test.log 38/38, failures=0, duration=7364.116069 ms; pg.exit=0, pg.log 115/115, failures=0, duration=74798.461931 ms. Typecheck/lint/build exit=0; their durations and exact prior invocation commands are unavailable within permitted inspection. Mutation receipt: passive broadcast RED=1, restored GREEN=0, recorded `2026-10-03T03:22:59.541262+00:00`.

Image receipt, recorded `2026-10-03T03:27:18.744177+00:00`: image `sha256:a65867e3f1af46b3f4d8a4894a002397ce4a84f890b22b6d0d10d44d1eaa2f7f`; source SHA256 `932e7e0b5f8d3189ab8256f1858bd0b74389c91504775f4e2a8be704da67d1de`; Dockerfile input SHA256 `f8d6728ac4337c589cf55983654e2cf51ac437ef4711e20086f12d775cc997f5`. Recorded source/build exact match and container image match=true; Dockerfile absent inside image; DB has no ports; loopback18709=true; canary logs absent=true; shell `/app`, asset `/assets/app.js`. Frozen map labels baseline `b33563d76b81d12aa1f5639b89c8231d7b2eaff7`; image labels binding revision, with matching source hash. No live revalidation.

Secrets receipt records five runtime secrets, suppressed values, project-files/own-logs pass and API-canary assertion by full F01/F02/F06 integration tests. No secrets inspected.

Old process: PID1173623, start `2026-10-03T03:20:00.121211+00:00`, finish `2026-10-03T03:30:00.123974+00:00`, exit124, actual600.002744617057 seconds. Existing run.json retains stale pending fields byte-for-byte; prior partial records remain unchanged.

Recovery started `2026-10-03T03:31:48.270287+00:00`; receipt finalized `2026-10-03T03:33:45.699772+00:00`; elapsed to receipt 117.429485 seconds. Limits: receipt120s, commit150s, stop170s, hard180s. Executed saved-evidence Python reads, `git status --short --untracked-files=all`, `git status --short --ignored --untracked-files=all`, `git log -4`, `git log -2 --stat`: exit0. Delivery uses `git add -f -- <owned-R1-evidence>` and local `git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit`; final commit result/duration reported in chat. Caller launch/manifest excluded; own node_modules symlink removed only if symlink. No product edits, new tests/build/runtime, agents/network/browser/push.

Status: completed
