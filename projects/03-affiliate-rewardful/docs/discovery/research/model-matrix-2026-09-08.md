# GPT model recommendations for feature-ADR

Research snapshot: **2026-09-08**.

For a **quality-first pipeline**, use **GPT-6 Astra** as the default for ADRs, architecture, L/XL implementation plans, consequential plan challenges, complex implementation, and complex QE. Use **GPT-5.6 Sol** for straightforward substantive work, **GPT-5.6 Terra** for bounded work, and **GPT-5.6 Luna** for mechanical tasks with objective checks.

The primary recommendations prioritize quality where mistakes propagate into later stages. Cost-conscious alternatives are listed separately; choosing them is an explicit tradeoff to validate on representative tasks. Astra's absence from the installed workflow allowlist is a routing limitation to resolve, not a reason to exclude it from the recommended allocation.

These recommendations combine official OpenAI model guidance with inspection of the installed feature-ADR workflow. They are starting hypotheses, not results from comparative pipeline benchmarks. This document does not change model routing.

## Account and client availability

| Model | Evidence available during research | Suggested role |
|---|---|---|
| `gpt-6-astra` | Exposed in the research session and listed in the local client catalog | Quality-first default for consequential design, complex planning, implementation, and review |
| `gpt-5.6-sol` | Exposed in the research session and listed in the local client catalog | Straightforward substantive work; cost-conscious alternative on consequential stages |
| `gpt-5.6-terra` | Exposed in the research session and listed in the local client catalog | Bounded implementation, evidence gathering, and structured analysis |
| `gpt-5.6-luna` | Exposed in the research session and listed in the local client catalog | Extraction, bookkeeping, and mechanical edits with objective checks |
| `gpt-5.5` | Exposed in the research session and listed in the local client catalog | Comparison baseline; use when measured results justify it |
| `gpt-5.4-mini` | Listed in the local client catalog; invocation access not verified | Optional baseline for simple tasks |
| `gpt-5.3-codex-spark` | Listed in the local client catalog; invocation access not verified | Rapid, small, text-only coding iterations |

The client catalog was refreshed on 2026-09-08. Catalog presence and session exposure do not establish remaining quota or API-key entitlements. The local configuration selected `gpt-6-astra` with `high` reasoning at inspection time.

## Recommendations by stage

The table maps OpenAI models to suitable work. It is **not an all-OpenAI execution profile**: the installed workflow's vendor-separation rule still applies.

| Stage | Quality-first default and reasoning | Cost-conscious alternative / supporting work | Selection rationale / escalation |
|---|---|---|---|
| **0 — Complexity router + recall** | **Terra medium** | Luna medium for extracting recalled facts, with routing decisions checked separately | **Sol high** when scope, ownership, or risk is ambiguous; an incorrect tier affects downstream stages |
| **1 — Requirements** | **Sol medium** | Terra medium when the brief and acceptance criteria are already precise | **Astra high** for conflicting requirements or unclear product boundaries |
| **2 — Research** | **Terra medium** for evidence gathering; **Sol high** for synthesis | Luna for extraction from already selected sources | **Astra high** when sources conflict or conclusions determine expensive architectural choices |
| **3 — ADR + shift-left validation** | **Astra high** | Sol high for straightforward decisions; Terra medium only for documenting an already settled decision | Compare alternatives, expose assumptions, and identify accepted downsides; use **Astra xhigh** for especially difficult auth, migration, or reversibility tradeoffs |
| **3.5 — QCSD ideation** | **Sol high** for risk and testability judgments | Terra medium for bounded checklist passes | **Astra high** for critical security or failure scenarios |
| **4 — DDD** | **Sol high** | Terra medium for documenting established domain boundaries | **Astra high** when bounded contexts, transaction ownership, or domain invariants are contested |
| **5 — Architecture** | **Astra high** | Sol high for straightforward designs; Terra medium for small extensions of an established design | Reason across service boundaries, ownership, and failure paths; use **Astra xhigh** for especially difficult consistency and recovery decisions |
| **6 — Implementation plan** | **Astra high for L/XL**; **Sol high for S/M** | Sol high for a settled L/XL design; Terra medium for small changes with settled design | Keep dependencies, contracts, migrations, and acceptance criteria consistent; promote S/M work to Astra when sequencing or rollout risk warrants it |
| **Plan challenge / cross-validation** | **Astra xhigh for consequential plans**; Sol high for straightforward plans, when OpenAI is the eligible reviewer vendor | Sol high for bounded reviews; Terra for collecting evidence | Find consequential omissions before implementation; reviewer vendor must follow the challenge-panel rule |
| **7 — Code + tests** | **Astra high for complex implementation**; **Sol high for straightforward implementation** | Terra medium/high for bounded modules; Luna for mechanical edits with objective checks | Astra is the starting choice for difficult integration, debugging, or changes spanning multiple invariants |
| **8 — QE + gap loop** | **Astra high for complex changes**; **Sol high for straightforward changes** | Sol high for bounded reviews; Terra for narrow evidence gathering; Luna for report bookkeeping | Use **Astra xhigh** for difficult auth, concurrency, data-loss scenarios, and tests that may pass despite broken protection |
| **9 — Fleet QE** | **Sol high** for integration and risk assessment | Terra medium for traceability and coverage bookkeeping | **Astra high** for unresolved systemic risks |
| **10 — Delivery gate, opt-in** | **Sol high**, as a target capability allocation | Terra for consolidating verified evidence | **Astra high/xhigh** for consequential release judgments; the installed workflow currently does not support Codex review planes here |

