# Completion / release contract

Status: approved planning, correction N7-V01..06; independent revalidation pending. Three CJM prototypes have separate browser evidence. Product
implementation, production launch, real provider integration and payment acceptance
are not implied by documentation or successful prototype tests.

## Development gates

Phase 1 docs → deterministic trace/completeness checks → independent Phase 2
semantic validation → generated project-only toolkit → per-feature /next → /go.
XL plan checkpoint blocks dependent implementation until explicit owner approval.
Each feature carries RUN_ID, source revision, plan, checks and terminal receipt.

Mandatory acceptance: AC-N7-001..012 and all Specification FR/NFR. Required commands
must be established in project package scripts and executed against exact source.
Unavailable mandatory checks block delivery, not recorded as skip/pass.

## Deployment checkpoint

Before any container start: `bash scripts/check-port-conflicts.sh projects/07-cold-email-warmup`.
Compose uses only variable-defined loopback host port; PostgreSQL has expose and
no published port. Isolated project name/volumes/network; no edits to another
project or shared proxy. Fresh random runtime secrets and DB password, ignored env.

Plan deployment with source SHA, build image digest, rollback previous image,
backup/restore verification, migration direction and downtime expectation.
Ask owner approval only with reviewable concrete release. Live SMTP/IMAP credentials
and sends require separate approved provider and opt-in pilot; never enable by
presence of an env variable alone. Charges likewise separate.

## Handoff

PR targets current default `claude/install-npm-packages-n7l3m5`; do not create main.
Russian conventional commits after logical milestones, push feature branch,
no Co-Authored-By. Include verified UI links, source/build, checks, remaining
limitations, elapsed and available usage/cost. Unknown counters remain null.

Seven-day target is monitored only after accepted pilot start; no background
automation or retention claim implied. Completion means all accepted scope AC
pass, not merely all documents exist.

Local billing acceptance REQUIRES configured fake provider success: immutable
price/attribution, canonical state fetch, duplicate/reordered event tests, one
entitlement grant. Unavailable is a negative test only. Real provider activation
and real money stay deferred; no paid conversion metric is inferred from fixtures.
Privacy acceptance tests both disclosed peer headers/test body and forbidden
private data/API access. Stop safety acceptance covers BOTH lock orderings at
final submitting commit for every stop writer.
