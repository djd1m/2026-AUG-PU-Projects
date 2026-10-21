# procurement — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: RecordProductSnapshot
REQUIREMENT: `FR-procurement-1`
REQUIREMENT: `AC-procurement-1`
REQUIREMENT: `AC-procurement-2`
REQUIREMENT: `AC-procurement-3`
REALISES: SC-US-009-1, SC-US-009-2, SC-US-009-3
INPUT: actor, product fields or CatalogueProvider response. OUTPUT: immutable snapshot/effective status.
1. GuardRequest; validate URL/decimals/enums and same-project owner; element is verified later in line binding. Missing region/date→unknown; observedAt future beyond clock tolerance→422. Manual fresh requires explicit confirmation; blocked adapter produces blocked data with no invented price.
2. Persist snapshot; shopping line points to it only through versioned command. Effective freshness=fresh only if stored fresh AND matching current region/store AND age≤24h; otherwise stale/unknown/blocked, retaining historical values labelled old.
3. Do not refresh snapshots in place. Current adapter returns manual-required/blocked for unsupported retailer access, with official deep link; no CAPTCHA/proxy bypass.
COMPLEXITY: O(fields), bounded.


### Algorithm: CalculateBudget
REQUIREMENT: `FR-procurement-2`
REQUIREMENT: `AC-procurement-4`
REQUIREMENT: `AC-procurement-5`
REQUIREMENT: `AC-procurement-6`
REQUIREMENT: `AC-procurement-7`
REQUIREMENT: `AC-procurement-8`
REQUIREMENT: `AC-procurement-9`
REQUIREMENT: `AC-procurement-10`
REALISES: SC-US-010-1, SC-US-010-2, SC-US-010-3, SC-US-010-4, SC-US-010-5, SC-US-010-6, SC-US-010-7
INPUT: current owned design, ≤200 lines, cost rows, reservePct/base, optional limit, expectedVersion. OUTPUT: immutable BudgetRevision.
1. UI price in RUB uses min=0, step=0.01; integer input 1600 is valid and converted exactly to 160000 minor. Rerender limit comparison from current controlled value. Enumerate expected element IDs from scene materials/objects: no shopping row creates an unmatched placeholder, never disappears. retained needs explicit reason and remains visibly excluded from purchases. For floor_area require element=floor and baseUnit=m2, derive current confirmed floorArea (null stays unknown). For wall_area require named wall, derive wall length×height−opening areas. surface_area/manual use explicit quantityConfirmed and same sourceShellId or remain unknown, including GLB. Piece objects require piece baseUnit/saleUnit, pack coverage positive and matching material unit; no cross-unit guesses. Parse exact Decimal strings using established decimal library; reject negative/overflow/nonfinite and incompatible units. For a pack need=q×(1+waste/100), packs=ceil(need/coverage); for pieces ceil(need); null q/coverage/price or unmatched/unselected element produces unknown, even if other costs are known.
2. lineMinor=integer pack/piece count×integer purchase price. Separate confirmed fresh costs from estimates/old snapshots: knownSubtotal includes usable confirmed rows; scenarioTotal includes explicit estimates but remains null if any unresolved unknown without estimate. Preserve zero only with explicit entered amount/kind, not absence.
3. Compute reserve from server-computed enum base known_subtotal/scenario_subtotal using decimal round-half-up to minor unit, once; complete iff all lines, work/delivery scope rows resolved and context current, no unmatched or stale evidence. A user can explicitly mark work excluded/self-performed; exclusion is visible and not represented as free vendor service.
4. Revalidate project/design version in transaction, save all immutable input copies + totals/hash/reason; set inputProjectVersion to the new committed project.version after increment, set currentBudgetId. Use semantic inputHash/context for outdated display, so a rename alone is not a cost change. Delta matches stable elementId/cost-row ID and unit; missing/added rows and scope changes explicit. Every BudgetLine stores all mutable selection/phase/quantity/provenance fields in immutable input copy; reproduction never queries current ShoppingLine. services/delivery require at least one explicit row; excluded requires reason and is visibly omitted, not free. Compare limit only on complete scope, otherwise uncertainty.
COMPLEXITY: O(lines + cost rows).


### Algorithm: ReplaceAndPhase
REQUIREMENT: `FR-procurement-3`
REQUIREMENT: `AC-procurement-11`
REQUIREMENT: `AC-procurement-12`
REQUIREMENT: `AC-procurement-13`
REQUIREMENT: `AC-procurement-14`
REALISES: SC-US-011-1, SC-US-011-2, SC-US-011-3, SC-US-011-4
INPUT: existing line, new snapshot/phase or return-to-design. OUTPUT: new selection revision + stale budget.
1. GuardRequest; show difference in price/spec/dimensions; require owner confirmation for substitution. New dimensions trigger ValidateAndRenderScene, never preserve prior fit blindly.
2. Transaction CAS Project/version and line/version; create new DesignRevision for appearance/dimension changes, clone relevant lines to new design; phase-only edit changes line version without duplicating a row. Clear currentBudgetId; old BudgetRevision inputs retained.
3. CalculateBudget and ReviseAndApprove are explicit subsequent commands; RETURN change reason and new version. Return deterministic phase preview from current complete copied inputs; saved BudgetRevision remains old/outdated until explicit recalculation. Summing stages partitions each line exactly once; moving phase changes preview subtotals, never grand total.
COMPLEXITY: O(lines + scene checks).


### Algorithm: ExportShoppingList
REQUIREMENT: `FR-procurement-4`
REQUIREMENT: `AC-procurement-15`
REALISES: SC-US-025-1
INPUT: actor/project/budget revision ID. OUTPUT: owner-only UTF-8 CSV attachment.
1. GuardRequest; load owned immutable budget snapshot plus stored provenance; do not use mutable current shopping rows. Foreign/missing ID→404.
2. Stable columns preserve units/quantity/packs/minor money as formatted RUB/phase/retained/unknown. Snapshot date/outdated context visible.
3. Escape CSV quotes/newlines and prefix dangerous spreadsheet formula strings including leading whitespace. RETURN fixed generic filename attachment, no-store/nosniff; never link via public ShareLink.
COMPLEXITY: O(snapshot lines+cost rows), at most200 shopping lines.


#### Supporting procedure: ResolveCatalogue
Supports RecordProductSnapshot and its FR-procurement-1 declaration.
REALISES: SC-US-009-2
INPUT: owned project/snapshot. OUTPUT: ManualRequired or Blocked plus existing provenance, never invented price.
Authenticate/read own snapshot; adapter performs no arbitrary URL fetch, returns blocked after documented access restriction, records safe redacted status. Browser opens official link itself; owner POST creates new manually confirmed snapshot. GET products/lines are owned bounded pages; no refresh-in-place.


