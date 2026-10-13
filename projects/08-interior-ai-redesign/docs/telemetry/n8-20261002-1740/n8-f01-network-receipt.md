Applied the narrow Compose correction: `web` now joins `private` and a project-scoped `frontend` bridge. DB remains private-only, with no published ports. Loopback binding, resource caps, and all other configuration are preserved.

[Substantive receipt](projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f01-network-receipt.md)

- Run/work/attempt: `n8-20261002-1740` / `n8-f01-network` / `n8-f01-network-attempt-1`
- Source: `1686846b010aa71daef69db193812b9a9df0c6f0`
- Launch SHA256: `e781cc73b0cdf1aa94dec1a300ed60deeebe227c2bc81e4b22f4a0a01b4a06d7`
- Exact tracked diff SHA256: `e0fcc9a7b4b43cfdcd4cca0fe16dc6cc619c0c31a0656b831191b52854bdfa11`
- Checks: Compose config, exact delta, whitespace, source/scope checks all exit `0`.
- Pending: coordinator startup, host HTTP, DB isolation, and fresh Astra review. No containers started.
- Profile: `compact-quality-first-v2`; requested `gpt-6.1-sol/high`; actual model, usage, and cost `null` because host metadata is unavailable.
- Duration: 140.558 seconds from launch. No commit created.

Status: completed