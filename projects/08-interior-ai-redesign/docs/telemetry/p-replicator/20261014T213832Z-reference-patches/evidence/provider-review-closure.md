# Fractional provider amount corrective closure
Finished: 2026-10-14T21:55:56.963708+00:00
Actual model: unknown (execution metadata unavailable).
Verdict: pass

The reviewed precision boundary is closed. Decimal input is validated finite/nonnegative, rounded to six decimal places in the conservative direction before multiplication, then checked against safe integer range. Provider admission directly compares unquantized remaining<=limit, limit<=configured USD cap and remaining>=job USD minimum. Tiny fractions cannot disappear before the admission checks. Usage cost rounds up and raw usage remains available.

Tests inspected include observed fractional provider balance/cost, above-cap and below-minimum high-precision strings, inconsistent remaining and a cost just above one microUSD that must become two. These were inspected only; actual test/lint/build execution remains coordinator-owned.

Scope limited to the reported precision correction. No further blocker identified. No network/DB/private env/paid calls/historical ledger changes or test execution by reviewer. Usage/cost unavailable, not estimated.

Source SHA256:
- `packages/adapters/src/openrouter.ts`: c8c821199b19a7dd9f6448ae752187d454f2302bea0dd24c87d686fd8393d32c
- `tests/design/provider.test.ts`: f619acdb16ffdd273ad6bc1417ddb0498cf2a2f36e1e2417de51fa3fe4030395

FinalStatus: completed
Status: completed
