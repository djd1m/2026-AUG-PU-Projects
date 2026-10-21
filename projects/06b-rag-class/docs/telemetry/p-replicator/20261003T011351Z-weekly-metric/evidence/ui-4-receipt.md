Run-ID: 20261003T011351Z-weekly-metric
Work-Unit-ID: weekly-metric-ui
Attempt-ID: ui-4
Source-Revision: dbd68a6862e17bb1a01e7659d0d3686b8cd4cf05
Build-Revision: sha256:7779a9cbce2394b93ddf162714277ec3311fb3e55fd85ae1ab9129232e03c015
Launch-SHA256: 826e99620dbaed6db2327f54c16e3ad01299d6ee85ead1d2980c87758bede1f2
Finished-At: 2026-10-03T02:08:52.350219+00:00
Verdict: pass

Actual production Docker browser 1440/390, six screenshots: real viewer/operator login, anonymous and ordinary account 404, operator dashboard 200/no-store, seeded expected counts, foreign Origin 403, real verify POST 202 and metrics refresh, no overflow or JavaScript errors. UI1/2 stopped after hanging waiter; UI3 identified Playwright response.json timeout despite separate real HTTPS complete JSON. Failed artifacts preserved. Accepted UI4 asserts real HTTP202, visible status and persisted DB outcome without reading response body through Playwright; production code/images unchanged. Exact browser internals not claimed. Positive verified counts are seeded disposable DB fixtures, not live external-page acceptance. Pending source-verify.test remains unverified after actual callback; lease released. No response mocks, paid calls or transport bypass. Own stack/network/contexts/private environment removed, shared browser retained.

Status: completed