Research and DDD can be selected independently in a manually orchestrated workflow. In the installed deterministic workflow, research shares the requirements invocation, and DDD shares the architecture invocation.

## Reasoning effort

| Effort | Recommended use |
|---|---|
| `low` | Mechanical transformations and short follow-ups with explicit expected output |
| `medium` | Bounded work with clear inputs, constraints, and checks |
| `high` | Default for substantive design, implementation, and review |
| `xhigh` | Specific difficult decisions or adversarial reviews where deeper analysis justifies additional latency |
| `max` | Targeted experiments on the hardest cases; adopt only after measuring benefit |
| `ultra` | Changes orchestration through automatic delegation; not accepted by the installed workflow's effort validator |

Increasing effort does not establish that a smaller model matches a stronger model. Compare actual outcomes. OpenAI documents that higher effort takes longer and uses more tokens; Ultra also introduces subagents. [Model and reasoning guidance](https://learn.chatgpt.com/docs/models)

## Constraints in the installed workflow

| Constraint | Practical consequence | Local source |
|---|---|---|
| Planning and QE use the same vendor; coding uses the other vendor | OpenAI planning + OpenAI QE requires Claude coding. Claude planning + Claude QE permits OpenAI coding. Astra and Sol both count as OpenAI. | `assertFamilyRule()` in [feature-adr.js](../../.claude/workflows/feature-adr.js) |
| Astra is missing from `KNOWN_CODEX`; the flagship tier currently resolves to Sol | A per-stage Astra spec can be replaced by the configured fallback. Explicit Astra routing needs verification before assuming Astra executed the stage. | `KNOWN_CODEX`, `CODEX_TIERS`, `specToOpts()` |
| Research is folded into requirements; DDD is folded into architecture | Separate `models.research` and `models.ddd` values do not independently select their executing models. | Design dispatch in `feature-adr.js` |
| OpenAI-primary QE currently defaults to Luna | Select Astra high for complex QE once routing is verified; use Sol high for straightforward QE or as the cost-conscious alternative. Validate Luna on defect-bearing examples before assigning it sole responsibility. | `resolveQeSpecForCoder()` |
| Codex delivery review planes are unsupported | `models.delivery` naming Codex falls back to Claude. A stronger model selection does not resolve the dispatch limitation. | Step 10 delivery dispatch |
| Adaptive routing and fallbacks can change execution | Record the model that actually ran and any fallback when evaluating a profile. Requested configuration alone is insufficient evidence. | `usageOverride`, `modelsUsed`, Codex dispatch paths |

The plan challenge has its own independence rule: it selects the other vendor from the plan author. This is separate from Step 8 QE, which follows the plan's vendor and reviews the other vendor's code.

## Practical starting profiles

| Profile | Plan | Code | QE | Intended use |
|---|---|---|---|---|
| Quality-first: OpenAI implements | Claude | **Astra high** for complex implementation; **Sol high** for straightforward changes | Claude | Start complex integration and debugging on Astra |
| Quality-first: OpenAI designs and reviews | **Astra high** for L/XL or consequential plans; Sol high for straightforward S/M plans | Claude | **Astra high/xhigh** for complex changes; Sol high for straightforward changes | Prioritize quality in planning and independent code assessment |
| Cost-conscious: OpenAI implements | Claude | **Sol high**; Terra for bounded changes | Claude | Evaluate a cheaper implementation baseline against the quality target |
| Cost-conscious: OpenAI designs and reviews | **Sol high** | Claude | **Sol high** | Evaluate a cheaper planning and review baseline against the quality target |

These are role allocations, not copy-paste workflow configurations. Stage coupling, allowlists, and fallback behavior must be accounted for when configuring them.

## Cost and evaluation

Published standard credit rates at research time make Astra **2.5 times Sol per token**, and Terra **10 times Luna** for both input and output. These are rate comparisons, not completed-feature cost estimates. Reasoning, cache use, retries, and rework affect total consumption. [Official credit rates](https://learn.chatgpt.com/docs/pricing)

Before making cheaper models the default:

1. Establish a quality baseline on historical ADRs, plans, and defect-bearing diffs using a strong model.
2. Compare Sol with Astra on consequential stages, then evaluate Terra and Luna on bounded stages.
3. Measure missed important defects, false-positive findings, and total time/credits including rework.
4. Record the actual model, effort, fallback, and evidence used for each verdict.
5. Adopt the cheaper option only where it meets the stage's quality target.

This follows OpenAI's guidance to establish accuracy first, then optimize cost and latency. [Model-selection methodology](https://developers.openai.com/api/docs/guides/model-selection)

## Sources

- [Official OpenAI model and reasoning guidance](https://learn.chatgpt.com/docs/models)
- [Official OpenAI credit rates and usage guidance](https://learn.chatgpt.com/docs/pricing)
- [GPT-5.6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Official model-selection methodology](https://developers.openai.com/api/docs/guides/model-selection)
- [Installed feature-ADR skill](../../.claude/skills/feature-adr/SKILL.md)
- [Installed feature-ADR workflow](../../.claude/workflows/feature-adr.js)
- Local client evidence inspected during research: `/Users/dpzhechkov/.codex/models_cache.json` and `/Users/dpzhechkov/.codex/config.toml`.
