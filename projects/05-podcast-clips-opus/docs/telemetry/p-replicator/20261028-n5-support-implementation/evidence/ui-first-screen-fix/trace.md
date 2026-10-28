# Partial-render first-screen UI correction
RUN_ID: 20261028-n5-support-implementation
WORK_UNIT_ID: support-ui
SOURCE_REVISION: 9c24a448c5accdd3d44b45dde619962b35aa606e
BASE_REVISION: 47929fc1e3972ff77e5dc2fb252ed418632b5eb8
DIAGNOSTIC_INTEGRATED_REVISION: 420affeb
SPEC_SHA256: ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
CANON_SHA256: 560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
LAUNCH_SHA256: c59953141cfeab8654e5e071bb674aedb3763d1c9077f322c9ca46881a499fde
PROFILE: model-routing-econom
Requested model/effort: gpt-6.1-sol/medium. Actual host-confirmed model, tokens/cost: unknown/null.
Observed start: 2026-10-28T02:53:53Z; finish: 2026-10-28T02:57:35.094100+00:00; elapsed: 222.094s.

Read the actual responsive report and viewed webkit-light-first-screen-360x740-341.png.
Baseline report has342page/screenshotcases,0executionerrors,12R9errors only: firstcard actions
below first screen across bothengines/themes at390x844,375x667,360x740. At375x667 actionbottom
802.28 exceeded667. Screenshot shows full partial-render notice plus preview above actions.

Root assigned ClipCard.tsx and tests/clip-card.test.ts before edits. Only approved4UI paths changed.
Done-but-partial VideoDetail now passes optional actionsFirst. Such cards render their single
existing accessible action row before their full preview; the notice remains visibly above the
card, default/completecard frame-first order remains, buttons/handlers/guestconsent unchanged.
Added direct-child row CSS using existing theme/spacingtokens and44px+controls. No preview
shrinking, alert hiding, R9 change, fixture/data/backend/render change or new dependency.

Meaningful regression uses real rendered VideoDetail partial state: baseline fails because
preview appears before actions (1failed16passed exit1); fixed card suite17/17 plus theme30/30
PASS exit0. It also verifies warningbeforeactions, enabledsingle download, default complete
preview-first order and no false partial-warning on complete state.
Focused TypeScript exit0:
node node_modules/typescript/bin/tsc --noEmit -p /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.tsconfig.json
Private checkconfig extends actual project tsconfig.base.json preserving strict/noUncheckedIndexedAccess;
only uses noEmit, ESNext/Bundler/react-jsx/allowJs plus explicit local workspace source aliases,
and files ClipCard,VideoDetail,clip-card.test. No product config changed.
Lint exit0; git diff --check clean. No repeated full build/browser/DB checks in UI tree.
Root must merge, rebuild and rerun actual R9/browser acceptance; no new browserPASS claim.

Receipt: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.receipt.json
Receipt SHA256: 398967500be0509c10a9c2a2535b455e0fa4fc4f5260761851cdfb2be66739e9
Source: apps/web/src/app/clips/ClipCard.tsx SHA256 0c268185f53c213e457d63f70d3ab855656b595c5fce847516e3dc79d7c12293
Source: apps/web/src/app/videos/[videoId]/VideoDetail.tsx SHA256 cc55c854dddc211be6a233f68b71e88be622f93ea827f797b609589164b529c1
Source: apps/web/src/app/globals.css SHA256 0b716f974ff9a378f7a13dbfc0d52db628be6ab63a2840d29b80bee3d3c74abb
Source: tests/clip-card.test.ts SHA256 be54b94c1a25844a3a225086defd0f86d053d3fdda1f6ae915b3d3294f64fece
Evidence: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.red.log SHA256 6ade44fecab70ef1d111d9794c9a226cf78b64fb43c72d2fd13630db76e4aaf5
Evidence: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.green.log SHA256 8648b3f6c1a205a70d9fc6923524a267805cf672ebca745a3334a4998fa1346a
Evidence: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.types.log SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Evidence: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.tsconfig.json SHA256 43730d69057d43997296b44e65e0a3d9aca7428a2e7e4edcdc4fc5175ba8c78b
Evidence: /tmp/n5-support-ui-checks-20261028/first-screen-fix-01.lint.log SHA256 f8eca02ed8232ddb53b69d0c6a65f11eccaf2fc4932451829f4edf3b43ad830b
Evidence: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/.responsive-artifacts/support-responsive-01/report.json SHA256 c2b45c43a9f54632b027f16dce4ffc1b49625972ce355a589be32cd39e362bf7
Evidence: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/.responsive-artifacts/support-responsive-01/webkit-light-first-screen-360x740-341.png SHA256 9e5dfef7f8ef2fc89df7763507ede5b74803c41536a631eae7c851bbca373a85

Measurement gaps: host actualmodel/usage/cost unavailable; wall elapsed from first observed UTC timestamp. Red intermediate test stage was uncommitted, source snapshot not captured; final commit/source hashes exact. Worktree clean. Root is continuation owner for actual integrated first-screen check.
Status: completed
