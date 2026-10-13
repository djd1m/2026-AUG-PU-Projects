Run-ID: 20261002T202425Z-rag-answer-sandbox
Work-Unit-ID: rag-answer-sandbox-ui
Attempt-ID: ui-2
Source-Revision: 715a3edfccd3e8db4d5f25692617392ed98e2052
Build-Revision: sha256:16141faf089c07dfd0603c0a4de24937060c9a8a3b9f9b030035369635d51818
Launch-SHA256: 58fbeef9cb433be0a9563f2be49414d8b367c0c0df01a59b586551cca5124a54
Finished-At: 2026-10-02T21:24:56.092Z
Verdict: pass

Actual Playwright Docker run:1440/390, site andPDF citations, unknown/no-contact exact canonical text, provider503 then recovery, boundedinput/pendingdisabled, futureCTA disabled/explained, registration, no overflow orJavaScript errors. Eight screenshots; coordinator visually inspected site390 andPDF1440. Real productionUI/registration/Postgres; only seeded ask endpoints use test binding to real handler/gateway with deterministicFakeProvider and test authentication. Authentication/tenant gates separately covered in21new realPG tests. No externalprovider/calibration/publicdeployment claim. Firstfailed UI assertion incorrectly expected contact-present phrase, preserved ui-attempt1-output and originalscript; product bytes unchanged. Ownbridge/web/db/proxy/migrate/network removed; browserretained, privateenv/fixturedeleted.

Status: completed
