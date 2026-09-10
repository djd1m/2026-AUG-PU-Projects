# Public human-page smoke after pilot ingress correction

RUN_ID: 20260910-agent-payments-public-pilot
WORK_UNIT: human-smoke
Reviewer family: codex
Requested model/effort: existing gpt-6-astra / high
Actual serving model/effort, usage, cost: null (not exposed)
Profile: compact-quality-first-v2
Actual work start: 2026-09-10T10:23:42Z
Browser evidence recorded: 2026-09-10T10:25:12.433Z
Receipt completed: 2026-09-10T10:26:17.374047+00:00
Elapsed wall: 155374 ms; active compute unavailable

Verdict: PASS8/8 read-only public pages following coordinator's ingress correction. Actual Firefox navigated public HTTPS URLs with acceptInsecureCerts=false; no proxy/mock provider/browser TLS bypass was installed. Dedicated WebDriver4582 was confirmed unused before startup. New temporary Firefox profile was managed by geckodriver under the permitted snap test root; session and own driver were stopped after completion.

| URL | Actual title | Forms / inputs | Result |
|---|---|---|---|
| https://proofwall.aicoding.space/ | Proofwall — отзывы, которые продают | 1 / 5 | PASS |
| https://proofwall.aicoding.space/login | Вход — Proofwall | 1 / 2 | PASS |
| https://reviewqr.aicoding.space/ | Отзывы на картах по QR — ReviewQR | 0 / 0 | PASS |
| https://reviewqr.aicoding.space/r/kofeynya-artel | Кофейня Артель | 0 / 0 | PASS |
| https://n3-a.212.192.0.33.sslip.io/account | Круг — рабочий кабинет | 8 / 15 | PASS |
| https://n3-b.212.192.0.33.sslip.io/account | Круг — рабочий кабинет | 8 / 15 | PASS |
| https://n3-c.212.192.0.33.sslip.io/account | Круг — рабочий кабинет | 8 / 15 | PASS |
| https://n3-d.212.192.0.33.sslip.io/account | Круг — рабочий кабинет | 8 / 15 | PASS |

Assertions required exact final URL, expected product title and P1 forms/inputs or N3 unauthenticated login text/forms. The test also rejects known502/503/browser error-page text. P2 pages have no forms by design. This is DOM/browser evidence of rendered public pages, not a direct HTTP-status recording or complete authenticated journey.

Coordinator disclosed an initial Caddy reload against a stale bind-mounted inode temporarily interrupted N3 ingress; hostfile stdin reload corrected it approximately50seconds later. This subtask started after READY and verifies recovery only. It does not claim uninterrupted service or measure exact outage duration.

Existing public P1/P2/N3 URLs were checked; these are not the newly built pilot runtime. Coordinator states the old public P1 image remained unchanged. No image/build inspection was performed by this smoke subtask, and new-runtime acceptance must use its separate source/image-bound evidence. No signup, login submission, purchases, provider calls, credentials, private-account screenshots or application mutations were performed. No unrelated03a scope was inspected.

Evidence JSON: `/tmp/agent-payments-pilot-human-smoke.json`
SHA256: `15bf5937e100345b121281bf387d86bf299c70e904db00428678b75fa48607f3`
Adapted runner: `/tmp/agent-payments-pilot-smoke-run.mjs`
Runner SHA256: `ee9edb55c06e73842ecb9693dc029bf0f7180e434321b36c8b6845ded0f3a975`
Original runner preserved: `/tmp/agent-payments-public-smoke.mjs`

A sandbox netlink check was denied; approved read-only port inspection and browser execution succeeded. Driver emitted ordinary headless/Firefox background-component warnings, but all required page assertions passed and no TLS error was bypassed. Broader authenticated CJM and PSP acceptance remain separately evidenced.

Status: completed
