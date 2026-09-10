# Agent payments gateway

Stateless MCP Streamable HTTP (`/mcp`, official SDK) and A2A 0.3 JSON-RPC
(`/a2a`, structured data only) frontends for the same backend orders.
The gateway cannot approve purchases, issue buyer grants, change prices or settle payments.
It has no database connection, card data or PSP credentials. No LLM runs inside it.

## Configuration

| Environment | Meaning |
|---|---|
| `AGENT_BACKEND_URL` | Fixed backend URL ending `/api/agent-payments/commands` |
| `AGENT_GATEWAY_SECRET` | Random service credential, at least 32 characters; same on backend |
| `AGENT_PUBLIC_ORIGIN` | External origin; used for MCP Origin validation and A2A card |
| `HOST`, `PORT` | Listener, defaults `0.0.0.0:3000` |

`npm ci && npm test && npm run build` runs protocol checks, using a mock HTTP backend.
Build the independent container with `docker build services/agent-api` from P1.
Use `compose.agent-payments.yml` with the normal project compose files. It publishes
only a loopback gateway port, configurable through `AGENT_GATEWAY_PORT`, default 13041.
Check that port before starting. Public HTTPS ingress must be configured separately.

## Client flow

1. Call `buyer_link_start` with `{displayName,audience:"proofwall-agent-api"}`.
2. Give `approvalUrl` to the human. They sign in, verify email, select their project
   and approve connection. This does not authorize a charge.
3. The human copies the once-displayed buyer key into the client's `Authorization:
   Bearer …` setting. `buyer_link_status` never returns that key.
4. Call `offer_get` with `{productId:"proofwall-paid-30-days"}`.
5. Call `order_create` with the returned `quoteId` and a caller-persisted `requestKey`.
6. Call `payment_execute` with `orderId`. Follow `nextAction`. A human approval URL
   means the human must approve and complete hosted checkout. A buyer grant alone
   never permits autonomous payment.
7. Poll `order_get`. A redirect to Proofwall is not evidence of payment. Only verified
   PSP facts can produce `paymentStatus: succeeded`; inspect fulfillment separately.

Saved-method renewals require a separately approved, unexpired mandate and an eligible
offer within the shared budget. An ambiguous execution response requires inspection of
the existing order; do not generate a fresh order to retry a potentially accepted charge.

MCP clients configure an HTTP endpoint and the buyer authorization header. Discovery
and pairing need no buyer header, but private commands require one. No OAuth discovery
or automatic compatibility with every agent client is claimed.

A2A `message/send` accepts this data part inside a user message:

```json
{
  "jsonrpc": "2.0", "id": "request-1", "method": "message/send",
  "params": {
    "message": {
      "kind": "message", "role": "user", "messageId": "message-1",
      "parts": [{"kind": "data", "data": {
        "command": "offer_get", "input": {"productId": "proofwall-paid-30-days"}
      }}]
    }
  }
}
```

Order commands return an A2A Task whose ID is the durable backend order ID. `tasks/get`
checks buyer ownership again. `tasks/cancel` cannot cancel a PSP payment and returns
TaskNotCancelable after checking ownership. Revoke authority through the human account.
Streaming, push notifications, file/text-driven purchases and asynchronous task scheduling
are not implemented. The backend—not gateway process memory—owns recovery.

## Limits

Requests are limited to 16 KiB; backend responses to 64 KiB. Backend calls have a 15s
timeout and never follow redirects or automatically retry. Errors expose bounded codes,
not provider exception text. Caller rate identity uses the socket address hash; behind a
proxy this conservatively shares a bucket, so deployment-specific trusted proxy support
is needed before high-volume use. Do not trust arbitrary `X-Forwarded-For`.
