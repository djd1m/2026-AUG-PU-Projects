# Receipt: N3 A/B/C/D demo guides

- Completed at: `2026-09-09T07:33:21Z`
- Worktree/base: `/tmp/n3-demo-work`, `46f6364`
- Commits: `98cf932` (ten files), `17da778` (exact D retry label correction; apply both in order)
- Scope: ten owned documentation files: `docs/demos/index.{md,html}` and `variants/{a-merchant,b-customer,c-partner,d-agent}/docs/demo.{md,html}` under `projects/03-affiliate-rewardful/`
- Profile: `compact-quality-first-v2`, requested `gpt-5.6-sol` / medium
- Actual model/effort: `null` — this agent turn exposed no authoritative execution metadata confirming the requested route
- Usage/cost: `null` — no provider usage or billing metadata was available; savings are not established
- Duration: `null` — a start timestamp was not captured before the stage, so elapsed time was not reconstructed from memory
- Validation: all ten files exist and are non-empty; all five HTML documents start with an HTML5 doctype and parse with Python `html.parser`; no script/CDN dependency; four Markdown/HTML pairs have matching numbered-step counts; `git diff --check` passed
- Content basis: A/B/C current app source, seed, README and browser E2E; D app/source and PRD read-only from `/tmp/n3-d-ui-work`
- Limitations: no browser, server, Docker or E2E run was performed for this documentation task. D UI behavior is source-bound and was not claimed as a newly passed browser run. HTML/Markdown semantic parity was checked structurally and by review, not by a full Markdown renderer comparison.
