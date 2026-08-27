# Architecture

## Shape of the system

A distributed monolith in an npm workspaces monorepo. One Compose stack, six
services, one shared database.

```
                    internet
                       │
                   ┌───▼────┐
                   │ caddy  │  the only door, TLS
                   └───┬────┘
                       │ expose
                   ┌───▼────┐        ┌──────────┐
                   │  web   │───────▶│ postgres │
                   │ Next15 │        └────▲─────┘
                   └───┬────┘             │
                       │              ┌───┴────┐      ┌─────────────┐
                   ┌───▼────┐         │ worker │─────▶│ transcribe  │──▶ OpenAI STT
                   │ minio  │◀────────┤ queue  │      │ sole key    │
                   └────────┘         └────────┘      └─────────────┘
```

**Only** Caddy is published to the outside. Everything else uses `expose:`, meaning it is
visible only to its neighbours on the internal network.

## Stack

| Layer | Choice |
|---|---|
| Application | Next.js 15 (App Router), React 19, TypeScript |
| Database | PostgreSQL, **raw SQL, no ORM**, tenant isolation via RLS |
| Storage | MinIO (S3-compatible), separate buckets for video and photos |
| Passwords | argon2id |
| Tests | Vitest against a live Postgres, transaction rollback after every test |
| Deployment | Docker Compose on a VPS, Caddy + Let's Encrypt |

## Tenant isolation — two independent places

**1. The database role.** Dashboard paths run inside a transaction under the
`app_authenticated` role with the account context set. RLS policies filter the rows
themselves — the handler does not have to duplicate the condition in every query, and it
cannot forget to add it.

**2. The handler code.** Anonymous paths (collection form, widget, Wall of Love, webhooks,
worker) run under the `app_service` role, which has `BYPASSRLS`. There RLS protects
**nothing**, and filtering is entirely the code's duty: the handler resolves the slug into a
project identifier itself, and no anonymous route accepts a project identifier from the client.

The split is deliberate: one mechanism covers the "forgot the condition" case, the other the
"there is no session to filter by" case. Neither one covers both.

## Data boundaries

| Data | Where | How it is served |
|---|---|---|
| Video | bucket `testimonial-videos` | Only via a signed link with a limited lifetime |
| Photos | bucket `testimonial-photos` | Through an application route, with the type determined from the content, and `nosniff` |
| Transcript | a separate field, marked as machine-generated | Never written into the testimonial text |
| OpenAI key | only the `transcribe` service | `web` and `worker` never receive it |

Different buckets — because the access modes are different. A single shared policy for both
would one day make the video public too.

## Transcription queue

The worker takes one job at a time:

```sql
SELECT id, video_object_key
  FROM testimonials
 WHERE transcript_status = 'pending'
   AND video_object_key IS NOT NULL
 ORDER BY created_at
 FOR UPDATE SKIP LOCKED
 LIMIT 1
```

`FOR UPDATE SKIP LOCKED` allows several workers to run at once: they will not pick up the same
row. The `video_object_key IS NOT NULL` condition is mandatory — without it, text testimonials,
which have no video, end up in the queue.

A failed transcription moves the status to `failed` instead of breaking the testimonial: the
testimonial stays valid and moderatable without a transcript.

## Trusting headers

Client IP detection takes the **last** element of `X-Forwarded-For`, because Caddy appends it.
Taking the first one means accepting a value supplied by the attacker.

This reasoning holds **exactly as long as `web` is not reachable from the outside directly**.
That is why `web` is declared with `expose:`, and this is not cosmetics but a load-bearing
condition: with `web` published, the rate limit is nullified by changing a header.

The general conclusion, promoted into the repository rules: the guarantee a proxy provides holds
exactly as long as the proxy cannot be bypassed.

## Key decisions

| Decision | Why |
|---|---|
| Raw SQL instead of an ORM | RLS and `SET LOCAL` require control over the transaction and the connection; an ORM hides it |
| A testimonial is accepted without stripping markup | Neutralization happens at render time. Cleaning on input loses the original and does not protect other output contexts |
| Widget in a Shadow DOM | The host site's styles and the widget's styles do not cross in either direction |
| `badge_required` is computed by the server | A single source for the rule; no parameter exists for the client to influence it |
| Idempotency via a unique constraint | An "does it already exist" check before insert does not save you from concurrent deliveries |
| YooKassa instead of a foreign provider | Russian audience; the provider does not sign its notifications, so authenticity is established by the source network and by re-querying the status |

The full wording is in `docs/ADR.md` and `decisions/`.

## Checks as part of the architecture

Some properties of the system cannot be expressed by a type or an ordinary test, so they are
pinned down by scripts and tests that read the source code:

| Check | What it guards |
|---|---|
| `check-port-conflicts.sh` | The database is not published; the proxy cannot be bypassed; ports are free |
| `check-env-wiring.sh` | A variable read by the code actually reaches the service |
| `check-cjm.sh` | The customer path runs end to end on a deployed environment |
| `share-cta-guard.test.ts` | Not a single network call before confirmation — a property of the **code**, not of one run |
| `tariff.test.ts` | The plan rule is not duplicated in any file |
