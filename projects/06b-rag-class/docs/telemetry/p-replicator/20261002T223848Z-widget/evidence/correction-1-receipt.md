Run-ID: 20261002T223848Z-widget
Work-Unit-ID: widget-r1-correction
Attempt-ID: correction-1
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12
Build-Revision: none
Launch-SHA256: d52c372c7d59177b8d0c5f85da97fc1b47d3574ab01e43482f3a85097d3aeafb
Finished-At: 2026-10-02T23:15:31.897571+00:00
Verdict: corrected source handoff

Fixed only F09-R1. Required branding now sits beside the toggle, outside the collapsible panel. Restoration checks badge visibility and its actual root ancestor in both panel states. Impressions start after required config and remain deduplicated per bot/page load. Panel controls, CSS and server-owned badge decisions are unchanged.

Changed files, relative to `projects/06b-rag-class`:

- `apps/widget/src/index.ts`
- `docs/features/widget/05_completion.md` — appended correction and six UI acceptance cases.
- `tests/artifacts/widget/correction-1-checks.json`
- `tests/artifacts/widget/correction-1-source-hashes.json`
- `tests/artifacts/widget/correction-1-typecheck.txt`
- `tests/artifacts/widget/correction-1-widget-build.txt`

Regenerated ignored `apps/web/public/w.js`.

Checks used Node v22.22.3 with `/tmp/n6b-f06-node22/bin` on PATH:

- `bash scripts/complexity-router.sh projects/06b-rag-class/apps/widget/src/index.ts`: exit 0, tier M.
- `npm run typecheck`: exit 0.
- `node --input-type=module -e 'const {default:config}=await import("./apps/web/next.config.mjs"); await config("phase-production-build");'`: exit 0.
- `git diff --check`: exit 0.
- Source/history verification: exit 0; all 19 snapshot entries verified, with only widget source changed. Earlier evidence, review and coordinator telemetry remain intact; original completion content is preserved.

Bundle: 11,932 bytes; 3,756 gzip bytes against a 30,720-byte limit.

Source-Snapshot-SHA256: 00f9a5a25dc0506e7df3f2bad58457c407474f0206e777f90b8912456c2f3954
Widget-Source-SHA256: c6a052d4becb9f8b4ab40d58c272b08437a8f1eceeed2ccd7c6083910f1601bd
Widget-Build-SHA256: 6aed4d4c21c49bc1c2ae733ce8ab2283a7961ed6a68c46752ae7468e40235090

No DOM pass is claimed: no installed local harness was available. Actual foreign-origin UI at 390/1440 under restrictive CSP/hostile CSS, full unit/PG regression, full production/image build and independent review remain pending. Unchanged server mutations were not rerun. An evidence-script gzip assertion failed initially; Node’s build-compatible measurement corrected it without source changes.

Profile: compact-quality-first-v2. Requested model: gpt-6.1-sol/high; actual model/effort, usage, cost and active time are unavailable. Measured elapsed: 374.385 seconds, within 420 seconds. Attempt telemetry: `tests/artifacts/widget/correction-1-checks.json`. No manual TRACE write.

Status: completed