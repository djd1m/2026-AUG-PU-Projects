# N7-V01..06 correction handoff

Attempt correct-docs-1, baseline `c36b00fb2ead4acedd8a7247f2049c3f59b2afc9`.
Budget20min; started 2026-10-02T18:20Z. Only confirmed review findings addressed.
Original validation-report.md/receipt preserved unchanged; revalidation pending.

| Finding | Concrete correction | Acceptance references |
|---|---|---|
| V01 high | AC-N7-007 explicitly corrected; direct peer headers/test body disclosed in pool consent; private data/API enumeration protected | FR-n7-004, SC-US-004-3, Architecture tenant boundary; CJM copy pending below |
| V02 high | Single global advisory transaction lock(7,1) used FIRST by every eligibility/stop writer and final conditional claimed→submitting transition; commit is irreversible boundary | Safety-v1 serialization, SC-US-003-4/5 with ten stop-writer rows, dispatch algorithm |
| V03 medium | Physical observations separate from stable optional Message-ID ledger and unique(mailbox,enrollment,reply) effect; bounded persistent high-water rescan and tail-poll gate | SC-US-006-3/4/5, Pseudocode ingestion |
| V04 medium | Explicit safety-v1: poll30s/fresh<60s; rescan20×100/120s; retry3 total/120s; one warmup reply; atomic auth windows/KDF2/no queue; evidence7/28days | Safety policy plus concrete boundary Example rows |
| V05 medium | Registration/login/logout reuse, bad authority/Origin, injection, AEAD/AAD canary, consent success and races, token/complaint negatives, reply sender/reference cases | 22 new named scenarios in docs/tests/security-scenarios.md; original catalog retains all32 |
| V06 medium | Usable local fake payment adapter REQUIRED; independent durable canonical state, TEST100 minor RUB, matching snapshot, success/single grant; unavailable only negative | SC-US-009-3/4, Architecture, approved-plan clarification, Completion |

Structural checks passed: 54 identical SC sets across spec/algorithms/two BDD
files; all Gherkin blocks have Given/When/Then; grouped branches have bound
Scenario Outline Examples; 16 requirement headings have16 exact claims; all
changed principal documents below500lines. docs-complete, growth-trace,
external-deps, pipeline-gaps and git diff --check exit0. No backend exists;
these are structural and design corrections, not executed product acceptance.

## Sol copy/test follow-up — 5 minute bound

Required because product HTML and tests must remain Sol-authored. Isolated
worktree pinned to correction commit. Own only `docs/cjm/{cohort-desk,partner-studio,
operator-review}.html`, optional focused additions to `check-cjm.mjs`, and fresh
receipt/artifact path allocated by caller before launch. Do not edit docs/spec,
manifests or runtime logic. Read only the affected consent paragraphs and this brief.

Add visible text next to warmup consent in each prototype:

> В тестовой переписке другой участник увидит ваш адрес отправителя, служебные заголовки и тестовый текст в своём почтовом клиенте. Частные кампании, контакты и пароли другим участникам недоступны.

Correct blanket cancellation wording next to consent and queue explanation:

> Отзыв разрешения отменяет задания в очереди. Уже переданная на отправку попытка может завершиться; следующие письма будут остановлены.

This user wording denotes durable final submitting boundary; do not expose SQL
or internal advisory-lock terminology in the product. Preserve demo labels and
unchecked separate consent controls. No functional state-machine rewrite.

Run static HTML/JS/reference validation and focused browser text visibility,
keyboard/consent and390/1440 overflow checks via existing `codex-ui-playwright`
1.63.0. Earlier green browser receipts refer to old HTML hashes and remain preserved;
new text source needs new receipt/screenshot hashes. Don't claim backend semantics.
Preflight source snapshot/build/environment before actual E2E; fresh launch/trace
receipt includes launch digest. Commit Russian conventional message, no coauthor.

## Fresh Astra revalidation — 8 minute bound after copy integration

Read original six findings, corrected Specification/Pseudocode sections and
linked plan/Architecture/Completion/ADR, both BDD catalogs, updated consent text
and fresh rendered evidence. No repository resurvey or unrelated polish. Determine
whether each counterexample is closed, particularly all stop-writer shared-lock
discipline, reverse in-flight ordering, rescan high-water completion and semantic
count, and required local payment success. Re-evaluate exact source digests.
Output separate `docs/validation-recheck-report.md` and unique source-bound receipt;
first line `**Verdict:** ...`. Original report stays historical. If ready, coordinator
updates canonical validation-report index to cite both rounds before Phase3.

Pending: copy Sol follow-up, independent revalidation, toolkit, product implementation.
Owner autonomy remains approved; no repeated plan permission requested.
