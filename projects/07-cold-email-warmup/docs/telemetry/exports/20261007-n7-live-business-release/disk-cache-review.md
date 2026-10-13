# N7 release disk cache critic — 2026-10-07

Scope: bounded, read-only review of `/root/.npm/_cacache` and `/root/.cache/puppeteer`; no cleanup performed. Owner authorization for cautious cache cleanup is supplied by the coordinating agent. No new authorization is claimed here.

## Decision

Eligible exact cleanup candidate: `/root/.npm/_cacache` only. Measured allocated bytes: **124,313,600**; apparent bytes: **123,900,566**. Preserve `/root/.npm/_npx`, `/root/.npm-global`, installed dependencies, configuration and all other directories. This directory contains npm package content/index cache, separate from the actual N7 installed dependencies supplied in task context. Current build must continue using its installed dependencies; do not introduce install/ci or cache-offline operations during deletion. Recheck for active package installation immediately before any coordinator cleanup.

No Puppeteer path is approved by this review. In particular, **preserve** `/root/.cache/puppeteer/chrome/linux-148.0.7778.97`: allocated **394,452,992** bytes. Two live chrome-devtools-mcp launch chains explicitly configure this executable path (npm-exec PIDs 1612162 and 2891567). These tools can launch Chrome later even though no browser executable currently appears mapped.

`/root/.cache/puppeteer/chrome-headless-shell/linux-148.0.7778.97` occupies **271,892,480** allocated bytes. No active process reference was found, but it is a paired browser of the same version, **not an old duplicate version**. This bounded review cannot establish that all pending host browser tasks avoid it. Retain it until the coordinator can prove the required tooling will use only the explicit Chrome executable or the existing container. No other cached version exists.

## Evidence and limits

- At 2026-10-07T18:01:56Z, `/` had **2,198,933,504** available bytes, only **51,449,856** above the 2 GiB floor. Available space is moving; obtain a fresh measurement before build.
- `ps -eo pid,ppid,args` showed no npm install/ci process. Running npm-exec consumers reference `/root/.npm/_npx/15c61037b1978c83`, not `_cacache`.
- `/proc` executable, cwd, file-descriptor and memory-map scan returned no current references to either candidate cache. Four process fd directories were unreadable/raced; absence is a snapshot, not a guarantee about future work.
- npm cache latest file modification: 2026-10-07T17:51:59Z. Deleting content cache can require later package downloads. It is therefore eligible only for this no-install build interval; installed binaries and `_npx` must remain intact.
- Narrow persistent config search confirmed the explicit Chrome path in `/root/.claude.json`. No browser configuration was changed. No secrets were printed.
- Existing `codex-ui-playwright` container is running, image `codex-ui-playwright:1.63.0`. It runs the Playwright server inside the container. Container/image/volume cleanup and image pulls are outside scope.
- No images, volumes, databases, worktrees, evidence, secrets, key files, Codex store, installed dependencies or project files were changed.
- Normal sandbox exec failed before launching (`bwrap: Can't mkdir repository/.codex: Permission denied`). Read-only inspection and this explicitly requested `/tmp` report used reviewed escalation; approval review permitted these calls.

## Telemetry

Profile: narrow read-only cache safety critic. Actual model: null (runtime model identifier unavailable). Tokens/cost: null (not exposed). Duration: bounded under three minutes; exact start-to-finish duration unavailable. Checks: cache bytes/version inventory, process snapshot, `/proc` consumers, narrow persisted executable-path config, running browser container metadata. Repository `CLAUDE.md` was read. No delegation, cleanup, installation, global settings mutation or test run.
