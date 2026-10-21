# Delivery — GLB textures and one upload form

Verdict: pass for bounded8K import and duplicate removal.
Build: sha256:99e9f766a4f9b186c50e6aa632e952884b53a0f618f3d311ee38c0352c0cb58a.
Source: source-image.json runtime SHA matches; base e00dfdcc plus changed source snapshot.

AC mapping: one GLB picker → ui-3 check1; textured11MiB import → check2 and20 parser tests; calibration/reload/unchanged original → check3; new-source reset → check4; malformed/byte boundaries → checks5–7; mobile/JavaScript → check8. Pixel budgets, standalone20MP preservation and corrupt texture decoding → parser tests; old-limit mutation fails both positive8K tests. Full258/258 plus typecheck/lint/build pass. Independent review P2 doc contradiction closed in separate receipt.

Native memory deadline/RSS guard preserved; original owner file not available, syntheticfixture only. 3D context/no-fallback checked; fixture is a minimal triangle, not a room scan. No live AI/payment changes. Database preserved. Failed test-driver/environment attempts remain recorded.

Status: completed
