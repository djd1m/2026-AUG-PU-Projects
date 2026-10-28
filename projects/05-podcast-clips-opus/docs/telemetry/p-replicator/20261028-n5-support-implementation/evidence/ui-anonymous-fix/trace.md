# Anonymous support transition correction
RUN_ID: 20261028-n5-support-implementation
WORK_UNIT_ID: support-ui
SOURCE_REVISION: 47929fc1e3972ff77e5dc2fb252ed418632b5eb8
BASE_REVISION: c0fda1fa41fad39a0ca89ce39af5a5317936bb32
INTEGRATED_REVIEW_REVISION: 68a2943a
SPEC_SHA256: ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
CANON_SHA256: 560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
LAUNCH_SHA256: c59953141cfeab8654e5e071bb674aedb3763d1c9077f322c9ca46881a499fde
PROFILE: model-routing-econom
Requested model/effort: gpt-6.1-sol/medium. Actual host-confirmed model, tokens, cost: null/unavailable.
Observed start: 2026-10-28T02:46:01Z; finish: 2026-10-28T02:49:40.618814+00:00; wall elapsed: 219.619s.

Root-assigned bounded correction only. Commit changes four owned files; clean worktree.
Defect confirmed: old open(false) directly showed an already identified widget.
New shared helper is used by actual SupportPanel anonymous event. It invokes official logout,
synchronously clears opt-in/local application state, awaits vendor cleanup success (including
async rejection), captures epoch after intentional clear, and cancels on a later authority event.
Failed cleanup shows no anonymous-success and never invokes show. Identified explicit-opt-in
fresh POST remains unchanged. No context projection or backend/API/config/manifests changed.

Meaningful regression: extracted old behavior (load/show without logout) failed2/8 tests,
including retained A identity at show and async logout failure incorrectly succeeding. Fixed
helper8/8PASS; tests also check intentional epoch clear still permits show, no JWT call,
local opt-in removal and cancellation while logout is pending. Related recovery/widget13/13PASS.
Focused TypeScript PASS with base flags:
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module esnext --moduleResolution bundler --jsx react-jsx --esModuleInterop --skipLibCheck --strict --noUncheckedIndexedAccess --declaration --allowJs tests/support-ui.test.ts tests/support-widget-ui.test.ts tests/support-responsive.test.ts
Project lint exit0. node --check scripts/check-support.mjs exit0. git diff --check exit0.
No full build or integrated browser run here; root owns rebuild and affected acceptance.

Browser runner changes (coverage prepared, not executed here): synthetic A identified→anonymous
asserts official logout before show, zero extra JWT requests, unchecked opt-in, then re-identifies A.
A/B widget IDs compare directly to distinct required fixture accountA.id/accountB.id, without
inferring identity from optional support-context accountId. Existing staff exact POST search and
read-only checks retained; staff list/card add existing domRules+axeRule and screenshot loops at
360/1440 in both light/dark themes. No new harness/dependency/runtime source beyond assigned UI.
SSD remained2.7GiB free, no images/downloads/newcontainers/real mail/deploy.

Receipt: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.receipt.json
Receipt SHA256: ebe38c4d1edaed1163587712a1e48d468ef0ca3551bcae1689f6e6a4591155ec
Source: apps/web/src/lib/support-client.ts SHA256 32488952338c72c92b579bf01cac976f10d7e59def366483b8fdb03baf3f3126
Source: apps/web/src/app/support/SupportPanel.tsx SHA256 535d5f5f0b889167ef8f246e06be7868872a60d67b9f9695a156104c774b0e93
Source: tests/support-widget-ui.test.ts SHA256 ec3c97799a9a5e8c1b4c5e42ef3d247c79bbeb73d4c0b2c16a56f54415184ccc
Source: scripts/check-support.mjs SHA256 8fc3c57599563bbd0583d8936730ef5dcf08f5d5e255cad242ab89d0fb8b27a7
Evidence: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.red.log SHA256 7cfb7d87c118323ee389bc4dd6fb4a5e51ccb5b9b5c2c9e9b9a169d9058f2afc
Evidence: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.green.log SHA256 e6780b9512554484aae2a984d3915eb97b1b839f95ef7c8b3c76974d8479f1de
Evidence: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.types.log SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Evidence: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.lint.log SHA256 f8eca02ed8232ddb53b69d0c6a65f11eccaf2fc4932451829f4edf3b43ad830b
Evidence: /tmp/n5-support-ui-checks-20261028/anonymous-fix-01.related.log SHA256 46f7c8dc8abe297389d4cc8fb6cd4aa98a9bfeff94fca2cec86babe18780247f

Gaps: host actual-model/usage/cost unavailable; red extraction stage source snapshot was not captured (test log retained); final source hashes are exact. No integrated PASS claim. Root continues by merging this commit, rebuilding and rerunning affected UI/browser/responsive checks.
Status: completed
