# Changelog

Generated from the git history of the `projects/01-testimonials-senja` directory.
Date: 2026-08-27.

## Status

All 13 MVP features are implemented. 408 checks across 35 files, all passing.

| Feature | What went in |
|---|---|
| `FR-001` | Owner registration and project creation (slug, 3 links: form/wall/widget) |
| `FR-002` | Collection form — text testimonial (rate limit 5/hour/IP, accepted without sanitization) |
| `FR-003` | Collection form — video testimonial + transcription queue via OpenAI STT (ADR-005, FTC boundary) |
| `FR-004` | Moderation: pending/approved/rejected/hidden, audit log, cross-project 403 |
| `FR-005` | Public Wall of Love page (SSR, schema.org/Review, escaping at render time) |
| `FR-GROWTH-005` | Substance threshold and noindex for /w/<slug> — anti scaled-content-abuse (ADR-004) |
| `FR-006` | Embeddable widget: Shadow DOM, ≤30KB gzip, badge_required from the server (ADR-001) |
| `FR-GROWTH-001` | widget_installed + invite_shown (the value moment) and a share CTA for every new domain |
| `FR-007` | free/paid plans as a project attribute, server-side check (not in the client) |
| `FR-GROWTH-003` | Badge loop: mandatory badge on free, anti-tamper MutationObserver (ADR-002) |
| `FR-008` | Checkout + payment webhook, idempotency by event_id (ADR-006), plan upgrade |
| `FR-GROWTH-002` | Partner attribution: promo code takes priority over cookie (ADR-003), self-referral guard |
| `FR-GROWTH-004` | Personal partner codes + IP-based anti-fraud on signups |

## Commits

