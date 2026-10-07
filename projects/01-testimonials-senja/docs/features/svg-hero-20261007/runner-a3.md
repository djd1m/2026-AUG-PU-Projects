# Focused browser runner correction

Run-ID: 20261007-svg-hero-01
Work-Unit-ID: 01-runner-a3
Attempt-ID: 01-runner-a3
Source-Revision: heroSHA25699a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497
Build-Revision: null
Launch-SHA256: effdf7e94392968d66da0fe841429d3a8fbd22cb52c08adf4970849fa8128f6b
Finished-At: 2026-10-07T21:30:36.634564+00:00
Verdict: PASS for harness-only correction and syntax check; focused browser run remains coordinator-owned.

Read browser-a2/report.json: all4 native RAWIMG forced-reduce cases pass; eight direct cases failed at page.addStyleTag because standalone SVG has no HTML head, after first/second samples had been captured. Corrected only temporary browser-check.cjs; no project SVG/README edits.

The fallback font style now uses page.evaluate + document.createElementNS('http://www.w3.org/2000/svg','style'), appending to SVG document.documentElement. Existing direct checks then measure fallback. Optional fourth CLI argument direct-only selects exactly8 direct cases (light/dark ×360/900 ×normal/reduce), bypasses all IMG/native captures, and binds scope direct8-only with source/runner SHA in report. It requires every one of8 cases pass without diagnostic exemptions. Full default matrix remains available, but coordinator is authorized to run only focused8 retake; previous a2 normal IMG/native evidence remains bound to unchanged product SHA.

Generic palette correction: IMG path probes actual computed fill of .marker on a same-context SVG page per theme, parses RGB/RGBA channels, then uses those channels for screenshot-minus-hidden-markers-baseline centroid extraction. No hardcoded Proofwall palette remains. Unsupported fill raises an explicit failure. No dependencies added.

Checks: node --check /tmp/projects-svg-hero-swarm-20261007/browser-check.cjs exit0. Product SHA unchanged assertion exit0:99a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497. Runner SHA256:0f02f63020178a7568e9677cd9488c88c5daaf8b468d5f6e0adb27c01ba5fe24. No browser executed by author; shared browser never closed/restarted. E2E preflight not_applicable for syntax-only author stage.

Profile:model-routing-econom; requested gpt-6.1-sol medium; actual model/effort null (host metadata unavailable); tokens/cost null. Elapsed wall:73.7seconds; active null. ROUTE:S bounded harness repair. No install/publish/push/PR/commit/other projects. Next actor:coordinator copies updated runner and runs fourth-arg direct-only against unchanged SVG under existing browser lock/preflight.

Status: completed
