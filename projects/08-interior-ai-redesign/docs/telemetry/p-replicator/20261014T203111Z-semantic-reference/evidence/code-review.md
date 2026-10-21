# Independent semantic-reference code review
Finished: 2026-10-14T20:43:38.584535+00:00
Actual model: unknown (execution metadata unavailable).
Verdict: changes_requested

Findings and corrective status:
- P2 server replay-before-images: CLOSED in inspected final source. Handler validates consent and calls account/key/input-hash replay before prepareReferenceImages; submit retains atomic duplicate check.
- P1 paid-submit retry uses fresh idempotency key after uncertain transport failure: CLOSED for same-input retries in inspected source. UI ref now preserves key/input/consent/version across failed submission.
- Remaining P1 in final corrective UI: the new catch clears frozen attempt on ALL 4xx. A 429 from the pre-replay rate guard during retry does not prove the first POST was unaccepted; clearing then permits a fresh key and duplicate paid job. Clear only explicit definitive no-admission codes such as VERSION_CONFLICT / CONSENT_CHANGED / CREDITS_REQUIRED, retaining the attempt for rate limits, generic transport failures and ambiguous errors. The earlier stale-attempt issue is otherwise addressed. Sent immediately to owner.

No additional blocking finding in bounded renderer/domain review. Role response schema rejects added fields and invalid colors; null manual roles retain prior values, GLB unknown/null groups use imported material. Frozen server scene supplies geometry/objects; response cannot inject geometry. Owned active reference IDs and verified private normalized bytes produce bounded thumbnails; strict consent hash and existing reserve/fenced worker accounting are reused. Plan amendment prohibits standalone paid QA; smoke skipped without eligible QA credit. Manual switch removes appearance overlay and provides editable materials. UI visibly discloses image/provider transmission and credit/cost limit.

Renderer transforms positions only in temporary classifier input, preserves original vertex attributes and triangle triplets, skips shared geometry/skinned/morph/unindexed/multimaterial meshes, restores original index/submesh/material state, and disposes only overlay-owned materials. Geometry grouping remains an approximation; it is not bed-instance recognition or texture transfer. Tests inspected cover distinct roles/null/strict mutations, metered worker fixture, fused groups and Babylon restoration. Their execution and actual full suite/build/browser remain coordinator-owned.

Static review only; no tests, provider calls, account/credit changes or source edits by reviewer. Real Gemini semantic output and exact owner-scan visual outcome have not been verified by this review. Usage/cost unavailable, not estimated. This receipt records source at completion; subsequent fixes need narrow source-bound closure.

Source SHA256:
- `packages/domain/src/design/appearance.ts`: 0925d87a0502551fd55319030a8811374ce5c68f979480b2dae7b32c825454c9
- `packages/domain/src/design/scene.ts`: 3bb047ef594065ccf38ae9802889ed1b28aa755fc419c596f31861625b6784d5
- `packages/domain/src/design/provider.ts`: 5d87a1eb5c9f410caee632ed89dda87e5042b244a2575e486177f4735f041ab8
- `packages/adapters/src/openrouter.ts`: da37a53bfb60c5f9b822b9192a8ec55119a72090ccd614cedd0a634c3385220c
- `packages/adapters/src/reference-thumbnail.ts`: 0d3a28af62f8dde703182262ff39b525fb5bda120e2283deb27f09321c00fc96
- `packages/db/src/design/jobs.ts`: 8cf0c046705bca7280ee3a3d8a1950cc51bc73f12b1fa6f889324380ff895b35
- `apps/web/src/server/design.ts`: 44932d5c06eb45e9f2984603d1bc0eb75b62ce015f2016aa75ddf57b2afb53fe
- `apps/web/src/server/reference-images.ts`: 1eb38e8a3b9571c74d32580d88c76b14143cb325749b9d6c6b4aaed8f489797f
- `apps/web/src/components/DesignPanel.tsx`: 6f9633a3d5a7ff1278751cb06998df38943a4f18939602978e6f497ae81d4a18
- `apps/web/src/components/DesignReferences.tsx`: 09adf0cd815a0ce1d443a6496780329fbbbb4e1ef87ec162e5b09ec8924a1363
- `packages/viewer/src/renderer.ts`: d27d3217feee7c9c30a837c4a883361653e0fc45338a7fb2f669f9bc83e71ab8
- `packages/viewer/src/semantic-segmentation.ts`: e165ee43e195fa8dcd85c43ddc8e19d65f45e461ca3fb4076659a47356386c7f
- `packages/viewer/src/types.ts`: 17301eecf908e8c1ca41a41ac92639664d5d33cbed3b515b6e76a6d715a486f8
- `tests/design/appearance.test.ts`: ddea65d9bb94bbc0f6b255ea81061ad6040c281f26cb86cf3f85a1d41d65d957
- `tests/design/semantic-segmentation.test.ts`: 042f7e88c6f1fff517c94c6d55b61476942224b8d4d439b51ec0d0f0e022313d

FinalStatus: completed
Status: completed