- `38035fa` fix(01): воркер забирал текстовые отзывы в очередь транскрибации
- `7539dc5` feat(01): FR-002 — фото к текстовому отзыву
- `d78a04c` docs(forge): PR-014/015/016 + страж полноты проброса переменных
- `a8eb7c6` feat(01): дизайн-система по языку оригинала
- `016a49a` fix(01)!: BASE_URL не пробрасывался в web — все выданные ссылки вели на localhost
- `9d6135c` fix: хуки и statusline падали с MODULE_NOT_FOUND из подкаталога проекта
- `b1ccb57` refactor(01)!: FR-008 переведён на ЮKassa — HMAC удалён, провайдер её не присылает
- `cf7e3ed` fix(01)!: rate limit обходился сменой X-Forwarded-For — web больше не публикуется
- `f9b7df6` feat(01): FR-GROWTH-004 — партнёрские коды, anti-fraud по IP, когортный дашборд
- `67689ed` feat(01): FR-GROWTH-002 — партнёрская атрибуция, промокод важнее cookie
- `473fdb8` feat(01): FR-008 — приём оплаты, подпись вебхука и идемпотентность
- `5b75587` feat(01): FR-GROWTH-003 — badge loop замкнут
- `be3e893` feat(01): FR-007 — тариф как атрибут проекта с серверной проверкой
- `ff19ec4` fix(security)!: запрет публиковать БД наружу — после реальной компрометации
- `6d265f6` feat(01): FR-GROWTH-001 — widget_installed, invite_shown и share-CTA
- `f26676b` feat(01): FR-006 — серверная конфигурация виджета и раздача бандла
- `721e987` feat(01): FR-GROWTH-005 — порог содержательности и двусторонний noindex
- `0d3a4c6` feat(01): FR-005 — Wall of Love, SSR и schema.org/Review
- `7fd74cf` feat(01): FR-004 — модерация с двумя независимыми рубежами изоляции
- `8b14dfc` docs(01): роадмап — FR-003 done, разблокирована FR-004
- `2bae711` feat: требование проверять конфликты портов до запуска контейнеров
- `0293869` feat(01): FR-003 — видео-отзыв, загрузка в MinIO, очередь транскрипции
- `2fae325` docs(01): роадмап — FR-002 done
- `669692d` feat(01): FR-002 — приём текстового отзыва без регистрации
- `9a37e66` docs(01): роадмап — FR-001 done, разблокированы FR-002 и FR-003
- `e9d8837` fix(01): Dockerfile apps/web действительно собирается и стартует
- `cb6f9e3` feat(01): FR-001 — API-роуты, страницы и выдача трёх ссылок
- `d94c98d` feat(01): FR-001 — регистрация владельца и создание проекта
- `4fddf4e` feat(01): apps/web — каркас Next.js и примитивы аутентификации (FR-001)
- `0f3c9d0` docs(01): README quick start и реальный статус — Phase 4 /start
- `667e3be` fix(01): npm test был неидемпотентен и падал на документированной команде
- `c736e39` docs(01): D-008 — apps/web без исходников, разбор дефектов сборки
- `532f494` fix(01): docker-образы не собирались и не запускались — Phase 3 /start
- `416f5e2` fix(01): migrate transcription from Claude to OpenAI STT (D-007)
- `1c6e5d0` decisions(01): D-007 - Claude API does not accept audio, transcription blocked
- `381723e` feat(01): Phase 2 complete - db, widget, worker, mcp-claude
- `af958fc` chore: ignore node_modules and build output across projects
- `f9f9ac8` refactor: move decisions/ into project folder - it is project-local
- `f8e1a5d` harness-forge: PR-008 phase overlap, PR-009 validation not enforced
- `4f6c81e` feat(01): Phase 2 packages in progress - db, widget, services
- `57f48b9` chore(01): project root configuration - workspaces, tsconfig base
- `d96b5f3` feat(01): Phase 4 scaffold - compose, Dockerfiles, Caddyfile, env example
- `82bf38c` feat(01): Phase 3 toolkit - CLAUDE.md, 3 agents, 3 rules, roadmap
- `f88a9ec` docs(01): test-scenarios.md - 28 scenarios with traceability, Phase 2 complete
- `063596b` docs(01): add FR and ADR back-references to pseudocode sections
- `066dcae` validation(01): final gate - READY, 89.4, 0 open items
- `e5f7b86` start: SPARC docs guide - set not distillation, four files for code
- `4e836a3` research: docs chain and CJM/ADR integration analysis
- `7049e7d` harness-forge: 4 new PR requests from project 01 pipeline run
- `a0c3ecc` docs(01): iteration 2 - C4 and Refinement canonical names
- `6944124` docs(01): iteration 2 in progress - specification and refinement
- `1c58f40` docs(01): close B-4 for real - webhook signature check in algorithm
- `4dce591` validation(01): re-validation report - B-4 closed on paper only
- `391aa87` docs(01): align pseudocode with canonical names from Architecture §10
- `e5e729b` chore: untrack agent temp files, gitignore *.tmp
- `6368be9` docs(01): architecture fixes - C-1 model, anti-fraud counters, ADR-007 TLS, compose healthchecks, canonical names
- `5eaf5d2` docs(01): refinement updates (validation iteration 1)
- `9971d39` docs(01): pseudocode fixes in progress (validation iteration 1)
- `e128453` docs(01): fix all Specification blockers (B-1..B-4, C-2, W-2, W-6, W-7)
- `d51dc9f` docs(01): validation iteration 1 in progress - architecture and specification
- `98f0fef` docs(01): remove leftover fragment of superseded C-1 decision from PRD
- `6728980` docs(01): architecture fixes in progress (validation iteration 1)
- `7d78c0d` docs(01): count sites not people - share-CTA on every new domain
- `906108f` docs(01): resolve C-1 - separate value moment from week metric, set target 10
- `7f5be41` validation(01): Phase 2 verdict - RED, 4 blockers, return to Phase 1
- `910475e` validation(01): coherence report - 78/100, 10 contradictions
- `f1229ce` validation(01): acceptance criteria report
- `138992d` validation(01): user stories INVEST report - 87.3/100, 0 blocked
- `d235b0f` validation(01): architecture report - 62/100 CAVEATS
- `974dc7d` docs: add plain-language section to all 8 project READMEs
- `752d728` docs(01): diff between old discovery and new SPARC run (growth lens)
- `2067ce6` docs(01): migrate architecture from Supabase to Postgres-in-container
- `26c7923` docs(01): drop Supabase from PRD, Pseudocode, Refinement (stack conflict)
- `d37c4d5` docs(01): Refinement (test strategy and growth mechanics testability)
- `dc08b7c` research: VPS security and network repos survey
- `49872d5` docs(01): Solution_Strategy, Research_Findings, Completion
- `1cbbd58` docs(01): SPARC Architecture, Pseudocode, Solution_Strategy (in progress)
- `74479f5` docs(01): SPARC PRD and Specification for Proofwall (Senja clone)
- `f5e0647` docs: add links to reference products in all READMEs
- `0d641f1` project 01: lesson plan and talking points for session 1
