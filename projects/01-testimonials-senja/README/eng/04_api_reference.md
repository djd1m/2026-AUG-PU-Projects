# API Reference

The base address is the value of `BASE_URL`. All bodies are JSON unless stated otherwise.

Owner authentication — the `pw_session` cookie, `httpOnly`. The token is **never** returned in
the response body: otherwise any script on the page could read it.

## Public routes (no login)

### `POST /api/auth/register`

Creates an account and the first project, and issues a session immediately.

```json
{
  "email": "owner@example.com",
  "password": "at least 12 characters",
  "desired_slug": "acme",
  "project_name": "Acme"
}
```

`201`:

```json
{
  "account_id": "uuid",
  "project_slug": "acme",
  "urls": {
    "submission_form": "https://your-domain/f/acme",
    "wall_of_love":    "https://your-domain/w/acme",
    "dashboard":       "https://your-domain/dashboard/acme",
    "widget_snippet":  "<script src=…></script>"
  }
}
```

The addresses in `urls` are built from `BASE_URL`. If it is not set, they will all point at
`http://localhost:3000` — and the response will still be `201`, so the error is visible only in the content.

| Code | Reason |
|---|---|
| `400` | The body is not JSON, or the fields failed validation (the list is in `errors`) |
| `409` | The slug is taken |

### `GET /api/projects/slug-available?slug=acme`

`200` → `{ "available": true | false }`

### `POST /api/testimonials`

Submission of a text testimonial. Accepts `application/json` or `multipart/form-data`
(the latter — when a photo is attached).

Fields: `slug` (required), `name` (required), `role`, `text` (required), `photo` (file, only in
`multipart`).

`201` → `{ "public_id": "…" }`

| Code | Reason |
|---|---|
| `400` | Fields failed validation; the photo is not JPEG/PNG/WebP, is larger than 5 MB, or its content does not match the declared type |
| `404` | Slug not found |
| `429` | The limit of 5 submissions per hour from one IP has been exceeded |

The text is accepted **as is**, without stripping markup. Neutralisation happens at render time.
This is a deliberate decision: cleaning at the entrance loses the original text irrecoverably and
still does not protect the places where the testimonial is output in a different context.

### `POST /api/testimonials/video`

`multipart/form-data` only. Fields: `slug`, `video` (file, up to 100 MB), `name`, `role`,
`text_caption`, `duration_sec`.

`201` → `{ "public_id": "…" }`. The transcript is queued and appears later in a
separate field.

### `GET /api/widget/config?slug=acme&domain=example.com`

Widget settings. **`badge_required` is computed by the server** from the project's plan — a
parameter through which the client could influence this does not exist.

### `POST /api/widget/badge-click`

Accounting of a click-through on the badge. Always `204`, including on a malformed body: this is
a counter, it must not report anything to the caller.

### `GET /api/photo/<key>`

Serves the photo with a type determined by the server **from the file's content**, and with the
`X-Content-Type-Options: nosniff` header.

### `POST /api/webhooks/payment`

A YooKassa notification. Body: `{ "event": "...", "object": { … } }`.

The provider does **not** sign its notifications, so authenticity is confirmed in two ways at
once:

1. the source address belongs to YooKassa's published list of networks;
2. the payment status is re-requested through the provider's API.

Repeated delivery of the same event is safe: idempotency is guaranteed by a unique constraint in
the database, not by a "does such a record already exist" check before the insert — otherwise two
simultaneous deliveries would both go through.

## Owner routes (a session is required)

### `POST /api/testimonials/<id>/moderate`

```json
{ "status": "approved" }
```

Allowed values: `pending`, `approved`, `rejected`, `hidden`.

| Code | Reason |
|---|---|
| `400` | Invalid status or invalid transition (the error text states from which to which) |
| `403` | The testimonial belongs to someone else's project |
| `404` | Not found, or the identifier is not a UUID |
| `409` | The state changed between the read and the write |

### `POST /api/checkout`

```json
{ "slug": "acme" }
```

`200` → `{ "redirect_url": "…", "stub": true|false }`

`stub: true` means that `PAYMENTS_STUB` is enabled and there was no real call to the provider.
`501` — payments are not configured, `502` — the provider is unavailable.

### `POST /api/share`

Marks that the owner has **confirmed** the intention to share. Until this route is called, the
application does not contact any external services — this property is verified by a separate
test that reads the component's source code.

## Pages

| Address | What it serves |
|---|---|
| `/` | Product showcase |
| `/f/<slug>` | Testimonial collection form |
| `/w/<slug>` | Wall of Love, server-side rendered, `schema.org/Review` markup |
| `/dashboard/<slug>` | Owner dashboard |
