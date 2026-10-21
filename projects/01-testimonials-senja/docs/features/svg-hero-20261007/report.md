# Proofwall hero acceptance

Concept: send review link → collect text without account → owner approval → public wall and site widget. Video omitted because intake disabled.
Files: README.md; apps/web/public/brand/product-flow.svg (6174 bytes). Existing guide: README/ru/02_user_guide.md. SVG SHA256: 99a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497.

Checks: XML/security/localfragment/size/READMEtarget/diff and negative security mutation PASS. Independent fresh-context HIGH review a2 PASS. Direct SVG8/8 light/dark360/900 normal/reduce including DejaVu text/card/viewport bounds and marker/text separation PASS. Normal IMG4/4 with actual perframe accent pixelcentroids PASS (151–379px between phases; wall12.68px/widget30.5px withinphases). Native system reducedmotion forced Chromium4/4, windowmatchMedia true and zeroPNGpixel delta PASS. Original emulated IMG reduce4/4 failed retained in browser-a1/a2 reports; this is an emulation limit, never claimed16/16emulatedpass.

Build seam: existing Next public-folder COPY verified; owned dry static copy retained identicalasset. Full application build notrun (presentation-only isolatedsparsecheckout, no sourcebehaviorchanges), actualGitHubrender notpublished. No separate publicmirror pipeline found. Existing publication command as data only: `git push origin HEAD` (.claude/rules/git-workflow.md; origin exists); this task forbids executing it. Runtime standcommand as data: `docker compose -f docker-compose.yml -f compose.demo.yml up -d web` (existing README; notexecuted).

Profile model-routing-econom. Requested planner/reviewer gpt-6.1-sol high; author/fixes gpt-6.1-sol medium. Actualruntime models/usage/cost null (hostnoauthoritative counters). Coordinator startedbatch21:06:38; project passportelapsed 1436.0s; fullbatchelapsedincludesinitialreading/coordinating. Telemetry docs/telemetry/p-replicator/20261007-svg-hero/. Known regressions null; followup pending. Firstpassfalse, correctedmobile/fontfallback and testharnessstyleinjection; no deps/install/push/PR/release.

Verdict: PASS for scoped SVG+README presentation.
Status: completed
