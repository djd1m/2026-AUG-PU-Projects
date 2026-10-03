# N8 browser attempt 2 — failed preflight orchestration

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-e2e-2
Source: 63c198119969693a65ccc380416f16c2aee222f3
Build: 22c0f81bf478890755ca641a2881d2135b268796219697bad659f8541238dd2e
Launch-SHA256: ea726b35e5f8e944a6d3bd0be1202f9223512af72ec5d5c09417109c8d3f554e

Infrastructure/image/source binding passed; fresh Astra fixture correction accepted. Companion validator first rejected relative --root, then rejected a non-null reconciliation with no source drift. Coordinator shell incorrectly continued to browser despite the second exit1. Browser started02:14:40.402889Z, was deliberately terminated02:15:08.424846Z (exit143,28022ms). No product/browser acceptance is claimed. Own stack/network removed exit0; UI mutex released02:15:17.995338Z. No production/payment source changed, no live service/charge/GPU action.

Next attempt uses separate validator call checked before any execution, null reconciliation for matching revisions, unique trace and fresh owned DB. This is a coordinator command-sequencing error, not a product test failure. Usage/cost/model attribution unavailable null.

Status: failed
