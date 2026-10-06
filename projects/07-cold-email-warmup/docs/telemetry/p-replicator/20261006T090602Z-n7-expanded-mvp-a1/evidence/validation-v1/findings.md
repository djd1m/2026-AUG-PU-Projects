# N7 expanded MVP validation findings
Spec revision: sha256:09ba7b742094e0e5e22c27010ebcb4d7155de2c406772c0c589a795bae6f1a5b

## N7-VAL-001 — HIGH — Mandatory autopilot lacks a concrete content acceptance oracle and evaluation gate
Paths: /tmp/n7-expansion-plan-20261006/features/expanded-mvp/01_specification.md, AC-expanded-mvp-006/007; /tmp/n7-expansion-plan-20261006/features/expanded-mvp/02_pseudocode.md:79–81; /tmp/n7-expansion-plan-20261006/features/expanded-mvp/04_refinement.md:19–30,36.

Evidence: algorithm says “Validate output/intent/grounding against allowed context” and hold “invalid/uncertain”. Refinement lists adversarial inputs but provides no supported intent set, allowed business-context fields/claims, observable grounding rule, labelled success/hold cases or release thresholds. It explicitly permits stronger output policy after the pilot. Transport/security acceptance and latency alone therefore allow a syntactically valid, promptly sent but invented business commitment to satisfy the present AC.

Impact: independent implementer/reviewer cannot decide whether a concrete draft is correctly authorized/grounded or distinguish a useful supported reply from unsafe invention. This affects mandatory automatic sending, not optional editorial polish. A model-produced intent label cannot serve as its own sufficient acceptance authority.

Minimal repair before dependent AI/autopilot implementation: add one small normative policy table defining initial supported intents and allowed business-context fields/claims, mandatory hold outcomes (including ambiguity, missing facts and attempts to obtain unapproved information), and which server-side validations gate autopilot. Add a versioned local labelled case set covering supported useful replies plus unsupported/adversarial/foreign-context inputs, exact pass/fail thresholds for grounding, zero unauthorized disclosure/commitment and correct holds, with model/prompt/policy version recorded. If arbitrary semantic grounding is not reliably enforceable, scope the first autopilot to constrained replies assembled from approved fields; retain richer drafts under HITL. Bind this evaluation to AC006/007 and the pre-autopilot gate. No new evaluation service or platform is necessary; no external model calls are authorized by this recommendation.

Other matters in validation-report.md are implementation/live prerequisites already honestly gated by the plan, not additional blockers.
