# A22 scoped fixture correction receipt

Run-ID: 20261006T090602Z-n7-expanded-mvp-a1
Work-Unit-ID: f10-pair-fixture-fix-a22
Source-Revision: 74766159b38c0e346832992c3be7b62851aad577
Baseline-Revision: afb58dc9b26f814433b117a63e45994c71e7cbde
Launch-SHA256: 56c41b1613290959f47e87509be617dd2dad81c1b5008b9df9cb43f9030911f7
Finished-At: 2026-10-06T20:41:06.056455+00:00
Verdict: PASS for exact one-test-file fixture correction; overall F10 remains unaccepted.

The existing pair fixture now clears pool_peer_after after submitting the initial job, forcing a genuine existing-pair conflict before the next tick. Runtime and assertions are unchanged. Exact baseline/proposed test hashes match frozen handoff.

Native focused exits: positive 0, shadow break-first-conflict mutation 1 with ERR_ASSERTION and “pair conflict must skip to another eligible tenant”, exact restored shadow positive 0. No timeouts. Raw TAP/stderr, ready/launched/native-exit/terminal JSON retained in this directory. Child wait joins completed; isolated n7f10_a2 quiescent; mutex independently reacquired/released. Shadow production bytes restored.

Guard evidence: one denied socket per TSX test child, zero denied DNS; same as prior exact-title evidence and consistent with optional TSX Unix IPC blocked by inherited guard (inference). No denied connection succeeded.

Integrity: 119 unchanged source entries plus one authorized test delta, 73 unchanged build entries, 15 unchanged SQL files. Existing component/build evidence reused by hashes in receipt.json; no broad assurance reruns. One prelaunch helper bookkeeping failure was corrected and preserved before any test child launched.

Profile model-routing-econom; requested gpt-6.1-sol/MEDIUM; actual host model/effort and usage/cost unavailable (null). Elapsed 275.678s including reading, setup and sealing.

Source and isolated DB writer ownership released. Coordinator owns continuation through a NEW independent HIGH review and integration. No overall F10 acceptance claim.

Status: completed
