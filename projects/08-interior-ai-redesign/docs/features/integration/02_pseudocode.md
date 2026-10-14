# integration — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: EnforceBounds
REQUIREMENT: `NFR-integration-1`
REQUIREMENT: `AC-integration-1`
REQUIREMENT: `AC-integration-2`
REALISES: SC-US-024-1, SC-US-024-2
INPUT: query/command limits, account/project usage. OUTPUT: bounded operation or LIMIT_REACHED.
1. Cap page size at 50 and use stable (created_at,id) cursor; no offset scan/unbounded includes. For writes lock controlling account/project before quota count/update.
2. Enforce configured object/reference/revision/line counts and request/decode deadlines; terminate parse worker on deadline. Reject at boundary before expensive work.
3. Record API latency without upload/hash/provider spans, run 10-client fixture and 200-line benchmark; publish measured numbers or failure, not target-as-observation.
COMPLEXITY: O(page size), indexed counts/conditional insert.



### Algorithm: BootOperational
REQUIREMENT: `NFR-integration-2`
REQUIREMENT: `AC-integration-3`
REQUIREMENT: `AC-integration-4`
REALISES: SC-US-017-1, SC-US-017-2
INPUT: config, DB schema version, private storage root. OUTPUT: ready or startup refusal.
1. Parse strict modes/default off, secrets/caps/merchant requirements; forbid fake outside tests; unknown enum/blank enabling config→refuse.
2. Check migrations, DB connectivity and private writable storage without network provider calls. Health exposes only up/ready and redacted error code; worker must pass same capability config gate.
3. Local orchestrator checks port conflicts before compose; verify database has no published port, isolate volumes/network/name. On restart use DB state/fences for jobs and stored assets; no automatic paid replay.
COMPLEXITY: O(1) probes.


