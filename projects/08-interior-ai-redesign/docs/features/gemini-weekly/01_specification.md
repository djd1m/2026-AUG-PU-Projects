# Explicit provider limit period for Gemini live

Owner2026-10-14 requests keeping existing OpenRouter10USD weekly key instead of daily; N8 application caps5USD/day,0.10USD/job remain independently enforced. Target owneraccount received one idempotently audited trialcredit; never auto-grant allaccounts or change payment ledger.

AC-W01: New optional explicit providerLimitReset daily|weekly and providerCapMicroUsd pair; absent both retains previous daily/globalDayCap contract. Partial/blank/unknown/nonpositive/noninteger fields rejectstartup/requireLive. Dailycap<=applicationglobaldaycap; anyprovider cap>=jobcap.
AC-W02: verifyBudget compares observed reset and positivefinitecap to explicit expectedperiod/ceiling, sufficient remaining forjob; BYOK flag is not required for OpenRouter-credit funding (owner correction 2026-10-14). Weekly only ifexplicitconfigured; unknown/unlimited/resetmismatch/overcap/insufficientremain reject. No unlimitedmonthly or silentfallback.
AC-W03: Existing applicationdaily account/global caps, credits, holds, crossmidnight/concurrency/no-redispatch and scenegeometry protections unchanged. No schema/migration.
AC-W04: Config/adapter typedtests + meaningful negative weekly/daily cases, fullregression/type/lint/build and independent review. Live actualUI only afterverifiedkeycontrol; readiness is notpaidinference success.
AC-W05: .env.example/Compose/INSTALL explain period and explicit provider ceiling independently fromappdaily cap. Prior auditreceipts historicalsourcebound andnot rewritten.

Reuse: N8 existing loadConfig/requireLive/createOpenRouter/PgJobs and N6 provider limit pattern alreadypresent; primary OpenRouterTeam/docs structured-outputs and management-api-keys researched; no newSDK/dependency/framework. Rootsolewriter; independentAstra review.

Plan: normalize new pair inconfig; pure domain budgethelper validateslegacy+explicit; adaptremoteverificationonly; targetedtests; full247 baseline+newcases; build; sourcebind. Provider cap/period/remaining guards remain; BYOK inclusion is optional. Paidcalls awaitkeymetadata compatible.
