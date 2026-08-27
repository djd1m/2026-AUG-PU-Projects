# Troubleshooting

Every case below is real, taken from the development of this project. They have one thing in
common: the system looks like it is working.

## Every link handed out points at `localhost:3000`

**Symptom.** Registration goes through, pages open, tests are green — but the link to the
collection form, the Wall of Love or the widget snippet points at the visitor's own machine.

**Cause.** `BASE_URL` is not passed to the `web` service in `docker-compose.yml`. The code has a
silent default, so the application starts and complains about nothing.

**Check and fix.**

```bash
bash scripts/check-env-wiring.sh          # shows the variables that never reached the service
# add BASE_URL to the environment of the web service, then:
docker compose up -d --build
bash scripts/check-cjm.sh "$BASE_URL"
```

**Why it was not caught earlier.** The UI check went through the pages one by one and passed
variables via `docker run -e`, bypassing compose — that is, exactly the layer where the defect was.

## The widget does not load on any third-party site

**Symptom.** A CORS error in the browser console. `curl` meanwhile returns `200`.

**Cause.** The `Access-Control-Allow-Origin` header is set **both** by Caddy **and** by the
application. The browser rejects two identical headers.

**Fix.** Keep exactly one place. `curl` is no good for checking this — it does not apply the
browser's policy; check with a headless browser or the Network tab.

## The rate limit can be bypassed

**Symptom.** More than 5 submissions per hour get through from one address if you vary
`X-Forwarded-For`.

**Cause.** The `web` service is published via `ports:`, so Caddy can be bypassed, and "the last
element of `X-Forwarded-For`" becomes the attacker's value.

**Fix.** In `docker-compose.yml`, `web` gets `expose:`, not `ports:`. Check:

```bash
bash ../../scripts/check-port-conflicts.sh .
```

## Tests fail with `ECONNREFUSED`

**Symptom.** Tests that were green yesterday fail en masse on the database connection.

**Cause.** `compose.test.yml` and `docker-compose.yml` live in the same directory, and without an
explicit `name:` Compose gives both stacks the same project name. A running demo environment
silently evicts the test containers.

**Fix.** In `compose.test.yml` — `name: proofwall-test`. Verify with:
`docker compose -f compose.test.yml ps`.

## `docker compose up` fails on an occupied port

**Cause.** The machine is not empty: `80`, `443`, `8080` and others are usually already taken.

**Fix.** Set free values **in `.env`**, not by editing `docker-compose.yml`:

```bash
bash ../../scripts/check-port-conflicts.sh .    # shows all conflicts at once
```

Only the **host** (left-hand) part conflicts. The number inside the container must not be
changed — `depends_on`, healthchecks and internal addresses refer to it.

Relying on "I will see it at startup" is a bad idea: Docker names one port per run, and by that
point part of the stack is already up.

## Video testimonials stay untranscribed

**Symptom.** `transcript_status` never leaves `pending`.

**Causes, by frequency:**

1. **The worker is not running.** `docker compose ps`. A worker that started before the
   migrations were applied crashes; make sure the service has `restart: unless-stopped`.
2. **The queue is picking up text testimonials.** If the query has no
   `video_object_key IS NOT NULL` condition, a text testimonial lands in the queue, it has no
   video, and the job fails instead of moving on to the next video.
3. **`transcribe` is not responding or `OPENAI_API_KEY` is missing.** `docker compose logs transcribe`.

A failed transcription does not break the testimonial: it stays valid and moderatable.

## The Wall of Love does not appear in search

This may be **intended behaviour**: a page with too few testimonials, or with testimonials that
are too short, is deliberately closed off from indexing. Check for `noindex` in the markup and
the number of approved testimonials.

## A photo upload is rejected

The file's **content** is checked, not its extension. Rejected: files that are not JPEG/PNG/WebP,
files larger than 5 MB, and files whose content does not match the declared type. SVG is always
forbidden — it is an XML document capable of executing code on your domain.

## The general rule

The three worst defects of this project had the same shape: **every module is correct, and the
defect lives in the seam between code and configuration.** A green unit test is a statement about
a function, not about the system. That is why, before handover, the checks that run against a
**deployed** environment are executed:

```bash
bash ../../scripts/check-port-conflicts.sh .
bash scripts/check-env-wiring.sh
bash scripts/check-cjm.sh "$BASE_URL"
```
