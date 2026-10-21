# Semantic-reference paid retry closure
Finished: 2026-10-14T20:45:08.066139+00:00
Actual model: unknown (execution metadata unavailable).
Verdict: pass

The remaining reviewed paid-retry finding is closed. applyReference clears its retained attempt only for explicit definitive rejection domain codes VERSION_CONFLICT, CONSENT_CHANGED, CREDITS_REQUIRED, STALE_INPUT, AI_UNAVAILABLE and AI_CONFIG_INVALID. Rate-limit/429 and generic transport/5xx ambiguity retain the original frozen key/input/consent/version, preventing a fresh-key retry after potentially accepted submission. Earlier replay-before-image preparation remains covered by the preceding code review.

Scope: only this correction, no wider scan. No new blocker identified in the inspected correction. No tests/browser/provider calls executed by reviewer; coordinator regression and offline browser evidence remain separate. Actual paid semantic model output is unverified and no paid QA success is claimed. Usage/cost unavailable.

Source SHA256:
- `apps/web/src/components/DesignPanel.tsx`: 8d88feb2e40215471b40fd9f2f39e685806ce08530e4de1144819a1e85581948

FinalStatus: completed
Status: completed
