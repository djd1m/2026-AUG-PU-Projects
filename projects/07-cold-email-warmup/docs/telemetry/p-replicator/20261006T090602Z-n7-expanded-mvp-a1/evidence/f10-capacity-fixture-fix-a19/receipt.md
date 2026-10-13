# F10 capacity fixture fix A19 receipt

Run-ID: 20261006T090602Z-n7-expanded-mvp-a1
Work-Unit-ID: f10-capacity-fixture-fix-a19
Attempt-ID: f10-capacity-fixture-fix-a19
Launch-SHA256: b60d8f85a6d01b1bf984da2a7040d8b09824966736556964c2d8a9bec0e63e47
Started-At: 2026-10-06T19:51:42.225992+00:00
Finished-At: 2026-10-06T19:57:34.733231+00:00
Source-Revision: afb58dc9b26f814433b117a63e45994c71e7cbde
Baseline-Revision: eae17bbea36312ee5290adb8390e066b1f0d6c2a
Build-Revision: eae17bbea36312ee5290adb8390e066b1f0d6c2a (all 73 production build bytes unchanged)
Verdict: PASS for authorized author correction; overall F10 UNACCEPTED
Status: completed

Only tracked change: projects/07-cold-email-warmup/tests/capacity-integration.test.ts +1 line. Explicitly deactivate ids[30] before filling ids[0..29] in complaint quarantine test. No assertion or runtime changes. Commit afb58dc9b26f814433b117a63e45994c71e7cbde.

| Native check | Exit | TAP tests/pass/fail |
|---|---:|---|
| baseline30 | 1 | 11/9/2 |
| patched30 | 0 | 11/11/0 |
| patched29 | 0 | 11/11/0 |
| capacity | 0 | 11/11/0 |
| typecheck | 0 | n/a |
| build | 0 | n/a |
| compile scratch witnesses | 0 | n/a |

All native timeout flags false, cancelled/skipped/todo0. Exact tracked capacity file run once. Evidence stage.tap, stage-native-exit.json, stage-terminal.json and stage-ready.json in /tmp/n7-f10-capacity-fixture-fix-a19. Tool logs and terminal files use type/build/compile prefixes. Parent title: F07 real PostgreSQL capacity boundaries and atomic safety. Baseline failing child: complaint quarantine immediately releases capacity for another tenant; literal compiled line109 expected waiting_capacity/actual active. TAP fail2 includes failing child and parent. Original fullpg winner remains unknown, not reconstructed.

Witness-only compiled predecessor replaces Promise.all([29,30]) with sequential [30,29] or [29,30] activation; existing sorted-state/global30 assertions retained. Original baseline compiled copy differs only by removal of the added complaint reset. Real tracked predecessor remains concurrent. Witness index lists SHA inputs; immutable src/db symlinks point to verified production dist/db. Compiled tree252819B, no giant checkout/new framework/runtime rewriting.

120 source and73 build manifest hashes checked before/after; only expected test SHA changed. All src files covered by source manifest. Additionally all15 db SQL files proved byte-identical to git baseline, database-source-manifest.json. Production source/build drift0. Runner/preload/witness/fixture SHAs captured BEFORE launches and checked immutable at seal. Guard copy changes only own output root; inherited child, external TCP/TLS/DNS denial, early missing-fixture rejection, canonical IPC and numeric loopback TLS string/buffer CA probes PASS. No guard loosening/external providers/spend/installs/main writes/push/deploy/global config. Private probe key removed.

Own database n7f10_a2 current_database verified and PGquiescent before every test self-reset. No manual reset. Every native child joined, remaining own/prior nodes[], PGquiescent, mutex released; terminal nonblocking mutex acquisition/release succeeds. No tests after terminal seal. Disk 3202416640B and free inodes 4778344.

Terminal-seal.json SHA256: 587608354aa7c65d8eacd2cba516c367a2dd99a98fffebe7014ebf599ef31a81
Final-manifest.json SHA256: 237ad9bb03ef3afafdfdde1a55dc3298163978e152c109c978f19e55936c54d2
Database-source-manifest.json SHA256: ed040e6ae61ee70f3f9171fd803196a79443892708d47b92d460cd6eb1cde17b
Planner packet SHA256 verified: c56fa1bef6b60a4f413320469fe4ee7314439e4aa5d1c48e5ea9328c5f4682e5.
Previous owner receipt SHA256 verified: 0388266462d0794175001b576c0f63f9655dc8d2ea477ca4c8ee06acd4731088.

Profile model-routing-econom; requested gpt-6.1-sol medium; actual_model/actual_effort null, host metadata unavailable. Usage/cost null, unavailable. Launch-to-seal elapsed 352.507239s, active time null (named wait intervals unavailable). Same run preserved; stage-events.jsonl for coordinator integration. No historical edits/new run/savings claim.

ROUTE S approved test-only delta; mechanical explicit-file exit1/L matched existing foreign-host/schema strings, no new contract/runtime/schema/external behavior. Owner approved exact scope and retained plan. project-work-companion applied to source-bound readiness/receipt; coordinator owns main work record and independent review.

Remaining author AC: none. Overall F10 remains UNACCEPTED: coordinator owns independent review, integration and outstanding original F10 gates. No330/physical/fullunit/broad unchanged-green reruns. Next responsible /root/n7_sol_coordinator. Explicit source worktree and n7f10_a2 DB ownership RELEASED after this receipt. No background work claimed.
