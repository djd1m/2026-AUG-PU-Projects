# V4 requirements interpretation: fully empty final
Spec revision: sha256:e1afae2ceaddef35d421700ad75b7e256f407e40bebeea0782b997d10690c16e
Source-Revision: 0e37bcb99653bf347950f1f4d04a73c83a9db610
Started-At: 2026-10-27T22:57:14+00:00
Finished-At: 2026-10-27T22:58:08.722868+00:00
Output-Prelaunch-Absent: true (checked before creation)
Verdict: Aggregate nonempty requirement; narrowly skipping a fully well-formed empty final is consistent with v4

**FR-2 naturally states an aggregate TranscriptResult requirement, not a requirement that every final contain speech. A specification rewrite is not essential before accepting this narrow interpretation. Record this interpretation and verify its exact boundaries in implementation checks and independent review.**

## Basis in current frozen planner text

Only the same six immutable planner files were read. No code, coder context, execution receipt, probe log, private environment or network was accessed. No existing source or report was changed; this is the only output.

- `01_specification.md:40` places “Require nonempty actual words and usable actual segment text” after mapping finals into N5 words/segments and before unchanged parseTranscript at adapter/worker/persistence. Its natural subject is the assembled transcript.
- `02_pseudocode.md:40–41` first orders retained finals and copies actual word/phrase data, then requires “actual nonempty words and at least one usable actual text segment”. “At least one” is explicit aggregate context.
- AC-2 (`01_specification.md:45`) rejects missing words/times, malformed structures and empty context. A present empty words array together with empty phrase text is distinguishable from missing fields, malformed data, or an aggregate transcript with no usable context.
- `04_refinement.md:15–16` abbreviates negative inputs as “Missing/empty words” and “Empty phrase text”. Read alone, that matrix can suggest a per-final rejection. Its enforcement refers to the unchanged strict parser, and line 28 names “no-final/wordless/textless output”; read with FR-2 and the algorithm, these are naturally whole-output negative cases. It does not expressly establish a stronger every-final-must-contain-speech rule.

There is therefore shorthand ambiguity in the refinement matrix, but no necessary contradiction of aggregate acceptance. Making its scope explicit is useful documentation clarification; it is not a reason to fabricate timestamps, relax malformed-output checks or demand a new provider capability.

## Narrow allowed interpretation

A final with present words `[]`, actual phrase text `''` (or only blank text), and otherwise well-formed required identity/timing/language structure can contribute no transcript words or segments. Preserve the existing mono channel, nonnegative final-index, exact-safe millisecond and duplicate/conflict checks before treating it as empty. Do not discard a malformed envelope or conflict merely because its text is empty. Do not synthesize word times or use the empty final's phrase interval to populate the transcript.

The assembled successful RPC result must still contain actual nonempty timed words and at least one usable actual timed text segment. All-empty/no-speech results remain rejected under AC-2. Missing/malformed word fields, malformed or unsafe timing, conflicting duplicates and incorrect channels still fail. A final with nonblank text but no words is outside this narrow silence case and remains rejected; it cannot sneak un-timed recognized content into segment context alongside other valid finals. Existing terminal-status/deadline/cancellation and financial/fence conditions remain unchanged.

The silence classification here is operational empty content, not a new semantic claim that the provider accurately detected real silence.

## Supplied current probe context and limits

Root supplied a new real approximately 200-second Yandex FULL_DATA observation: gRPC status 0, 22 finals, 83 actual words; some finals are fully empty. The example is channel 0 / final index 21 with `words: []`, `text: ''`, `start_time_ms: '184160'`, `end_time_ms: '199800'`. On the stated assumption that its complete envelope is otherwise well formed, its empty content can be omitted while other actual words/segments supply the aggregate transcript. Its identity still participates in validation and conflicting-duplicate detection.

This observation was provided in the task, not independently read or verified by this validator. No new test/runtime result, complete envelope validation, natural-speech quality or full-journey pass is claimed. Probe receipt/source/request hashes were not supplied to this interpretation unit and are not invented. Root owns binding the actual probe to implementation acceptance.

## Acceptance recommendation

Use this source-bound interpretation as the explicit clarification for the narrow empty-final case. Require actual checks distinguishing mixed valid-plus-empty finals, all-empty output, nonblank text without words, malformed empty-looking finals and duplicate/conflict behavior. These are required cases, not claimed existing or passing tests. A short refinement note would improve readability; editing the specification would require its normal hash/report rebinding, but the aggregate contract does not require such an edit to admit this case.

Requested model/effort: existing gpt-6.1-sol/high; actual model/effort: null (host execution metadata unavailable); tokens/cost: null. Measured elapsed since first clock: 54.723 seconds. Root retains the next decision and continuation ownership.

Status: completed
