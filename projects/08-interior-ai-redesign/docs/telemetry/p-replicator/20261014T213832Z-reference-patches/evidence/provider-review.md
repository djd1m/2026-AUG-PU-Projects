# Independent fractional provider amount review
Finished: 2026-10-14T21:55:11.642695+00:00
Actual model: unknown (execution metadata unavailable).
Verdict: changes_requested

Rounding directions are conservative for normal provider precision: configured observed limit rounds up, availability rounds down, usage cost rounds up to integer microUSD, with raw usage cost retained. Fixture covers observed remaining 9.99444808 and usage 0.00555192 -> 5552 microUSD, above-cap fraction and insufficient remaining. Exact raw remaining<=limit comparison is present in final inspected source and closes quantization masking of inconsistent metadata.

Remaining P2 monetary boundary: cap comparison still uses only rounded micro(limit). Decimal multiplication uses finite default precision before ceil; a supported string value such as '10.000000000000000000001' can round during multiplication to exactly 10000000, hiding a fraction above the configured $10 cap. Compare original Decimal limit directly against configured USD cap before quantization; similarly original remaining versus job minimum avoids relying on finite-precision rounding for admission. Add a precise-string cap-boundary case. This does not require changing caps or adding a new validation framework.

No changes to provider endpoints, requireLive, request limits/consent, durable ledger, historical rows or credits in the inspected diff. Static review only; no network/DB/private env/tests/paid calls. Usage/cost unavailable, not estimated.

Source SHA256:
- `packages/adapters/src/openrouter.ts`: 3e0a9d6f197432fd3bd75864c43eb723f8fa66d68a2fd77eacc9b4437342467f
- `tests/design/provider.test.ts`: e4ed6eafffdb681dc5742d126448e5c00fba8d91308014b02a3ceaf2246711eb

FinalStatus: completed
Status: completed
