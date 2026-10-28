Run-ID: 20261027-n5-support-oss
Work-Unit-ID: helpdesk-researcher
Attempt-ID: helpdesk-researcher-1
Role: read-only OSS helpdesk researcher
Launch-Path: /tmp/n5-helpdesk-oss-research-20261027-launch.json
Launch-SHA256: df8b3fa3ed543f90f283cae4455b7faced8634bb518d3f7110200de01aa6fab2
Source-Root: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus
Source-Revision: f60215a5199584c5025b65b14b00bfabeacdd003
Observed-Terminal-Source-Revision: f468e8dda0f714668de4207cd7bd8af417db1e56
Build-Revision: null
Report-Path: /tmp/n5-helpdesk-oss-research-20261027-report.md
Report-SHA256: 05ec71d6a9e1a4618b69e0696f1d4c6b19aea0facf06b0619c1825832b0dd3fc
Started-At: 2026-10-27T23:07:48.254742+00:00
Finished-At: 2026-10-27T23:18:01.311844+00:00
Duration-Seconds: 613.057
Timebox-Minutes: 20
Requested-Model: gpt-6.1-sol
Requested-Reasoning: high
Actual-Model: null
Actual-Model-Reason: Runtime backend model metadata is not exposed; requested model is not proof of execution model.
Input-Tokens: null
Output-Tokens: null
Cost: null
Usage-Gaps: No provider/model/token/cost measurements available. No inferred zeroes.
Profile: read-only / docs

Prelaunch freshness: both report and trace were absent, checked by this agent before research; initial HEAD matched launch baseline. This agent created both outputs. Report and trace are unique regular files, not symlinks.

Authority: explicit delegated task; only these two /tmp outputs written. No repository/Git modifications, installations, image downloads, containers, deployment, paid calls, private environment, customer data, new accounts, or vendor/support communications. Public primary-source GETs and git ls-remote only. Narrow require_escalated read/public-GET commands used because the caller documented the default bubblewrap failure; no global environment fix attempted.

Instructions read: root AGENTS/CLAUDE, N5 CLAUDE, complexity-router, project-work-companion local adapter, companion skill and handoff references. Delegated launch is the existing run record. No replacement run/telemetry engine created.

ROUTE: bounded research/documentation only, no product behavior or source changes. Mechanical router not_applicable: no implementation diff in this work unit; treating empty diff as T/pass would be false. Eventual feature has new trust boundaries and staff rights; normal project lifecycle remains mandatory.
E2E preflight: not_applicable; installation/runtime/build/E2E are outside this authorized research scope.

Source continuity reconciliation: coordinator confirmed the intentional docs-only commit f468e8dda0f714668de4207cd7bd8af417db1e56 after launch. git diff baseline..observed -- N5 apps/packages returned exit 0 (empty); git diff observed -- same scope returned exit 0 (clean). Individually compared baseline/current researched instruction and source blobs; all unchanged. BACKLOG added current P0 section and STT/economics references, confirming support gaps without changing researched code. Initial current backlog content was observed before the coordinator committed it; report explicitly binds current backlog to observed terminal revision. External license/API sources are separately pinned below/in report. No source restart required.

Unchanged source SHA256 proof:
- apps/web/src/lib/upload-parts.ts: 4d7d33d6bde4db41ae7ac87740b574225acfd5a359df1791083e32b7302605b9
- packages/db/migrations/001_init.sql: 96e64cf44ca9e1842b524f4047344406e647b150e3eb4f628d83b8bdae79a107
- N5 CLAUDE.md: 9098bff99d09fff92bff8624e668d25aedbdfb56a010e4097b08904145143e7e

Checks and acceptance:
- PASS / exit 0: launch SHA, initial source revision, fresh output absence.
- PASS / exit 0: final report regular/non-symlink, <=250 lines, all five bounded candidates and required topic coverage; 89 lines, 38950 bytes, 51 direct primary URLs.
- PASS / exit 0: pinned official LICENSE texts read for all five; current release/archival activity checked. Libredesk stable 5668a2a2c503b9304404d8f3620131b2990cbb99; Chatwoot 90ed589c695f6aeaeea0e78f6be7d4ec0fb3e1b3; FreeScout 56c4d014cfbd5e0b038cc887d71e0c75fd6c3f1b; Zammad 2cc8988494cdb822ef08e931d9082185bd919a09; Peppermint ba6e2179f9409db76abeb9a3007a262160e24628.
- PASS / reviewed: free/commercial boundaries separated; FreeScout paid AGPL modules not mislabelled proprietary; Chatwoot enterprise excluded from MIT claim; AGPL network/aggregation obligations qualified with FSF primary source.
- PASS / reviewed: explicit 2-option shortlist plus later Zammad reserve; official resource requirements distinguished from unmeasured capacity hypotheses; no second VM requirement.
- PASS / reviewed: mail-free widget vs email-only create API distinction; staff OIDC is not customer widget JWT; N5 is not OIDC issuer.
- PASS / source read: stable Libredesk JWT requires external_user_id/email/first_name/exp. cmd/chat.go prefers user_id when emitted; signer must not accept it from browser. internal/user/contact.go first-adopts email-only contact without external ID: unverified-email takeover risk recorded. Verified-email gate recommended, no fork default. JWT expiry not equated to widget-session revocation.
- PASS / reviewed: N5 user/video/job/credits/payment context, ownership, private notes, HMAC/idempotency, no arbitrary SQL/monetary actions, no raw audio/prompts/keys copied. Deletion/PII retention and widget-session lifecycle included.
- PASS / exit 0: source drift reconciliation and unchanged source hashes above.
- NOT_APPLICABLE: install/build/E2E/live-capacity/SMTP/S3 compatibility; no live validation claimed.

Research limitations: GitHub public API rate limit hit after initial license/release fetch; recovered with official raw pinned files, git ls-remote and official release pages. A guessed Prisma schema path was absent (rg exit 2); corrected by locating/read of actual SQL migrations, with no false schema claim. Some browser docs URLs returned cache misses or GNU fetch timeouts; used working official canonical docs URLs and public GNU FAQ GET. No reliance on third-party factual summaries. Libredesk RAM hard minimum absent in read official docs. Stable API/identity tests, deletion semantics, RU hosting/mail-provider selection, operator assignment and deployment remain explicitly out_of_scope, not completed product work.

Coordination: findings exchanged with admin researcher; proposed pair React-admin + Libredesk, linking through scoped read-only N5 context. Root owns independent review, project documentation integration and further authorized work.
Verdict: pass (bounded research AC only; no install/runtime acceptance)
Status: completed
