# Acquisition analytics: алгоритмы

Контракты: [требования](01_specification.md), [план](analytics-plan.md),
[ограничения пилота](deployment-context.md).

### Algorithm: Runtime activation

REQUIREMENT: `FR-acquisition-analytics-1`

INPUT: optional public counter setting. OUTPUT: enabled numeric ID or disabled.
1. Validate positive safe integer without executing config.
2. Pass only normalized ID to client. Missing/invalid means no SDK/provider calls.
3. Initialize only after user consent and allowed static route category.

### Algorithm: Consented safe emission

REQUIREMENT: `FR-acquisition-analytics-2`
REQUIREMENT: `NFR-acquisition-analytics-1`

INPUT: closed goal name and approved pilot attribution. OUTPUT: best-effort goal.
1. Without consent/counter/allowed route return without network or storage writes.
2. Capture only exact approved UTM tuple; ignore arbitrary or mixed fields.
3. Load official SDK asynchronously; manual sanitized hit, then closed goal payload.
4. Bound queue, session and dedupe; drop safely on timeout/failure.
5. On withdrawal or excluded-route transition stop SDK, clear queue/state.
6. Product navigation/download/render continuation never awaits analytics.

### Algorithm: Registration observation

REQUIREMENT: `FR-acquisition-analytics-3`

1. Keep pending flag for this register attempt; do not set it for login.
2. Existing registration response is followed by existing protected continuation.
3. Emit once only when that continuation succeeds, including explicit discard.
4. On dummy cookie/401/failure do not emit. Preserve anti-enumeration unchanged.

### Algorithm: Ready observation

REQUIREMENT: `FR-acquisition-analytics-4`

1. Observe initial and polled authenticated clips.
2. If a clip is done and available, emit once within bounded browser pilot scope.
3. Never infer success from upload, progress counter, click or unavailable output.

### Algorithm: Confirmed payment observation

REQUIREMENT: `FR-acquisition-analytics-5`

1. Observe existing authenticated checkout status response.
2. Require same requested intent_id and known status=succeeded.
3. Bounded local dedupe may use intent_id; provider payload must omit it.
4. Emit without modifying payment state or interpreting redirect as payment.
5. Ledger remains financial truth; missing return/consent can undercount browser goals.
