# Public TEST pilot browser acceptance

This harness targets only the dedicated Proofwall public pilot and public MCP/A2A
gateway. It uses the real Firefox browser, actual MCP SDK, actual Resend API and actual
YooKassa TEST hosted payment. It does not target existing production P1/P2/N3 sites.
The coordinator owns deployment, provider configuration and any scoped database setup.

Before execution the coordinator must declare the deployment ready and independently
verify that its YooKassa account is TEST. Read-only source used for the SDK is supplied
with `PILOT_MAIN_SOURCE`. `PILOT_MAIL_ENV` points to an ignored private file containing
the read-capable `RESEND_API_KEY`; the harness only retrieves the exact synthetic
recipient's sent message. Other messages are never logged or stored.

```sh
PILOT_READY=true PILOT_TEST_SHOP_CONFIRMED=true \
PILOT_MAIN_SOURCE=/absolute/main/projects/01-testimonials-senja \
PILOT_MAIL_ENV=/tmp/private-mail.env \
node tests/agent-payments-pilot/run.mjs identity
```

Then run phases `purchase`, `inspect`, `pay`, `settle`, `mandate`, `revoke`, `close` using the same
environment. `purchase` stops on the real hosted provider form for inspection and
explicit TEST card submission. `inspect` selects the card form and reports empty field
structure. `pay` requires the actual TEST label and submits the official synthetic card
once, checkpointing before the click. It never screenshots or logs filled card fields.
`settle` checks verified server status. `mandate`
reports normal renewal ineligibility unless the coordinator separately authorizes
scoped synthetic renewal history/window setup and `PILOT_RENEWAL_AUTHORIZED=true`.
No identity proof is seeded or bypassed.

Private state, generated password, grant and browser session are kept mode0600 under
`/tmp/agent-payments-public-pilot/`. Phases resume the same synthetic buyer. No automatic
new buyer or payment is created after a failure. Browser is a unique snap-compatible
Firefox profile, direct networking and normal TLS validation. No provider screenshots
are captured; bearer textareas and password fields are hidden in pilot screenshots. Public JSON evidence
contains only safe outcome fields and order identifiers.

Official guidance verified on 2026-09-10:

- [YooKassa TEST payments](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing)
  supplies a Mastercard ending4444 without 3DS for saved-method testing, a future expiry
  and arbitrary numeric CVC. Real cards must not be used.
- [Resend test emails](https://resend.com/docs/dashboard/emails/send-test-emails)
  supports `delivered+label@resend.dev` for simulated successful delivery.
- [List sent emails](https://resend.com/docs/api-reference/emails/list-emails) and
  [retrieve sent email](https://resend.com/docs/api-reference/emails/retrieve-email)
  provide the genuine verification link from the sent test email.

This stage is native Proofwall only. It does not claim an agent-to-N3 attribution chain.

Recorded acceptance: **14/14 PASS**, two actual YooKassa TEST payments of990 RUB.
The first payment used explicit browser consent; the second used the saved method
and independent mandate after coordinator-owned synthetic month/window setup.
Both PSP/ledger readbacks independently matched TEST account/order/amount, saved
method, active tariff, and exactly two orders/attempts/reservations.

Coordinator executed final browser revocation and close after a child tool approval
wait was interrupted. Revocation denied subsequent A2A access401. Packaging was
finished by the coordinator after interrupting a pending agent initialization;
this is not attributed as an all-author execution. Evidence in `close.json` contains
the final14records. No further payment calls were made during packaging.

The configured shop is shared with the old production runtime. Its unchanged
webhook may write operational unknown-event records there; this harness never
directly targets production accounts or changes production tariffs. Refund recovery,
ordinary pilot checkout callbacks and N3 integration are separate pending work.
