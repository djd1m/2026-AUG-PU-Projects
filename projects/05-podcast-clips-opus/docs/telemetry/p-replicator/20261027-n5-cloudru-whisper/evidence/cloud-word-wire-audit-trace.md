# Cloud.ru Whisper independent wire audit trace

Run: 20261027-n5-cloudru-whisper
Unit: cloud-word-wire-audit
Launch SHA-256 verified: 06e6cdaf7155f66f32af088b75293579128105cf5299972937b7a47439fceab2
Started: 2026-10-27T22:08:00.301363+00:00 (allocation; actual trace creation recorded below)
Profile: bounded read-only wire/schema audit, no inference or private-key access
Requested model: gpt-6.1-sol; effort: high. Actual model: unavailable from child runtime metadata; tokens/cost: null.
Sandbox default exec failed at bwrap before command launch; escalated narrow read succeeded.
Trace created: 2026-10-27T22:09:33.889135+00:00

2026-10-27T22:10:31.938901+00:00 Initial evidence: five valid raw JSON bodies; four verbose bodies byte-identical, words:null; nested segment fields inspected; no nested word objects. Official Cloud YAML/Postman linked by API reference cover models/chat only, not audio. OpenAI bracket-single-word example covered by probe 5. No inference executed.

Run-ID: 20261027-n5-cloudru-whisper
Work-Unit-ID: cloud-word-wire-audit
Source-Revision: 125b655d17e36a5c65754f33471cefe8a4e3eeab
Build-Revision: not_applicable direct provider evidence audit
Launch-SHA256: 06e6cdaf7155f66f32af088b75293579128105cf5299972937b7a47439fceab2
Checks: launch SHA pass; fixture 43245 bytes and SHA pass; five complete JSON parses pass; raw equality pass; nested words absent; parser static inspection completed; primary docs inspected.
Route: read-only audit; no code, runtime, API inference or secrets. Mechanical complexity route not_applicable (no repository diff/input); app E2E preflight not_applicable (no E2E executed).
Report: /tmp/n5-cloud-word-wire-audit-report-20261027.md
Report-SHA256: 2a0a4ea22a0f7369e12bc0944862820e1c5ee0c507374a3962feb227ffe5cf65
Finding: segments positively observed, words not observed; no established missed Cloud HTTP parameter; request bytes unavailable; global unsupported claim not proven.
Next executor: root coordinator; decide vendor clarification versus one optional fresh-fixture exact-standard control. No call executed or new approval granted here.
Profile: model-routing-econom; requested model gpt-6.1-sol/high; actual_model=null (runtime metadata unavailable); tokens=null; cost=null.
Finished-At: 2026-10-27T22:12:52.090424+00:00
Duration-from-allocation-seconds: 291.789
Verdict: pass for bounded audit AC; provider qualification for word timestamps remains unconfirmed
Status: completed
