# Honest Configuration

## Rule

A value that controls external output, access, limits, routing, or an authoritative measurement must
not become a plausible or permissive result when its meaning is absent or unproven. Refuse or expose
unknown; never manufacture health.

## Mechanics

### Substitution axis

Absence is not permission to invent a runtime value. Validate required values at the boundary and
derive degradation from the value actually obtained, even when no failure-only sentinel was set.

### Interpretation axis

Keep `undefined` distinct from `''`. Validate empty, misspelled, unmapped, and authority-derived values
against a closed set in versioned code. Environment variables may select a code-owned variant; they
must not define the allowlist. A declared input that no decision reads is fail-open-by-omission.

| Case | Observable signal | Required response |
|---|---|---|
| CFG-S1 | Required runtime value is absent | REFUSE and name the external consequence; no plausible default. |
| CFG-S2 | Obtained value is invalid although the failure sentinel is unset | REFUSE from the obtained value. |
| CFG-I1 | Value is `undefined` | REFUSE or UNKNOWN; preserve the absent state. |
| CFG-I2 | Value is the empty string `''` | REFUSE; do not collapse it into `undefined` or unrestricted. |
| CFG-I3 | Variant is misspelled, unknown, or unmapped | REFUSE; list the code-owned recognized variants. |
| CFG-I4 | Source of truth is unreachable | UNKNOWN or REFUSE; do not use cached permissive meaning. |
| CFG-I5 | Declared allowlist/config input is never read by the decision | REFUSE and wire the decision to the input. |
| CFG-I6 | Empty CIDR becomes `/0`, allowlist is empty, `BASE_URL='/'`, or tariff is unmapped | REFUSE; no unlimited access or plausible output. |
| CFG-I7 | Ratio denominator is zero (`0/0`) | UNAVAILABLE or UNKNOWN; render empty with the reason, never `0%`. |
| CFG-I8 | Allowlist or recognized-variant universe comes from environment | CODE-OWNED closed set; environment selects only. |

## Bounded exception

A named build phase may use a substitute only when that phase cannot emit or publish the external
result; generic “non-production” is not a boundary. An optional dependency may fall back only when
its absence cannot alter the governed external output, access, limit, route, or measurement.

## Observable violation → replacement

| Observable violation | Required replacement |
|---|---|
| Missing URL/project name becomes localhost, `/`, or an inferred name | Validate at the boundary and refuse with the affected output named. |
| Empty/unknown access or limit value becomes unrestricted | Reject before the access, routing, or limiting decision. |
| Failure is logged but the invalid obtained value still emits a healthy result | Compute status from the value/outcome and stop the emitting action. |
| Undefined measurement renders as numeric zero | Render unavailable/empty and preserve why it could not be measured. |

## Self-check

For each governed value, enumerate absent, empty, invalid, unknown, and unreachable states beside one
explicit valid control. Trace the value into the decision that emits output. If any bad state reaches
a default, `ALLOW`, unlimited behavior, `/0`, or `0%` for `0/0`, the boundary is fail-open.
