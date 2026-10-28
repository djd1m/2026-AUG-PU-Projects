# N5 support disk audit

Work-Unit-ID: n5_support_disk_audit
Started-At: 2026-10-28T01:05:51Z
Finished-At: 2026-10-28T01:09:17.344161+00:00
Source-Revision: 5ef18d27c243732e84e916f8d41b2e20241b72ea
Project-Root: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus
Canonical-Repository: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects
Profile: bounded read-only disk audit, maximum 10 minutes
Requested-Model: Sol high; actual model identifier and usage counters unavailable to this worker
Verdict: completed; no unconditional safe deletion candidate above 100 MiB established

At 01:08:23 UTC, available space was **2,951,344,128 bytes (2.749 GiB)**. This is **803,860,480 bytes (766.6 MiB)** above the mandatory 2 GiB floor, and above the coordinator's 2.5 GiB cleanup-decision threshold. No bytes were freed by this auditor. Free space is a point-in-time measurement, not a reservation for the upcoming build.

## Conditional package-cache candidate for coordinator decision

| Exact path | Allocated bytes | MiB | Owner | Current use evidence | Recreate cost / limitation |
|---|---:|---:|---|---|---|
| `/root/.cache/puppeteer/chrome` | 394457088 | 376.2 | root:root | No observed cache path references in readable process metadata; no matching Docker mount among 60 containers | Redownload Chrome for Testing 148.0.7778.97 through the owning tool; network, download time and package availability were not verified |
| `/root/.cache/puppeteer/chrome-headless-shell` | 271896576 | 259.3 | root:root | Same checks | Redownload matching headless shell; owning tool and future need remain unproven |

Combined allocation: **666,357,760 bytes (635.5 MiB)**. These are product package trees under `linux-148.0.7778.97`, with installation metadata dated 2026-09-23. Main executable paths are `chrome/linux-148.0.7778.97/chrome-linux64/chrome` and `chrome-headless-shell/linux-148.0.7778.97/chrome-headless-shell-linux64/chrome-headless-shell` beneath that cache root. The main executable sizes are 276,917,464 and 188,087,520 logical bytes, respectively. Each executable is root:root with one hard link.

The cache contains 590 regular files, 666,255,360 allocated regular-file bytes, no symlinks, no multiply linked regular files, and no filename markers `Default`, `Profile 1`, `Cookies`, `History`, `Login Data`, `Preferences`, `Local State`, `SingletonLock`, `SingletonSocket` or `SingletonCookie`. Directory allocation accounts for the remaining 102,400 bytes. This supports classification as third-party browser packages rather than a browser profile; it does not establish lifecycle ownership or permission to disrupt a future tool invocation.

The process snapshot saw 480 PIDs: 299 readable `exe` links, 466 readable `cwd` links, and 476 readable maps and FD directories. Zero readable `exe`, `cwd`, mapped-file or FD paths referred to this cache. 181 `exe` links, 14 `cwd` links and four maps/FD directories were unreadable or disappeared. Therefore absence of references is incomplete evidence. Docker metadata inspection succeeded for all 60 existing containers and found zero bind/volume source paths equal to, inside, or parenting the cache. No commands, environments or log contents were read. Process command lines were not inspected.

**Recommendation:** retain this shared cache at current free space. If space falls below 2.5 GiB, the coordinator may consider these exact package directories after rechecking current process/mount use and accepting future redownload cost. The auditor does not certify these as unconditionally safe, and has not removed them.

## N5 scope findings and exclusions

| Exact path / class | Allocated bytes | Decision |
|---|---:|---|
| `/tmp/n5-support-backend-20261028/projects/05-podcast-clips-opus/apps/web/.next/cache` | 389120 | Active coder artifact; retain |
| `/tmp/n5-yandex-stt-code-20261027/projects/05-podcast-clips-opus/apps/web/.next` | 5529600 | Previous large cache already absent; remaining build is too small and preserved |
| `/tmp/n5-cloudru-foundation-code-20261026/projects/05-podcast-clips-opus/apps/web/.next` | 6205440 | Completed build only 5.9 MiB; retain |
| `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/apps/web/.next` | 5480448 | Integration artifact; retain |
| `/tmp/n5-acquisition-analytics-code-20261026/projects/05-podcast-clips-opus/node_modules` | 653557760 | Explicitly live dependency root; retain |
| `/tmp/n5-p-replicator-1.13.5/dzhechkov-p-replicator-1.13.5.tgz` | 1220608 | Only meaningful N5 standalone package archive found; below useful threshold, retain |
| `/tmp/n8-node22` | 123191296 | Other project's executable; ownership/lifecycle not established, retain |
| `/tmp/claude-0` | 1803980800 | Tool output / evidence ownership not established; excluded, retain |
| `/var/log` | 1666760704 | Metadata-only size survey; every log retained |

N5 `.vite` cache sizes were 16–24 KiB each and do not yield meaningful space. The archive search excluded `.git` and `node_modules`; all other archive matches were small protected reports/evidence or third-party documentation. No >100 MiB standalone N5 package archive was found. N7/N8 worktrees, all source, databases, containers/images/volumes, live Node22 distributions, pinned gRPC dependencies, private fixtures, TLS material, render inputs, browser fixtures and reports/finals remain outside deletion recommendations.

## Method and limits

Used `du -x -B1` without following symlinks. These are allocated filesystem bytes, not apparent-size or symlink-target counts. The browser package calculation independently deduplicated `(device,inode)` and checked hard links; no hard-link overstatement was found. The broad `/tmp` size survey reached 12,377,702,400 allocated bytes and exited 1 after an unrelated transient `/tmp/runc-process...` disappeared; targeted cache measurements all exited 0. This transient does not invalidate the reported targeted measurements.

No tests, builds, dependency downloads, paid calls, network research, installations, cleanup, truncation, process stops, or Docker mutations were performed. The only writes were this report and its trace. Read-only commands used scoped escalation because default sandbox setup failed to create the repository `.codex` mount; no global repair was attempted. E2E preflight is not applicable to a disk metadata audit. Root/project instructions and the project-work-companion evidence contract were read; the coordinator owns project telemetry and product acceptance.

Available duration is measured from the timestamps above. Token usage, cost and actual model metadata are null/unavailable, not estimated. This report completes the bounded audit, not the ongoing N5 implementation. The coordinator retains responsibility for observing disk during full tests/build and evaluating any newly generated `.next/cache` after its owning stage completes.

Status: completed
