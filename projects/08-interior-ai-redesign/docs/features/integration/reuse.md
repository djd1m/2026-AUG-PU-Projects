# Integration reuse — local first then primary GitHub

Fresh local scan01–07 including03a/05a finds N6 worker index/watchdog-steps and N5 watchdog diagnostics; N1/N3a subprocess/shutdown patterns; earlier CJM Playwright standalone harness. Read N6 apps/worker/src/{index,watchdog-steps}.ts: retain non-overlap and independent-step error isolation, heartbeat+signal cleanup, reject donor BullMQ/Redis/RAG/embedprobe. N8 PG queue/AI spending supplied featuredesign; coordinator owns only operations binding.

Then primary GitHub nodejs/node process/child_process API + microsoft/playwright docs/package inspected2026-10-13. PinPlaywright1.60.0 (Apache2.0), actual browserengine already installedin /tmp/n8-check-tools; project testdepwillbeaddedforportable runner. Workercontrol needs no new library: existing N6 pattern with native bounded loop sufficient. No claims that independentsteps success implies everybusinessjob succeeds; readiness and heartbeat semantics tested.

Sources https://github.com/nodejs/node/blob/main/doc/api/process.md and https://github.com/microsoft/playwright/blob/main/docs/src/api/class-pageassertions.md. Frozen exactdonor hashes appended beforecodebinding; initialDocker/schema scaffold provenance livesfoundationreuse.

Production build concrete finding: .js imports in TS workspace failed resolution. Fresh local01–07 config search selected N1 next.config.mjs extensionAlias (.js→.ts/.tsx/.js), SHA08bc74d791f16101c2e81d9943a0fa2942639fbb180a8c7981247701a311b469. Then primary vercel/next.js webpack-config.ts and issue84388 reviewed; workspace externalization alone maynot externalize local source, so built-server parser typederrors must be proven. Adapt N1 alias only, no inventedloader. Initial buildfailure retained as evidence; nextbuild runningafteralias.

Worker binding donor hashes measured 2026-10-13T23:48:44.876401+00:00:
- `projects/06-rag-sales-chatbase/apps/worker/src/index.ts` sha256:cd8cc3a76b6c8defcd7a1aef201656e4d61e5c2b13776c780dd4022cec000979
- `projects/06-rag-sales-chatbase/apps/worker/src/watchdog-steps.ts` sha256:087e527d1001c63ed9fdf0b271a1f4fdb2e5c80eebae6940f04c1d9dce510675
