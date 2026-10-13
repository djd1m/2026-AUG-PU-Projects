# Cost-of-Detection Ladder

Use this rule when you design a safeguard for an engineering or architectural property. The goal is
to detect a violation early, consistently, and close the loop with a named response.

Put every safeguard on the **strongest layer that can reliably express the property**. “Strongest”
means cheapest to run, most deterministic, and hardest to skip. Move down the ladder only when the
property cannot be observed faithfully on a stronger layer.

## The ladder (strongest to weakest)

### Layer 1 — Deterministic test, CI check, or static guard

Use a repeatable executable check for properties such as file presence, size, format, exact paths,
schema shape, forbidden strings, and locally testable behavior. This layer is fast, machine-readable,
and does not depend on a model noticing the problem.

### Layer 2 — Always-loaded governance

Use a rule or role document that is loaded on every relevant run for structural guidance that needs
context but must remain continuously visible. State the invariant and the evidence expected from the
implementation; do not rely on prose alone when Layer 1 can express the same property.

### Layer 3 — Pipeline gate

Use a named pipeline step that records a machine-readable verdict for cross-artifact, workflow, or
semantic properties. A semantic or adversarial check may use an independent model-backed gate here,
but its verdict must be stored and the failure action must be explicit.

### Layer 4 — Skill or reviewer judgment

Use task-invoked specialist judgment for properties that genuinely require interpretation and cannot
be made into a reliable stronger-layer gate. Its output is evidence for a decision, not a substitute
for a deterministic check that could have run earlier.

### Layer 5 — Agent memory or informal recall

Use memory, convention, or “vibes” only as a prompt to create a real safeguard. This is the weakest
layer because it is probabilistic, easy to omit, and silent when forgotten.

## Choose the check kind from the signal

**Check kind and enforcement layer are separate axes.** First identify the observable signal and the
mechanism that can observe it. Then place that mechanism on the strongest reliable layer above.

| Nature of the observable signal | Suitable check kind |
|---|---|
| Static structure or format | Static check or deterministic test |
| Local behavior | Unit test |
| Component interaction | Integration or contract test |
| Behavior over time | Monitor with a defined threshold or invariant |
| Runtime quantity | Metric and threshold alert |
| Discrete transition | Event or audit check |
| Failure resilience | Controlled fault injection |
| Semantic or adversarial property | Independent model-backed review gate with a recorded verdict |

Use only the rows relevant to the property. A mechanism is unsuitable if it cannot observe the signal
directly—for example, a static grep cannot establish runtime resilience.

## Close the loop with a reaction

Every safeguard must connect the reason for the property to an observable signal, a recurring trigger,
and a response. Record it with this shape:

| Cause / property | Observable signal | Check kind | Layer | Scope — what it does NOT cover | Trigger / cadence | Reaction | Owner |
|---|---|---|---|---|---|---|---|
| Why the constraint exists | What changes when it is violated | How it is observed | Where it is enforced | The boundary, stated so nobody has to infer it | When it runs | What happens on failure | | Who acts |

**Reaction must name a concrete action.** Valid reactions include: block or return the change, repair
the practice or implementation, escalate to the named owner, or revisit the decision explicitly.
A blank cell, “note the warning,” or “the reviewer decides” does not close the loop.

## Design procedure

1. State the property and why it exists.
2. Name the observable signal produced by a violation.
3. Select a check kind that can observe that signal.
4. Place the check on the strongest layer that can express it reliably.
5. Define its trigger or cadence, concrete Reaction, and owner.
6. Test that the safeguard FIRES on a deliberately bad input — and, in the same breath, that it
   stays CLEAN on a correct and COMPLETE one. Both halves or neither: a guard proven only to fire is
   indistinguishable from one that fires at everything, and a guard proven only to pass is
   indistinguishable from one that cannot see. The two cases are cheap together and worthless apart.
7. State the check's SCOPE — what it does not look at. Every guard has a boundary, and a boundary
   left unsaid is read by the next person as "covers everything".

## Anti-pattern: “the critic/reviewer will catch it”

Deterministic properties must not be delegated to probabilistic review. If a short test can check a
path, count, format, registry entry, or forbidden value, put that check on Layer 1. Reviewer judgment
may complement the check for semantics; it must not carry a deterministic invariant by itself.

## Worked example

| Cause / property | Observable signal | Check kind | Layer | Trigger / cadence | Reaction | Owner |
|---|---|---|---|---|---|---|
| Required configuration must ship with the package | The packed file list lacks the required path | Deterministic artifact-membership test | 1 | Every package build | Block the build and restore package wiring | Package maintainer |

The same property written only as “remember to include the file” would sit on Layer 5 and could fail
silently. The artifact test observes the real distribution boundary and defines what happens when it
breaks.

---

## A guard that cannot fail is not on Layer 1 — it is decoration

A check earns its layer by what it does on BAD input, not by existing. A guard nobody ever saw refuse
is indistinguishable from a guard that cannot refuse, and the two are told apart by one act: feed it
the thing it exists to catch and watch it go red.

**The rule.** Every guard you add ships with a case that makes it FAIL. Not a case that exercises it —
a case that would pass if the guard were deleted, and fails because it is there.

Three ways a guard silently cannot fail, all of them observed:

| How it dies | What it looks like | How to tell |
|---|---|---|
| Its predicate matches nothing | green forever, no findings ever | inject the exact shape it names; it must go red |
| It is never invoked | green because it never ran | grep the pipeline for its invocation and for consumption of its exit code |
| It refuses on absence | red always, for a reason unrelated to the defect | run it on known-good input; it must go green |

**The honest half of this rule.** No mechanism in this package enforces it. There is no meta-test
walking every guard and demanding a failing case beside it. Until such a test exists, this rule lives
on **Layer 4** — it works when someone reads it and applies it, and lapses silently when nobody does.
Writing it here does not make it Layer 1; only the meta-test would.

That admission is the point. A rule that overstates its own layer is exactly the defect it warns
about: a Layer-4 habit wearing Layer-1 clothes, which is the worst outcome the ladder describes,
because it buys the confidence of a deterministic check while keeping the reliability of a reminder.
