# Independent Pinterest code review
Finished: 2026-10-14T20:04:49.064999+00:00
Launch SHA256: ecb8d670971a02def53738d89bf75a264fb4c39fc149faeedf42b5359e0d7a93
Specification SHA256: a4f495512f2653065ea946dc34cfac50a5d1fa2f4c519195daf0ce91f48c85c7
Actual model: unknown (execution metadata unavailable).
Verdict: changes_requested

P1 — Missing explicit page-path allowlist / pin provenance downgrade. pinterestURL page mode allows every path on approved hosts except /login. A pin redirect to a homepage or unsupported route is accepted; pinterestImages treats every non-/pin/numeric path as an ideas page and scans generic image URLs. This can turn an unavailable pin into unrelated recommendations, contrary to AC own-pin image and no silent substitution. Restrict initial/redirect/final paths to supported pin/ideas forms and pin.it short links; do not downgrade original pin intent to ideas after a redirect. Cover same-host unsupported redirects, not just external-host escapes.

P2 — Import failure has no discovery refresh path. apply catches import failures only in global error. Retry-discovery/manual controls are gated on preview.error, so successful preview followed by PINTEREST_CHANGED/download failure retains stale chosen URL and requested ID indefinitely. Repeated Apply sends the same stale URL. Mark the failed ref for retry/rediscovery and expose actual-failure fallback while preserving already imported refs.

Positive static checks: exact CDN host/path, bounded page/image sizes and three redirects, HTTPS TLS default verification, all returned IPv4 checked and a pinned connection lookup, fresh agent, abort signal shared across page/image download, no cookies/auth forwarding. Server pre-network actor/Origin/project/version/reference checks are present. Expected URL membership is rechecked server-side. Import feeds private uploader then new reference with returned CAS version; original link is retained. UI carries returned versions through sequential imports and palette creation. CSP addition is exact CDN image origin; image previews suppress referrer. Tests inspected cover hostile hosts/private DNS/size/mime and ownership/CAS, but not the two findings.

Static bounded review only. No tests, build, network calls or source modifications by reviewer. Existing test/native smoke claims belong to coordinator; no release/browser pass claimed. Usage/cost unavailable, not estimated. Hash mismatches below would require reconciliation against final source.

Source SHA256:
- `packages/adapters/src/pinterest.ts`: 9a9cbe6a5a899195d092781e5900f4251bbd11e5ce8cdc2ed2cf4c6ab49d9b7d; launch match: True
- `apps/web/src/server/reference-pinterest.ts`: 91576b70d4337b009efc80ff4993855ef0f16f62fac6d995aee2b23ecc5d498c; launch match: True
- `apps/web/src/components/DesignReferences.tsx`: 41feed72014380661f7f51b5bbde706db993d992cd412ddc115ee9f1c6dcb12e; launch match: True
- `apps/web/src/components/DesignPanel.tsx`: 1b5bc8081b40073ef2b0644adae24b9e209d07f9c874be78c843da5295c1a254; launch match: True
- `apps/web/src/server.ts`: 77c1019ff13088bcd56ac3b8532bc46db533ceca19eeca651cd1223eae89d136; launch match: True
- `tests/space/pinterest.test.ts`: 752219617cc8fc745eee17cd57ebd77ec8f173ef48b5a4e4da5d66949cf5aa08; launch match: True
- `tests/space/pinterest-http.test.ts`: 4594bef7b1888a56bce038031b6119f22e50e21a205f89063be154e41f475c06; launch match: True

FinalStatus: completed
Status: completed
