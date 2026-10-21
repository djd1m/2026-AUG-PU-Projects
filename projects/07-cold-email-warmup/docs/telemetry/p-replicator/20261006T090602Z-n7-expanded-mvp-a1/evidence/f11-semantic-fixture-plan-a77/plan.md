# A77 semantic fixture correction plan

Frozen source e7f03164549f011b0adef80f1e2d6df3d734487a. Planning only; no runtime/DB authority.

## Established cause

The current cohort helper seeds genuine local TEST team entitlement for each of three actors (tests/f10-runtime-process-fixture.ts:111), then round-robins 30 active campaigns across them (:112–121), ten per tenant. The target is participants[0] and actor actors[0], so the fresh semantic campaign at protocol test :525–526 is its eleventh. Production checkCapacity counts active campaigns and rejects count >= team limit 10 (billing/plans.ts:3,9–13; campaigns/store.ts:37). A74 ran one exact callback and returned plan_limit_reached after all eight successful reset checkpoints. Repeating seedTestEntitlement does not raise the team limit. No missing entitlement or free-tier fourth-campaign cause is claimed.

This ordinary callback has no source assertion requiring three tenants. Fullfleet explicitly requires actors.length===3 at protocol :174; its no-argument seed and all default callers must remain unchanged. The current ordinary callback passes no phaseDelayMs to bodyFixture; that helper delays only when phaseDelayMs is truthy. Its present source therefore does not prove two >=2800 ms native phases.

## Authorized implementation scope for a separately dispatched author

ONLY tests/f10-runtime-process-fixture.ts and tests/f10-runtime-protocol.test.ts. No production, billing-fixture, guard, runtime observer, permissions, quotas, transport slots, config, SQL interception or shared toolkit changes.

Add one narrow optional semantic-headroom flag to the existing seedBodyPressureCohort helper, default false. When true only, seed four actors using the unchanged existing seedTestEntitlement helper, then distribute the unchanged 100 connected mailboxes and 30 active participant campaigns by that actor count. Default false retains the exact original three-actor distribution and every default caller. No new entitlement implementation or fake payment rows. No campaign deactivation, state rewriting, custom plan or capacity bypass.

Only the new_uid_semantic_stop callback passes that option. Its participant distribution is [8,8,7,7], target actors[0] has eight active campaigns, and its new campaign increases that count to nine under the unchanged TEST team limit ten. Actor identity must equal target.tenant. Keep all other callback arguments and semantics unchanged. Explicitly pass phaseDelayMs:2800 to bodyFixture only in this branch. Keep the original native callback 45000 ms and outer bound45.

Use the existing currentEntitlement read path and existing billing tables to record genuine valid TEST entitlement, tenant binding, plan team, activeCampaigns limit10 and hardMailQuota30. Record target active campaign count before app.campaigns.start; after legitimate consent and successful production start, assert before8 and after9 and distribution [8,8,7,7]. Place the headroom-specific count assertion after start so omission of the headroom option still reaches the real production plan_limit_reached check. Do not suppress or reinterpret that exception.

Use existing body.wire records (phase, connection, monotonicMs). In the semantic branch, require exactly two genuine phase_response records, pair each with its preceding matching phase_start on the same connection, and assert response.monotonicMs-start.monotonicMs >=2800 for each; record the raw wire unchanged. Retain BODY READY prerequisite, existing six-poll bound, genuine prior 12-second window and 450-second queue budget; assert those measured event fields rather than inventing counters. Record READY event before/after ordinary HEADER semantic processing and preserve its capture/window fields. Keep BODY permission removal unchanged.

Keep every original semantic assertion: real native UID2 headers, fresh submitted step0 root and queued next job, pre-state active/no reply effect, completion within existing four semantic polls, enrollment replied, each previously queued job cancelled, exactly one reply_effect and reply_observation, scan_complete true/cursor2 and native UID verb. Keep all existing cleanup, slot/socket/pool joins. Do not replace the semantic campaign with ad hoc enrollment SQL: the accepted narrow partition preserves legitimate production campaign/consent/tenant bindings without changing the campaign contents or lifecycle.

## Required verification and acceptance

Static: git diff --check; existing project typecheck/build checks applicable to these two TS test files; exact diff and callback projection demonstrate all other protocol callback bodies/selectors/timeouts/arguments unchanged in behavior, all no-argument helper paths preserve three tenants and original100/30/fullfleet cadence. Freeze/hash all source/dependencies/helpers before any authorized launch. No blanket successful-matrix rerun.

Runtime requires a NEW root exclusive lease, fresh absent schemas, disk>=2GiB, owner_role n7/database n7f11_a8, zero other sessions, FIRST/absence/migrations17 and unchanged guard. Refresh and preserve ALL current51 schemas/2009 complete table pairs from A74 final snapshot, saved WHOLE public rows and all prior claims, including failed semantic schema. Never reset, drop, expire or reopen old rows. Existing setup30/pre30/exactcallback45/post30 bounds and strict all child PID-tick/socket/pool joins; fixed eight setup observer events required. Allocate bounded actor window including joins/seal, do not stretch any inner timer.

Positive: run ONLY original exact singleton F11 ordinary HEADER material new_uid_semantic_stop, once, native45/timeout45000. Require native0, actual callback count1 and exact passing name, skipped0, all original semantic assertions, measured100/30, four tenant distribution, genuine TEST entitlement/count8→9, two measured >=2800 phases, actual READY/window/queue witnesses, full old table preservation and complete joins. No other ordinary/genuine/fullfleet reruns.

Negative omission: under separately root-bound source-copy freeze and fresh own schema, omit ONLY the new semantic-headroom call option; retain four-tenant-capable helper defaults,2800 witnesses, production limits and original semantic callback. Require exactly one attempted callback, native1 and actual error code plan_limit_reached from checkCapacity with target still ten active campaigns and team limit10. This failed counterproof is expected and must not be labeled PASS of the semantic callback. Preserve the accepted original source; no billing/consent/production mutation. A74 raw native1 remains historical evidence; do not fabricate a new omission run from it.

Delivery: clean source-bound objective, exact source diff/hashes, raw positive and negative outputs/counts/clock/journal, all protected full-table snapshots, new-schema claim classification, complete process joins, fresh receipt. Independent HIGH review sees this planner and clean objective only. Any unrelated RED or missing real timing/row witness blocks acceptance.

Remaining AC: runtime_external unlaunched; full integration, ALL30/100 cohort, fullfleet fault300 with original150SIGTERM then healthy300, legacy20 real5s/native19 and all other inherited XL checks remain unwaived. This plan grants no test/runtime execution. Root owns actual author/reviewer/runtime continuation.
