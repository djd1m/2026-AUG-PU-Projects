ACCEPT — no findings in the bounded logout-control correction.

RUN_ID: n8-20261002-1740  
WORK_UNIT_ID: n8-ui-logout-review  
ATTEMPT_ID: n8-ui-logout-review-1  
Source-Revision: 8030270f023d83c9cdd597c4578517a1b58b4b35  
Base-Revision: 6792c6a999ee32e8d1eb6f7037f8553159b806c2  
Launch-SHA256: a86dc797519eeb65548f964161494a2a442e61205d97e23c610913a849ccda54

`app.js:105` correctly derives disabled state from current `logoutPending`, preserving the newer logout while an earlier login finishes. Existing stale-account, 401, submit and logout-identity guards remain intact.

- Independently ran both requested suites using the specified Node binary and existing dependencies: **11/11 passed**, both exit 0.
- The added regression executes the actual app, holds login loading and logout, checks both controls and blocked submission, then verifies subsequent login succeeds.
- Verified all **70 source hashes and 20 evidence hashes**. Recorded old-logic mutation fails the precise new assertion; corrected execution passes. Mutation hash matches baseline source.
- Browser assertions are unchanged; `git diff --check` passes.

Profile: `compact-quality-first-v2`; retained XL session boundary. CLI banner confirms `gpt-6-astra/high`; provider-resolved model, usage and cost: `null` (unavailable). Measured launch-to-final-check time: **34 seconds**. No edits or delegation.

Telemetry destination, for parent installation: `projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-logout-review-receipt.md`. Applied [project-work-companion](.claude/skills/project-work-companion/SKILL.md) handoff guidance. Actual UI6/browser acceptance and GPU gates remain pending outside this review.

Status: completed