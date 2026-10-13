# 06. Checks and troubleshooting

- Startup: verify secret-file presence, JSON allowlist, matching APP_ORIGIN, supported
  `disabled|local_test` modes and database readiness without printing key values.
- 401: log in again; stale async responses after logout are intentionally discarded.
- 403: check the exact Origin and port; do not weaken the server guard.
- 429/503: honor Retry-After and bounded KDF/service availability. Registration is
  limited to 5/hour/IP; do not disable the limiter for user journeys.
- Waiting/zero dispatch: check another eligible tenant, both consents, quota, due
  time, quarantine/suppression and a recent completed poll.
- Unknown submission: do not blindly resend; reserved quota remains held.
- Sharing blocked: verify matching source/ref/metric/direction and comparable windows,
  latest ≤7 days, baseline ≤28 days, no future dates, and an improvement.
- Public report 404: token missing/revoked. Mobile tables use their own labelled,
  keyboard-scrollable region; the page itself must not overflow horizontally.

With Node 22 and `npm ci`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Integration tests require a separate disposable database and runtime configuration,
never the working database. Feature telemetry contains executed source-bound runners.
`npm run test:integration` does not create PostgreSQL. Actual E2E uses shared Docker
Playwright 1.63.0, source/build preflight and real business APIs.
