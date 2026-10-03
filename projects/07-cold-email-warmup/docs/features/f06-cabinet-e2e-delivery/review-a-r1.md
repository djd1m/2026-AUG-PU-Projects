# F06a R1 independent review

Verdict: ACCEPT
R1 status: CLOSED — source acceptance.

Reviewed source: `7827dbca9277e688a6eafbacd4ce1c6496c38226`; bounded diff `b33563d7..HEAD` for `src/web/page.ts`, `tests/auth-script-unit.test.ts`, and relevant `app.ts`/`dom.ts` consumers. A2–A5 previously accepted, unchanged.

Exact trigger: opening `/signin` or `/` with a valid session formerly broadcast login after passive `GET /api/auth/me`, making an existing `/app` tab invalidate, destroy unsaved input and potentially rebroadcast after redirect.

The fix defaults `signedIn(notify=false)` to silent passive redirection. Successful explicit login/register invokes `signedIn(true)` and emits exactly one broadcast. Genuine transition notifications and logout retain invalidation; passive follow-up does not echo.

Seven actual-script VM tests cover passive success, login/register success, failed action/missing identity, and login/logout consumer invalidation, request abort and silent follow-up. Four inspected file hashes match `sol-a-r1-frozen-source.json`. Preserved mutation evidence records original-source RED1/restored GREEN0. Saved unit38/fullPG115 and type/lint/build exits0 were inspected, not rerun.

Actual two-tab and full Docker browser B remain pending, outside A source acceptance. Source-only E2E: `not_applicable`.

Original author delivery failed at600s/124; recovery succeeded at133.844s/0. This review's first attempt timed out at180s without terminal delivery; its provisional receipt remains untouched. This delivery records established conclusions without repeating review.

Profile: compact-quality-first-v2. Prior reviewer Astra high is host-proven. Current actual model/usage/cost: null pending host; resumed cumulative usage must be separated. Delivery elapsed: 53.881s. Telemetry: `../../telemetry/features/20261003T023900Z-f06/astra-a-r1-delivery-receipt.md`.

Status: completed
