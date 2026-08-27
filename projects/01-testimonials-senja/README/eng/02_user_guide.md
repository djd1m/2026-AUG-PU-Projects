# User Guide

Proofwall collects customer testimonials and displays them — on a dedicated page and as a
widget on your own site.

## What you get on sign-up

Registration immediately issues three addresses — they are the product:

| Address | What it is |
|---|---|
| `/f/<slug>` | **Collection form.** You send this link to your customer |
| `/w/<slug>` | **Wall of Love.** A public page with all approved testimonials |
| `/dashboard/<slug>` | **Dashboard.** Moderation, widget settings, plan, affiliate program |

The slug is checked for availability before registration and never changes afterwards — every
issued link refers to it.

## Collecting testimonials

The customer opens `/f/<slug>` and leaves a testimonial **without registering**.

### Text testimonial

Fields: name, role or company (optional), text, photo (optional).

Photo — JPEG, PNG or WebP only, up to 5 MB. The format is determined from the file's
**content**, not from its extension: a file pretending to be an image is rejected. SVG is
forbidden — it is an XML document capable of executing code.

### Video testimonial

Camera recording or file upload, up to 100 MB. After submission the video enters a queue and
is automatically transcribed into text.

The transcript does **not** replace the testimonial: it is stored in a separate field and marked
as machine-generated. The testimonial stays valid and moderatable even if transcription failed.

### Rate limit

**5 submissions per hour** are accepted from one IP address. This is protection against
inflation, not against the user: an ordinary customer does not need that many.

## Moderation

A new testimonial gets the `pending` status and **goes nowhere** until you have approved it.

| Status | Where it is visible |
|---|---|
| `pending` | Only in the dashboard |
| `approved` | On the Wall of Love and in the widget |
| `rejected` | Nowhere |
| `hidden` | Nowhere; unlike `rejected` — unpublished rather than declined |

Every transition is written to a log: who, when, from which status to which. Transitions not
provided for by the scheme are rejected with an explanation.

## Wall of Love

`/w/<slug>` is served by the server as ready-made markup — both people and search crawlers see it.
Every testimonial is marked up per `schema.org/Review`.

There is a **substance threshold**: a page where there are too few testimonials or they are too
short is closed off from indexing (`noindex`). This is a deliberate limitation — an empty Wall of
Love that made it into the index hurts both you and the visitor.

## Widget

The dashboard issues a snippet to embed into your site:

```html
<script src="https://your-domain/widget.js" data-proofwall="your-slug" async></script>
```

The widget:

- is rendered in a **Shadow DOM** — the styles of your site and of the widget do not intersect;
- weighs no more than 30 KB compressed;
- takes its settings from the server, not from attributes — they cannot be substituted from the page.

### Badge on the free plan

On the free plan the widget shows a "Powered by Proofwall" badge. The decision on whether the
badge is required is made by the **server**, based on the project's plan. It cannot be removed
from the page: the widget watches for tampering attempts and restores the badge.

The paid plan removes the badge.

## Plans

| | Free | Paid |
|---|---|---|
| Collection and moderation | yes | yes |
| Wall of Love and widget | yes | yes |
| Powered by badge | mandatory | no |

Payment goes through YooKassa. After the payment is confirmed the project's plan is upgraded
automatically; a repeated notification about the same payment does not fire a second time.

## Affiliate program

The dashboard issues a personal promo code and an affiliate link.

- Commission — **30%** of the payments of referred customers.
- The promo code takes **priority** over the tag from the link: if a customer arrived via one
  link but entered a different code — the code counts.
- You cannot refer yourself, this is checked.
- Mass registrations from one address are cut off.

## Sharing invitation

When the widget appears on a new domain for the first time, you will see a sharing suggestion in
the dashboard. **Nothing is sent until you press confirm** — until that moment the application
does not contact any external services.
