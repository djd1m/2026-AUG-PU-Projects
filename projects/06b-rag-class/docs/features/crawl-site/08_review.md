# Independent crawl-site review

Verdict: REQUEST_CHANGES

RUN_ID: 20261002T172816Z-crawl-site
WORK_UNIT_ID: crawl-site-independent-review
Attempt-ID: review-1
Source-Revision: e8e0b4ac7a61e473835ac75d4463b22281f65062
Build-Revision: sha256:67aea50fcd6b59208efda8c2c69eea47b3d66bdfed741930233d49867d5ccbe7
Launch-SHA256: e087fb3bfb6517df2ca3c12d2c8737ef683021360240262c0b933beeaecf34f3

## Independent obligations

Derived before reading the author plan/completion from Specification FR-n6b-2, SC-US-002-1/2/3, Pseudocode Create source / Crawl site / Worker lease loop, Architecture Security, Refinement edge matrix and ADR-013:

- Origin/session/RLS before writes; atomic bot/source/job; 202 and job_id before crawling.
- All DNS answers public, including IPv6; socket pinned to checked IP, retaining original Host/TLS identity; repeat validation on redirects; no private/rebinding escape.
- Same host including www, RFC robots (4xx allow, 5xx/network deny with specific owner-visible failure), sitemap before root/links, all normalized URLs requested once, Free cap 100 including redirects, one-second pauses, 15-second deadline and 2 MiB body limit.
- Block-separated text without navigation boilerplate, full same-host link discovery including unchanged pages, idempotent documents and embedding cache.
- Running-state and fence checked under transaction lock for writes; stale/closed workers cannot write; checkpoints retain job ceiling.

## Findings

### R1 — High: untrusted robots wildcard matching can stop the whole worker

Location: `services/worker/src/crawl/robots.ts:42` and `:44`.

Every `*` becomes a greedy `.*` in a synchronous JavaScript regex. A tiny robots rule `Disallow: /` + `'*a'.repeat(25)` + `'b$'`, matched against `https://fixture.test/` + `'a'.repeat(100)`, triggers catastrophic backtracking. This is reachable through a public site controlled by an authenticated tenant. The event loop cannot process the 15-second AbortSignal, lease heartbeat or other jobs while matching. Limits on downloaded bytes do not bound this CPU work.

Independent probe on the exact immutable runner image, `--network none --cpus 1 --memory 256m --rm`, ran the real exported `parseRobots` through Node 22/tsx. An external `timeout 5s` killed it: exit **124**, after printing the inputs and without returning the matching result. No network or database was used. Image robots source SHA256 was separately verified as `3010a0563c7d02a0f7269fa45c0d141caa58768aa4b6f0a84f8f39d9d358f84d`, matching the reviewed snapshot.

Reproduce inside the image:

```js
import { parseRobots } from './services/worker/src/crawl/robots.ts';
const rule = '/' + '*a'.repeat(25) + 'b$';
parseRobots('User-agent: *\nDisallow: ' + rule)(
  'https://fixture.test/' + 'a'.repeat(100));
```

Required correction: bounded wildcard matching rather than an exponentially backtracking regex. Add an adversarial match under an external deadline and a successful benign match; verify heartbeat/ceiling is not defeated by synchronous matching. This enforces the bounded-job and shared-resource obligations.

### R2 — Medium: one oversized or blocked page aborts the whole crawl

Location: `services/worker/src/crawl/site.ts:78` (uncaught `get`) and `:39–56`.

Refinement explicitly says an HTML body of 2 MiB + 1 is skipped. Pseudocode step 3b skips a private target; SC-US-002-3 says a private redirect stops the page download. Here an oversized-body error, UnsafeSite or rejected page redirect propagates out of the entire extractor. Thus one bad sitemap entry prevents later valid pages from being indexed, even on retry.

Independent runtime probe injected the documented SiteFetch port: robots 404, sitemap containing `/oversize`, `/oversize` throws the same body-limit error as safe-http, root would return valid HTML. Actual output:

```text
oversized_result=Превышен предел тела страницы requests=["/robots.txt","/sitemap.xml","/oversize"]
```

The root was never requested. The probe exited 0 after observing the rejection. Required correction: handle page-local size/security/redirect failures at the traversal boundary and continue; preserve hard failures for robots and propagate lease loss, cancellation and job ceiling. Test an oversized/bad page followed by good HTML, plus lost-lease propagation. The existing redirect tests currently encode whole-job rejection and need an additional multi-page oracle from the specification.

### R3 — Medium: navigation/footer links are removed before discovery

Location: `services/worker/src/crawl/html.ts:19–20`.

Removing boilerplate from indexed text is correct, but it also removes its anchors before collecting the crawl queue. Sites without sitemap entries and with their pricing/contact links only in nav/footer are silently marked successfully crawled after their homepage. Pseudocode 3e excludes boilerplate from text; 3f separately requires same-host links from the response.

