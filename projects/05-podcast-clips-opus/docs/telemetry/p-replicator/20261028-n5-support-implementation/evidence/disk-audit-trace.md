# N5 support disk audit trace

Work-Unit-ID: n5_support_disk_audit
Started-At: 2026-10-28T01:05:51Z
Finished-At: 2026-10-28T01:09:17.344161+00:00
Source-Revision: 5ef18d27c243732e84e916f8d41b2e20241b72ea
Scope: read-only disk metadata, process paths, Docker mounts; report-only writes.

1. Default execution failed before running: bwrap could not create repository `.codex` mount. Continued with individually scoped read-only escalation; no repair.
2. Read root/project instructions, project-work-companion adapter and evidence contract.
3. Surveyed allocated sizes of `/tmp`, `/root/.cache` and `/var/log` using `du -x -B1`. `/tmp` traversal exited 1 for a disappeared transient runc path; targeted measurements exited 0.
4. Measured N5 `.next` and `.vite` artifacts; found no current >100 MiB completed N5 cache. Scanned N5 archive metadata excluding Git/dependency trees; largest standalone package archive 1,220,608 allocated bytes.
5. Inspected process `exe`, `cwd`, FD target and mapped-file paths only. No command lines/environments. Puppeteer target references: 0 in readable snapshot; four process maps/FD directories were unavailable.
6. Inspected Mounts metadata for all 60 existing Docker containers: zero source paths overlapping the Puppeteer cache. Docker operations were read-only.
7. Measured both Puppeteer package trees and version/date/ownership metadata. Combined allocation 666,357,760 bytes; unique regular-file allocation 666,255,360 bytes; 590 regular files; zero symlinks or multiply linked regular files; zero browser-profile marker names. Classified conditional package-cache candidate, retained pending coordinator decision.
8. At 2026-10-28T01:08:23Z, `df -B1 / /tmp` reported 2,951,344,128 available bytes on `/dev/vda1`. No audit cleanup performed; freed bytes = 0.
9. Created only `/tmp/n5-support-disk-audit-20261028.md` and this trace using exclusive creation. Both paths were absent immediately before creation.

Verdict: audit complete; no unconditional safe deletion recommendation over 100 MiB. Puppeteer package cache remains a conditional 635.5 MiB coordinator candidate if space drops below 2.5 GiB.
Checks: metadata inspection only, no product-test/E2E claims.
Model / usage: requested Sol high; actual identifier, token usage and cost unavailable.

Status: completed
