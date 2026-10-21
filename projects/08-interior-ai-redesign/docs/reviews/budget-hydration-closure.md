# Budget input hydration closure — budget-hydration-review-1

RUN_ID: `20261013T202009Z-expanded-cjm-9f69`  
WORK_UNIT_ID: `budget-hydration-review-1`  
Profile: `compact-quality-first-v2`; requested `gpt-6-astra/high`; actual model/effort/usage/cost unavailable (`null`).  
Final image: `docker:sha256:e5be7120110b92ed9b15b163638e65e339c796b16a0b567e166f53e11d8d8d21`  
Next build: `W9tBOwFbU3PwZwa1-u6rr`  
Reviewed source: `apps/web/src/components/BudgetPanel.tsx`, SHA256 `e79ebdac0a305444e6a893ad064759c3cc6ba0f15eee93eb35472fce5b06c932`  
Launch-SHA256: `8c42990e48ca4e562c3c93b815e6377a819e403edacd2813769a89f47bae5ed8`  
Finished-At: `2026-10-14T01:19:00.462383+00:00`  
Verdict: **PASS — delayed first budget load preserves active field edits and Add expense actions.**

## Scope and source reasoning

This is the requested single-finding closure, bounded to BudgetPanel's initial hydration guard and a small read-only browser probe. Root/project policies already read in the prior review remain applied; the canonical bilingual recall returned the bounded-review and unknown-budget lessons. Mechanical docs-only route: T/exit0. No product-source edits, container actions, paid calls or broad UI/journey reruns were performed by this reviewer.

The coordinator's change uses a synchronous `inputChanged` ref. `onChangeCapture` sets it before descendant field handlers; `onClickCapture` sets it for `button[type=button]` Add/Remove actions, including keyboard-generated clicks that do not emit a field change. The async first load still stores history but applies saved input values only when `!inputChanged.current`. `hydrated` remains one-shot. Thus ordinary untouched restoration retains its existing path, and subsequent refreshes do not hydrate inputs anew. Source inspection found no bypass in the scoped form controls. Remove uses the same explicit type-button capture path; an isolated Remove-only runtime case was not claimed.

## Paired and independent evidence

| Check | Observed result |
|---|---|
| Parent RED, `budget-hydration-red-1.json`, actual image7 | Delayed budget GET overwrote a user's `estimate` status and `12345` limit with saved `confirmed` and `20000`. The probe failed its preservation assertion, demonstrating the concrete regression. |
| Parent GREEN, same `scripts/e2e-budget-hydration.mjs`, `budget-hydration-green-1.json`, actual image8 | The same delayed-response ordering preserves literal `estimate` and `12345`; status passed. The reviewer read the driver and both JSON receipts rather than inferring success from a parent summary. |
| Independent `add-row-probe.mjs`, `add-row-result.json`, image8 | A delayed budget GET is released only after keyboard activation of Add expense, with no field-change event. Two service names remain exactly `Работы` and `Дополнительный расход`; the original unknown status and blank editable limit remain. Exit0, no product mutations or external destinations. |
| Source/build binding | Read-only ready preflight returned HTTP200 and captured the source hash before the independent browser case. Docker inspect independently returned image8 digest/healthy. Source hash remains unchanged at closure. |
| Existing untouched restoration | Preserved prior `ui-review-1/browser-results-2.json` manual restoration and `browser-results-3.json` budget reserve/limit restoration evidence. These historical checks were not rerun or relabeled as image8 execution. Current untouched behavior is additionally supported by the unchanged hydration branch and initial false ref. |

The independent probe performs only a local synthetic-owner login and GET reads. Non-GET browser requests and non-origin traffic are blocked; no form submit, budget write, provider call or restart occurs. Credentials stay in the private fixture file and are never copied to evidence. `add-row-preserved.png` was independently opened: the saved summary appears while the newly added editable expense remains visible, consistent with the intended draft/saved distinction. `node --check` passed for the new probe. The coordinator's typecheck artifact contains the tsc invocation with no reported diagnostic; final aggregate build/test gates remain coordinator-owned.

## Drift, handoff and limits

Image7→image8 is explicit product-source drift: BudgetPanel's capture handlers and hydration predicate changed to close this finding. Image7 RED is negative evidence; all new passing race evidence is bound to image8 `docker:sha256:e5be7120110b92ed9b15b163638e65e339c796b16a0b567e166f53e11d8d8d21`. This scoped closure does not re-certify unrelated export/replacement/camera/privacy paths, nor re-run the prior 21 UI checks. No broader polish or further test round is requested.

Elapsed including source reading, coordination, image readiness wait, paired-proof review and independent probe: **3.77 minutes**, within10-minute bound. One independent browser attempt, zero retries, zero model switches. Active time and actual host model/effort/token/billing counters are unavailable; no estimate is substituted. Owned writes are this receipt and fresh `evidence/budget-hydration-review-1/` artifacts only.

Status: completed
