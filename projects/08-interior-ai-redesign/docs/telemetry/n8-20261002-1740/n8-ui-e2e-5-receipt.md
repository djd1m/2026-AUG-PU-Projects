# N8 browser attempt5 — failed

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-e2e-5
Source: 6d04b91e545822b723bedd49f794f6aa228d4a69
Build: bc2f8877c43c883c3c5a0b60d59dfbd7dc416b376947f2126c61aa5483cf70d2
Launch-SHA256: b0cd58085a09db421a080e4c20688e0acc1a658c5d61412d9cb2e52cb856c5d0

Preflight validator0 checked before actual browser. Started02:52:26.559406Z, finished02:54:32.076562Z,125517ms, exit1. Passed previous failing sequence and reached next delayed logout assertion, but login button was enabled while logout response held (browser-cases.js209). No complete results.json or aggregate E2E PASS.

Product source inspection: app.js auth-form async finally unconditionally enables form buttons after load(); logout onclick synchronously disables them and sets logoutPending. A previous login load completion can re-enable them while newer logoutPending still exists. Submit handler still refuses login while logoutPending, so no authenticated request bypass is claimed. Concrete UI state race requires minimal app correction plus deterministic actual-app regression and fresh independent review. F06a docs worker interrupted rather than exceeding4 active lanes; its partial work/telemetry retained separately.

Own stack/network cleanup exit0; shared browser preserved. All prior failures unchanged. RealGPU acceptance remains pending. Usage/cost null.

Status: failed
