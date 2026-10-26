# Independent sandbox correction review
Reviewer family: codex
Spec revision: sha256:8ef3b9cf796a21492aee67ec622bfbcbbcff9627a7fdba42fb0e06ab658b975d

Frozen candidate: `bb6c4c20263240e465ea9ff1df34874750ca7f55`, confirmed by HEAD; integration project `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus`. Reviewed source/test correction `5172578f..bb6c4c20` and the planner's privacy clarification in deployment-context.md and 03_architecture.md. Coder chats, receipts, logs and browser helper were not read. No code edits, new delegation, stand launch, deployment or paid action; only this report was written. Actual model/effort/usage/cost: null, verifiable launch metadata unavailable.

Verdict: REQUEST CHANGES for one concrete remaining sandbox boundary issue, S1 below. The closed message bridge, lifecycle and failure isolation pass source inspection. No actual SDK transport/privacy PASS is asserted: coordinator owns the corrected production-build browser run. The reported automatic form:// leak is the reason for this bounded iframe isolation correction; it was not independently reproduced by this reviewer. Real owner-counter receipt remains planned for Cloud.ru РФ.

## S1 — high: srcdoc still exposes the parent document base URL

File: `apps/web/src/lib/acquisition-analytics.ts:165`.

The generated srcdoc starts with meta referrer/title/script but does not set a static base href. Opaque sandbox origin prevents reading the parent DOM and parent.location; it does not independently remove the srcdoc document's inherited fallback base URL. The iframe's own document.baseURI can therefore expose the initiating application's URL, including sensitive path/query, contrary to the clarified requirement that the SDK receives no application URL.

This follows the primary HTML specification: an about:srcdoc document's fallback base URL uses its about base URL, and that value snapshots the initiator document's base URL; an explicit base href takes precedence. See [Document base URLs](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#document-base-urls) and [session history/document state](https://html.spec.whatwg.org/multipage/browsing-the-web.html). This is a source/standards boundary finding, not a claim that the currently cached SDK has actually transmitted baseURI. A bounded search of the supplied cached SDK found no literal baseURI read; that does not establish the intended no-parent-data isolation boundary.

Minimal fix: place an application-independent static base href, such as https://clipmkr.ru/analytics/, before the SDK script in srcdoc. In the coordinator's already-planned browser probe, verify iframe document.baseURI, document.referrer and location using a parent URL containing sentinel path/query/hash. The frame should expose only static/about values; continue inspecting actual SDK requests. No new endpoint, service or engine is required.

## Source inspection that passed

- `sandbox` is exactly allow-scripts; allow-same-origin, form submission, top navigation and popup permissions are not granted. Frame is hidden, unfocusable and empty of product content. Script/referrer meta policies are no-referrer. No app URL or user content is intentionally interpolated into srcdoc; S1 is the implicit inheritance exception.
- Parent readiness handling requires active lifecycle, one initialization, exact frame.contentWindow source, fixed ready message type, random token and matching monotonic generation. Child accepts calls only from parent with fixed type/token/generation and valid schema. Wildcard targetOrigin is appropriate for opaque origin when coupled with these source/token checks. Counter is fixed on first valid init and mismatched counters are rejected in child.
- `validSdkCall` is self-contained and used on both message boundaries. Only positive safe numeric counter IDs and exact init/hit/four-goal/destruct command shapes pass. Init enforces collection-disable flags, disableYtm, fixed sanitized URL/referrer. Hit and goal payloads allow only fixed schema/pilot/static-route/event and either no UTM or the complete exact approved tuple. Email/content/intent/account/video identifiers and arbitrary methods/goals are not in the bridge schema.
- Queue remains bounded to 20 in adapter and initial SDK stub; readiness timeout remains 8 seconds. Dispose marks inactive, clears timeout, removes parent listener and frame. Removed frame destroys its SDK context even if the asynchronous destruct message is not delivered before removal. Late/stale readiness is rejected, and adapter generation guards remain intact.
- Withdrawal/excluded route cleanup remains bound to the existing host/adapter lifecycle. Withdrawal clears browser state; excluded navigation preserves previously consented bounded dedupe/first-touch. No new backend/API/DB/provider payment mutation appears in the correction.
- SDK load/configuration errors remain in optional best-effort paths; product operations do not await analytics. Invalid commands are dropped and no analytics product spinner is introduced. Actual browser execution is still required to establish failure and lifecycle behavior on the final built artifact.

## Checks actually performed

Read exact git diff and numbered adapter lines; inspected the approved privacy clarification. Performed a narrow cached-SDK search for baseURI/document.URL/ancestorOrigins/parent-location and disableYtm; only the disableYtm option literal was found among these searched strings. This bounded search is not a whole-SDK proof.

Transpiled the candidate adapter in memory with installed TypeScript and ran a synthetic SDK fixture. A standalone function reconstructed from validSdkCall.toString accepted all six legitimate captured init/hit/signup/ready/payment/destruct calls, rejected arbitrary form:// goal, userParams, raw URL and extra email payload, and captured no sentinel query/resource/intent data. No source/test/probe file was written. This proves local argument/schema behavior, not production-minifier closure behavior or real SDK requests; the coordinator's actual-built browser run remains necessary.

Planner clarification hashes inspected:

| File | SHA-256 |
|---|---|
| docs/features/acquisition-analytics/deployment-context.md | b5acf1f5226aecdd469ccbbe546d87a67fb6bdf933b90fb6c74d1468cf6942e4 |
| docs/features/acquisition-analytics/03_architecture.md | ead7725b29820b6ceae9793be4379fc193a3995c74a8cf2137de335061f0f1fb |

No full test/build/lint/typecheck, mutation suite, product E2E, actual SDK network or authenticated dashboard check is certified by this report. Keep analytics default off and final acceptance pending until S1 and the mandatory actual-browser privacy evidence are resolved. No additional feature or optional polish is requested.

Status: completed
