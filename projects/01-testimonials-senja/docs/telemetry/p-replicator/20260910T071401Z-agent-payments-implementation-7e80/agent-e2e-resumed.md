# Agent browser and transport acceptance — resumed terminal receipt

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: agent-e2e
Commit: 36e35de969b21de36d1a64df1153116cb4a1a414
Owned scope: projects/01-testimonials-senja/tests/agent-payments-e2e/** only
Isolated checkout: /tmp/agent-payments-core-7e80

Policy/profile: compact-quality-first-v2
Requested model/effort: gpt-6-astra / high
Actual serving model/effort, usage, cost: null (not exposed)
Initial start: 2026-09-10T08:46:21Z
Resumed: 2026-09-10T09:25:53Z
Finished evidence: 2026-09-10T09:28:15.535799Z
Wall elapsed: 2514535 ms; resumed wall: 142535 ms
Wall time includes preparation, approvals, build wait, usage-limit interruption and retries; active compute unknown.

Acceptance: 2026-09-10T09:26:57.967Z to 2026-09-10T09:27:21.186Z, 23219 ms
Result: 11/11 integrated scenarios PASS; exactly 2 local TEST PSP fixture create calls
Additional: all 8 JavaScript modules node --check PASS; text files <500 lines; git diff --check PASS; structured evidence grant-token scan PASS.

Runtime revision: b2343b00208195b3365380146cecdd417f32c6a8
Source HEAD at run: 30b909c8a54079ad13ac3cd1f94e8fa2ee975bfe (subsequent docs/dockerignore only)
Next BUILD_ID: T72HtODyBT3GucyLfM4Wh
Actual compiled Next app mounted read-only; actual MCP SDK Streamable HTTP and actual A2A gateway -> actual P1 commands -> existing isolated PostgreSQL.

Verified scenarios:
- actual MCP SDK discovery and persisted buyer pairing
- actual browser signup and login with secure human session
- actual Resend HTTP fixture and explicit browser email verification
- explicit browser grant consent; polling never exposes bearer
- MCP and A2A share persisted order; grant alone never charges
- actual hosted TEST fixture payment settles tariff once and saves private method
- verified webhook replay and execute replay create no additional payment
- independent human limited mandate enables one saved-method renewal
- A2A recovery after real gateway restart preserves settled order
- valid foreign-resource grant cannot read another resource order
- browser grant revocation is enforced through actual A2A backend

Limitations and operational evidence:
- Local YooKassa and Resend HTTPS fixtures, not actual YooKassa TEST acceptance
- Native Proofwall only; no single agent-to-N3 browser attribution chain
- Synthetic first budget reservation moved to prior month and synthetic tariff expiry to final two days
- Login requires reopening original pairing link after dashboard return
- Synthetic owned database records retained in dedicated test database for inspection
- Prior harness failures preserved: snap default profile root, login query-string next expectation, selector quoting. No application code changed to make acceptance pass.
- Private Firefox session and proxy used dynamically allocated loopback ports. Own application container stopped; dedicated database retained with no published ports. No production deployment, real provider account or real payment touched.
- Successful private runtime artifacts: /tmp/ap-e2e-NzpmHO (synthetic secrets/logs; not committed).
- Browser screenshots are local ignored files under the owned evidence directory; screenshots.json binds their hashes. Purchase-consent screenshot visually inspected.

Artifact hashes (SHA-256):
- projects/01-testimonials-senja/tests/agent-payments-e2e/README.md: 15cd3220c92780f26993d8ea6f1ef42b87bc699842bb5d549e758ddd67271b0e
- projects/01-testimonials-senja/tests/agent-payments-e2e/scenario.mjs: d0f4e764f6fad029a3d5461316a446e9d856ff2dc078ada248cf6a614add2c3a
- projects/01-testimonials-senja/tests/agent-payments-e2e/run.mjs: 53cffefde64f4d3f776c96b35dc1ca0254e1a6c86a11d193587daf8016c35812
- projects/01-testimonials-senja/tests/agent-payments-e2e/evidence/acceptance.json: 3b4705ab85e4804a4d14cab84e46153dac5786e2bf36b94b384b02e078c1217b
- projects/01-testimonials-senja/tests/agent-payments-e2e/evidence/run.json: 391f737d9555040c8ba2d1179e4e16e13456f483f7adfea26d49c39a6039a4a9
- projects/01-testimonials-senja/tests/agent-payments-e2e/evidence/source-hashes.json: aec8896819361eec45f07190dd52e8ce67ae7484caa638134678a76dca9a2d89
- projects/01-testimonials-senja/tests/agent-payments-e2e/evidence/screenshots.json: 987de1f2bcb28c4a3d227ff1f3c9950e82205cc1eb10e6b10a18ec699460a052

Complete runtime source and compiled handler hashes: evidence/acceptance.json
Complete owned text source hashes: evidence/source-hashes.json
Telemetry: projects/01-testimonials-senja/tests/agent-payments-e2e/evidence/run.json

Status: completed
