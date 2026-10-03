# F07-V01 narrow independent closure

Verdict: ACCEPT/CLOSED
Date: 2026-10-03
Source: 8ce5b84d53618a807b8177179a9820b05445e812
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-v01-review
Attempt-ID: replicate-v01-review-1
Requested model/effort: gpt-6-astra/high. Actual model/effort: unavailable in this worker; no host attestation supplied.

The corrected mandatory mutation paragraph in `05_completion.md:31` satisfies the minimal direct-guard alternative in F07-V01. The accepted first POST and lost response leave the same durable submission submitting/ambiguous. Invoking the actual send function again with the same stored attempt and identity cannot win the original preflight→submitting CAS (`02_pseudocode.md`, Durable one-shot submission, steps 1–2); baseline transport count therefore remains one. The disposable mutant explicitly changes that authorization guard to authorize the second invocation for the same row, with only a concrete redundant reachability precondition bypass permitted. This can reach the same transport send path a second time without inventing a new attempt or identity. Count two necessarily fails the unchanged exactly-one-POST assertion. A syntax/startup failure or ticket-only failure is expressly insufficient.

The paragraph requires exact mutated lines, baseline GREEN, intended assertion RED, restored-source digest and restored GREEN. Expired-lease/two-reclaimer recovery remains a separate ordinary regression requiring POST=1, release≤1 and unchanged ticket; removing only recovery's branch is explicitly insufficient. This removes the original counterexample to the required mutation recipe without changing production semantics.

Scope is only F07-V01. Previous score 95/100, nonzero Testable/Completeness/Traceability floors, exact AC/scenario table, BDD supplement and specification SHA256 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad remain unchanged. The initial report is preserved byte-for-byte as `validation-report-initial.md`; its historical finding and rationale remain in the current report.

This is design-contract revalidation, not execution of a product mutant, implementation acceptance or a real-pilot pass. Current report-gate results and exact bytes/hashes are recorded in `../../telemetry/n8-20261002-1740/replicate-v01-review-1-evidence/report-gate.json` and the terminal receipt. No paid calls.