Independent real `extractHtml` probe:

```html
<nav><a href="/pricing">Prices</a></nav><p>Home</p><footer><a href="/contact">Contact</a></footer>
```

Actual result: `{"text":"Home","title":"fixture.test","links":[]}`. Expected links include both same-host destinations while text remains `Home`. Required correction: discover eligible navigation links before removing text boilerplate; add a navigation-only discovery test and a no-sitemap crawl case.

### R4 — Medium: the required robots failure reason is lost at the production worker seam

Location: `services/worker/src/crawl/site.ts:64–66`, `:104`; `services/worker/src/index-runner.ts:34`; `services/worker/src/loop.ts:61–65`.

The crawler throws `ROBOTS_FAILED`, but `createSiteExtractor` does not turn known crawl errors into a failed JobOutcome. `createIndexRunner` calls the extractor outside its error mapper. `runOnce` then replaces the error with generic `TEXT_INTERNAL`. Therefore a robots 503 produces `failed` with “Сбой обработки источника…” instead of the explicit robots/RFC reason required by SC-US-002-2. The empty-HTML explanation is lost the same way. Existing tests check rejection of crawlSite directly, not the persisted worker outcome.

This finding is a deterministic source trace, not a claimed database/E2E run. Required correction: map known safe crawl failure types to owner-visible outcomes at the extractor seam, keeping arbitrary internal exceptions generic and lease/ceiling semantics intact. Verify a real worker run through persisted index_job and job API for robots 503 and empty HTML.

## Checks and evidence assessment

- Independently compared all **20/20** production/test file hashes against `tests/artifacts/crawl-site/tested-source-final.json`: match. Launch digest matched the caller-provided digest. Old `build-identity.txt` / `source-hashes.json` are not used as final provenance.
- Read final regression evidence: `full-run-final.txt` records typecheck, **319 unit tests**, **159 integration tests**, build, and `coordinator-final-regression exit=0`. These are prior coordinator-run results, not repeated here. They do not cover R1–R4.
- Inspected mutation code and assertions: SSRF mutation removes `addresses.some` rejection; expected 4 failures include actual validation/UnsafeSite failures, restored 39 passes. The later `closed-stale-proof.txt` separately exercises both stale fence and closed state: removing the checked rowCount causes two assertion failures, restoration two passes. This is meaningful expected-red evidence, not a tool error.
- SSRF implementation denies private/reserved IPv4 and non-global IPv6, rejects mixed answers, pins lookup in a per-request undici Agent and leaves original URL as origin. Undici default connector retains TLS hostname; explicit live HTTPS/SNI/rebinding integration coverage is not present. No SSRF bypass was confirmed in this review. Redirect targets are revalidated at fetch and constrained by same-host/robots.
- Request and seen sets cap/deduplicate page and redirect requests. Tests cover 100-page cap, content-type, cycle handling, unchanged-page rediscovery and embedding reuse. Body and deadline transport tests use a real local HTTP connector.
- Document upsert takes a shared lock on matching running job/fence inside withService transaction. Stale/closed assertions and concurrent new/old-fence test are relevant. Production checkpoint/signal checks remain around I/O; the synchronous R1 problem defeats timely checks.
- Bot/source/job transaction, RLS ownership and foreign-bot-before-DNS checks are coherent; transaction rollback is tested. UI helper/build coverage is not runtime acceptance.
- **Actual application UI E2E remains pending with integration owner**, deferred until corrected source is frozen. No UI acceptance or complete feature delivery is claimed.

## Probe limits and execution record

Only read-only source review and the two allocated Markdown outputs. No product edits, donor N6 access, commits, external ports, secrets, global settings or children. Docker probes were disposable, network-none, one CPU and 256/512 MiB; all `--rm` runs exited. Port-conflict script ran before container probes; it could not resolve compose due to absent required environment, while port 3106 was reported free. Probes published no ports and started no compose services.

Two preparation failures are retained honestly: direct TS module imports initially failed because the test image has no built workspace dist (exit 1); a follow-up failed trying to read the final manifest absent from that image (exit 1). The successful follow-up built db/rag inside the disposable container, printed actual hashes for robots/html/site (all matched reviewed snapshot), and ran navigation/body-error probes (exit 0). No successful full suite was repeated.

Requested reviewer: `gpt-6-astra`, effort `medium`; owner-approved fallback from unavailable Anthropic account. Exact actual model/provider, actual effort, tokens and cost are **null/unavailable**: this host exposes no authoritative attempt usage/model metadata. Requested model is not evidence of actual model or vendor independence. Budget: 720 seconds from launch; no budget extension.

Started-At: 2026-10-02T18:16:17.763642+00:00
Finished-At: 2026-10-02T18:23:40.165201+00:00
Elapsed-Wall-Seconds: 442.402

Status: completed
