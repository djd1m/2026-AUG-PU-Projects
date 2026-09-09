# F2 YooKassa adapter receipt

- Run: `20260909T085312Z-f2-auth-payments-agents`
- Work unit: `payment-adapter`
- Scope: `projects/03-affiliate-rewardful/shared/payments/yookassa.mjs` and `tests/yookassa-adapter.test.mjs`
- Commit: `2efe4d8d982bb4763e05fe41e8cb5ddbf0dd402b`
- Requested route: `gpt-5.6-sol`, high effort
- Actual model/effort: `null` (per-agent execution metadata is not exposed in this session)
- Fallback: `null` (no execution metadata proving a switch or fallback)
- Duration/usage: `null` (no per-agent elapsed-time or token counters exposed)

## Delivered contract

`createYooKassa({shopId, secretKey, testMode, fetchImpl?})` returns frozen methods
`createPayment`, `getPayment`, `getRefund`, and `verifyNotification`.

Normalized payment facts are `{id, status, amountMinor, currency, recipientAccountId,
test, paid, refundable, orderId, confirmationUrl, paidAt}`. `paidAt` is the validated
provider `captured_at` value and is mandatory before a `payment.succeeded` notification
is accepted. Normalized refund facts are `{id, status, amountMinor, currency,
paymentId, refundedAt}`; `refundedAt` is validated provider `created_at`.

`verifyNotification` accepts bounded raw UTF-8 bytes or text. It ignores events other
than `payment.succeeded` and `refund.succeeded`. For an accepted payment it reads the
payment with authenticated YooKassa API credentials, validates merchant recipient,
test/live mode, RUB amount, status, UUID binding, and timestamp, then compares the
notification facts. For an accepted refund it first reads the refund and then its
originating succeeded payment, applies the same merchant/mode/order checks, and ensures
the refund does not exceed that payment. It returns authoritative facts only; tenant
selection, durable order comparison, deduplication, locking, and ledger writes remain
the application layer's responsibility and must happen after this call.

Errors are subclasses of `YooKassaError`: `YooKassaConfigError` (`invalid_config`),
`YooKassaInputError` (`invalid_input`), `YooKassaProviderError` (bounded transport
codes plus nullable HTTP `status`), and `YooKassaVerificationError`
(`verification_failed`). Messages never include response bodies, credentials, or
underlying network error text; the root HTTP boundary can wrap these as `AppError`.

## Transport and safety evidence

The adapter sends Basic authentication only to the code-owned endpoint
`https://api.yookassa.ru/v3`, uses `redirect: 'error'`, a 5 second abort signal, and
64 KiB limits for both provider JSON and incoming notifications. Payment creation uses
the immutable order UUID unchanged as both `Idempotence-Key` and `metadata.order_id`.
Minor units are converted to a two-decimal RUB string without floating-point rounding.
Inputs are bounded and HTTPS return URLs with embedded credentials are rejected.

YooKassa documents the fixed v3 endpoint and HTTP Basic authentication in its
[API interaction format](https://yookassa.ru/developers/using-api/interaction-format).
The same page documents a maximum 64-character `Idempotence-Key`, repeat semantics,
and a 24-hour provider idempotence window. The root application must therefore stop
and reconcile an ambiguous create attempt older than 24 hours; blindly sending the
same order UUID after that window can create another payment.

The request body and `metadata` round trip follow YooKassa's
[payment process](https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process).
Payment response examples document `recipient.account_id` and `test` in
[HTTP response handling](https://yookassa.ru/developers/using-api/response-handling/http-codes).
The provider's [widget quick start](https://yookassa.ru/developers/payment-acceptance/integration-scenarios/widget/quick-start)
shows successful payment objects with `captured_at`, `recipient`, and `test` together.
The accepted events follow the provider's
[incoming notifications](https://yookassa.ru/developers/using-api/webhooks), which lists
`payment.succeeded` and `refund.succeeded`. Refund ID, `payment_id`, amount, status, and
`created_at` follow the provider's
[refund documentation](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds).
Sources were reviewed 2026-09-09. No merchant credentials or financial network calls
were used; all transport tests use injected fetch mocks.

## Validation

- `node --test tests/yookassa-adapter.test.mjs`: 13/13 passed.
- Mutation proof: temporarily removed the `recipient.account_id === shopId` guard;
  the focused run failed 3 tests, then the guard was restored and 13/13 passed.
- `npm run build`: passed, 61 modules checked.
- `npm test`: adapter and seven independent file suites passed; eight existing DB/HTTP
  file suites could not start because the isolated worktree has no
  `DATABASE_PASSWORD_FILE` (`DATABASE_SECRET_REQUIRED`). No database/container setup was
  added or changed in this bounded work unit.
- `npm ci`: existing lockfile installed 15 packages, audit reported zero vulnerabilities;
  manifests and lockfile were unchanged.
- `git diff --check`: passed.

## Review of reused read-only implementations

Project 01's payment module allows `YOOKASSA_API_URL` to redirect Basic credentials,
does not disable redirects, parses unbounded JSON, converts money through `Number`, and
does not validate currency, merchant recipient, test/live mode, order binding, or
provider timestamps. Its documented webhook path also performs provider I/O while a DB
transaction is held. Its synthetic succeeded fallback is inappropriate for F2.

Project 02 fixes the API host and provider-before-dedup ordering, but creates a new
random idempotence key inside each checkout call, so an application retry cannot reuse
the durable order key. Its webhook read-back validates only status, with no payment ID,
amount, currency, recipient, test/live, durable binding, timestamp, or refund checks;
responses are unbounded and redirects are not disabled. These implementations were
used only as read-only lessons and were not copied.
