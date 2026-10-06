# f10-native-profile-a8 terminal receipt
Run:20261006T090602Z-n7-expanded-mvp-a1
Source/build unchanged:87bb94944f33bf99f9f9fd6d6390d097ca415dc2; hashes verified from A7 frozen manifest before runs. No tracked writes/no build/image/dependency changes.
Launch SHA:ac67d34ec5eec723ed7e686c875c07eb58fb292728187f88fa35395c2223089b
Spec:accepted READY2f24e06c cadence corrective revision.
Requested:gpt-6.1-sol/high; actual model/effort/usage/cost:null host_not_exposed.
Launch17:04:09.180509Z; actualACK17:04:55Z; reportfreeze/seal2026-10-06T17:13:48.163467+00:00. Targetfreeze17:12:39.180509Z exceeded; final17:14:09.180509Z. Only/tmp scripts/artifacts owned; DBn7f10_a2 guarded; no old/default DB writes.
Checks:{"profile-v3.exit": "0", "profile-v2.exit": "143", "profile-v1.exit": "0"}. Exit0 on profiling script is not acceptance: explicit failures below. Heavy mutex and two-CPU worker/descendant affinity used.

v1 real localTLS partial20.662s failed on /proc ESRCH race before two completions. Raw preserved.24children;18matched startup-firstTCP median319.5/max431ms,22matched lifetime median442/max572ms; peer median103.896/max182.478ms. Peakaggregate RSS311976KiB/FD124/processes5. Sampling30ms target, kernelstart10ms resolution, exit brackets; partial only, no all30 cadence proof or startup-only rootcause.
v2 test-only Pool.connect wrapper omitted callback overload; terminated ONLYown temporary fixtures; failure preserved. No production finding.
CRITICAL v3 temporary wrapper called runWorker without fixture argument. It completed150.168s,0completepolls/0localTLSpeers/provider_backoff and therefore may have attempted real-provider DNS/sockets. Actual outside connection/auth cannot be confirmed or excluded from retained evidence. Do NOT claim no external network or local-only profiling. Reported immediately toparent; attempted own-process stop found0 because run had already ended. This is author's harness defect; no production code changed. v3 data quarantined as invalid-network scope evidence. Large timing IPC payload did not arrive beforedisconnect (drained absent), so no trustworthy maintenance/claim/finish timing output. No rootcause claimed.

Remaining: complete all30 two/three completion local-only2CPU attribution including runtime/global-lock/slot/PG waits, exact quantum/finish timestamps and startup vspeer vsDB time. Next owner /root/n7_expanded_coordinator allocates bounded safe profiler repair: enforce fixture argument before runtime, callback-safe wrappers, explicit subprocess no-external-network guard, await IPCflush, then exact frozen-native run. No product optimization before data. WholeF10 remains unaccepted; full300/fault/restart/resources/currentunitPG/native/mutations/canaries/freshreview remain mandatory. Parent notified critical discrepancy. Artifacts:/tmp/n7-f10-native-profile-a8; profile-report-v1.json. No push/install/cleanupforeignresources.
Status: failed
