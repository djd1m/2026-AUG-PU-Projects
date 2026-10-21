# f05-evidence-billing-growth — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f05-evidence-billing-growth-001

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-001`, legacy `AC-A1`. Exact acceptance paragraph:

> AC-A1: server-owned free/team config; TESTteam100minorRUB30days immutable; no clientamount/currency/duration override. Free limits3mailboxes/3activecampaigns, team10/10, currententitlement checked transactionally on creatingmailbox/startingnewcampaign. Expiry doesn't delete existing resources; existingover-limit read/pause/edit allowed, newcreation/activationdenied untilunderlimit. Duplicateactive start idempotent. No tariff raises hardmailquota30 orremovesunsubscribe/consent. API returns limits/mode/TESTlabel; unauthorized401/foreign404/Origin preserved. Existing testfixtures may explicitlyfixturegrant team where test needscapacity, never weaken safety assertions.

```gherkin
@AC-f05-evidence-billing-growth-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the server evaluates current entitlement while creating a mailbox or starting a new campaign under serialized resource admission for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: server-owned free/team config
  And the unchanged contract assertion holds: TESTteam100minorRUB30days immutable
  And the unchanged contract assertion holds: no clientamount/currency/duration override.
  And the unchanged contract assertion holds: Free limits3mailboxes/3activecampaigns, team10/10, currententitlement checked transactionally on creatingmailbox/startingnewcampaign.
  And the unchanged contract assertion holds: Expiry doesn't delete existing resources
  And the unchanged contract assertion holds: existingover-limit read/pause/edit allowed, newcreation/activationdenied untilunderlimit.
  And the unchanged contract assertion holds: Duplicateactive start idempotent.
  And the unchanged contract assertion holds: No tariff raises hardmailquota30 orremovesunsubscribe/consent.
  And the unchanged contract assertion holds: API returns limits/mode/TESTlabel
  And the unchanged contract assertion holds: unauthorized401/foreign404/Origin preserved.
  And the unchanged contract assertion holds: Existing testfixtures may explicitlyfixturegrant team where test needscapacity, never weaken safety assertions.
  Examples:
    | case | expected |
    | free3oractive3 /team10 /entitlementexpiresoverlimit /duplicateactivestart /clientpriceoverride | serverimmutableTEST100minorRUB30days; transactionalcreation-startlimits; expiredretainreadpauseedit denynewabovefreecapacity; activeidempotent; mail30/consent/unsubscribe unchanged; modeTESTlabel401404Origin intact |
```

## SC-f05-evidence-billing-growth-002

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-002`, legacy `AC-A2`. Exact acceptance paragraph:

> AC-A2: unique nonPII partnercode pertenant, owner-only status/aggregate endpoints; signed boundedpurpose-specific30daycookie landing /r/:code, invalid/inactivecodeexplicitrejection. Before checkout validexplicitcodewins, invalidexplicitcodeerrors no cookiefallback, otherwise validatedcookie; tampered/expiredcookie noattribution and explicitstatus. Selfreferraldenied, snapshots storepartner/code before providercreate. Cookieblocked validexplicitcodeworks. Deactivationafterintent doesn't rewrite frozen snapshot; firsteligibleconversionusesvalid-at-checkout snapshot, no rewardpromise.

```gherkin
@AC-f05-evidence-billing-growth-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the referral landing/checkout attribution selector verifies explicit code or purpose-bound cookie and freezes the partner snapshot for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: unique nonPII partnercode pertenant, owner-only status/aggregate endpoints
  And the unchanged contract assertion holds: signed boundedpurpose-specific30daycookie landing /r/:code, invalid/inactivecodeexplicitrejection.
  And the unchanged contract assertion holds: Before checkout validexplicitcodewins, invalidexplicitcodeerrors no cookiefallback, otherwise validatedcookie
  And the unchanged contract assertion holds: tampered/expiredcookie noattribution and explicitstatus.
  And the unchanged contract assertion holds: Selfreferraldenied, snapshots storepartner/code before providercreate.
  And the unchanged contract assertion holds: Cookieblocked validexplicitcodeworks.
  And the unchanged contract assertion holds: Deactivationafterintent doesn't rewrite frozen snapshot
  And the unchanged contract assertion holds: firsteligibleconversionusesvalid-at-checkout snapshot, no rewardpromise.
  Examples:
    | case | expected |
    | explicitvalidcodeversuscookie /invalidexplicitwithvalidcookie /blockedcookie /selfinactive /deactivateafterintent | explicitvalidwins,invaliderrorsnofallback; boundedpurpose30dayHMACnonPIIcookie; selfinactive denied; snapshotbeforeproviderimmutableevenafterdeactivation; firsteligibleconversion norewardclaim |
```

## SC-f05-evidence-billing-growth-003

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-003`, legacy `AC-A3`. Exact acceptance paragraph:

> AC-A3: session/Origin POSTcheckout acceptsclosedbody plan='team', clientidempotencykey8–128, optionalexplicitcode only. Unique(tenant,key) immutable plan/amount/currency/attribution/providerkey; changedpayload conflict409, identicalparallelrepeat oneintent/providerpayment. Existingproviderbinding reused notnewcreate onretry; crashafterprovidercreate beforebinding recoverssameprovideridempotencykey. Providercall outsideDBtransaction. Usabletestcheckout/status, notunavailable-only. Disabledmode503(orconsistenttypedunavailable) creates0providerstate/grants; no livefallback.

```gherkin
@AC-f05-evidence-billing-growth-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the owner POSTs checkout and the service creates/reuses the immutable intent/provider binding outside the database transaction for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: session/Origin POSTcheckout acceptsclosedbody plan='team', clientidempotencykey8–128, optionalexplicitcode only.
  And the unchanged contract assertion holds: Unique(tenant,key) immutable plan/amount/currency/attribution/providerkey
  And the unchanged contract assertion holds: changedpayload conflict409, identicalparallelrepeat oneintent/providerpayment.
  And the unchanged contract assertion holds: Existingproviderbinding reused notnewcreate onretry
  And the unchanged contract assertion holds: crashafterprovidercreate beforebinding recoverssameprovideridempotencykey.
  And the unchanged contract assertion holds: Providercall outsideDBtransaction.
  And the unchanged contract assertion holds: Usabletestcheckout/status, notunavailable-only.
  And the unchanged contract assertion holds: Disabledmode503(orconsistenttypedunavailable) creates0providerstate/grants
  And the unchanged contract assertion holds: no livefallback.
  Examples:
    | case | expected |
    | paralleltenantkeyidentical /changedpayload /crashafterproviderbeforebind /disabled | closedPOSTteam,key8..128,optionalcode; immutableuniqueintentamountcurrencyattributionproviderkey; onepaymentidentical;409changed; retryrecoversbindingoutsideDB; disabledtyped503zero providerstategrantnolivelastfallback |
```

## SC-f05-evidence-billing-growth-004

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-004`, legacy `AC-A4`. Exact acceptance paragraph:

> AC-A4: independentdurable localproviderfixture separatefromintent/entitlement, operator-only simulate pending→success/cancel and revocation/expiryteststate withmonotonicversion. Publicredirect/status/query/bodycannotwriteprovidertruth. Reconcilefetchcanonicalamountcurrencytenant/intentmetadata/status outsideapplicationtransaction; callbackmerelywake-up, authenticatedlocaladapter/operator route withboundedbody. Matchallimmutablefieldsbeforegrant. Serializeproviderfixturechanges/reconciliation commit or comparecurrentversionatomically torejectstalesuccessfetch aftercancel/expiry, noIOunderDBlock. Eventdedup cannotbypasscanonicalreverification.

```gherkin
@AC-f05-evidence-billing-growth-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the authenticated adapter/operator wakes reconciliation, fetches independent canonical provider truth and checks fields/version before commit for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: independentdurable localproviderfixture separatefromintent/entitlement, operator-only simulate pending→success/cancel and revocation/expiryteststate withmonotonicversion.
  And the unchanged contract assertion holds: Publicredirect/status/query/bodycannotwriteprovidertruth.
  And the unchanged contract assertion holds: Reconcilefetchcanonicalamountcurrencytenant/intentmetadata/status outsideapplicationtransaction
  And the unchanged contract assertion holds: callbackmerelywake-up, authenticatedlocaladapter/operator route withboundedbody.
  And the unchanged contract assertion holds: Matchallimmutablefieldsbeforegrant.
  And the unchanged contract assertion holds: Serializeproviderfixturechanges/reconciliation commit or comparecurrentversionatomically torejectstalesuccessfetch aftercancel/expiry, noIOunderDBlock.
  And the unchanged contract assertion holds: Eventdedup cannotbypasscanonicalreverification.
  Examples:
    | case | expected |
    | canonicalmatches /wrongamountcurrencymetadata /unsignednotification /delayedstalesuccessaftercancel | independentdurableoperatorprovidertruth/version; callbackwakeonlyboundedauth; canonicalfetchoutsideDB; matchimmutableallfields andversionserialization rejects stalecommit; publicredirectquerybody cannotgrant |
```

## SC-f05-evidence-billing-growth-005

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-005`, legacy `AC-A5`. Exact acceptance paragraph:

> AC-A5: atmostoneentitlementgrant perintent, fixedexpires_at=verifiedpaidAt+30days, no replayextension; currenttimeexpiryservertruth, canceled/revoked/expired cannotresurrectfromstaleevent. Attribution snapshot existedbeforegrant; atmostone firsteligibleTESTconversion perbuyertenant, duplicates/replays/self/tampered0fraud,2distincteligiblebuyers=>2aggregate. Nootherbuyeridentitiesrevealed. Concurrent/reorderedcanonicalevents anddelayedfetch barriers actualPG. Providerfixturefailure typed503 grants0.

```gherkin
@AC-f05-evidence-billing-growth-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When canonical reconciliation applies or rejects the unique grant/first-buyer conversion and current entitlement reads its fixed expiry/terminal state for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: atmostoneentitlementgrant perintent, fixedexpires_at=verifiedpaidAt+30days, no replayextension
  And the unchanged contract assertion holds: currenttimeexpiryservertruth, canceled/revoked/expired cannotresurrectfromstaleevent.
  And the unchanged contract assertion holds: Attribution snapshot existedbeforegrant
  And the unchanged contract assertion holds: atmostone firsteligibleTESTconversion perbuyertenant, duplicates/replays/self/tampered0fraud,2distincteligiblebuyers=>2aggregate.
  And the unchanged contract assertion holds: Nootherbuyeridentitiesrevealed.
  And the unchanged contract assertion holds: Concurrent/reorderedcanonicalevents anddelayedfetch barriers actualPG.
  And the unchanged contract assertion holds: Providerfixturefailure typed503 grants0.
  Examples:
    | case | expected |
    | duplicateororderedpayment /paidAtplus30days /revokedexpiredcanceled /twodistinctbuyers | onegrantfixedexpiryneverextended; currenttime/serverterminaltruthnoresurrection; frozenattributionbeforegrantfirsteligiblebuyerunique; fraudreplay0/twobuyers2countsnoidentities; realPGdelayedfetchbarriers; unavailabletyped503zero |
```

## SC-f05-evidence-billing-growth-006

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-006`, legacy `AC-A6`. Exact acceptance paragraph:

> AC-A6: actuallocalHTTPcheckout→operatorfixture success→canonicalfetch→oneTESTgrant+attributedconversion, cancel/expiry/redirect/mismatchnegativebranches allSC009/011/013. Type/lint/build/fullunit/realPG, meaningfultamperedcanonicalguardmutation+restoredgreen, rate/body/secretcanary/sourceimagebinding andfreshAstra. Reuse auditedN3/N6primitivepatterns withexactSHA/securityadaptationrecord; no unrelateddonorcode/docs. B later consumes authoritative entitlement/partnerinterfaces; Adoesnotclaimreportbadge yet.

```gherkin
@AC-f05-evidence-billing-growth-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized billing acceptance procedure drives HTTP checkout/operator canonical state/grant negatives and full mutation/regression/source/donor review gates for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: actuallocalHTTPcheckout→operatorfixture success→canonicalfetch→oneTESTgrant+attributedconversion, cancel/expiry/redirect/mismatchnegativebranches allSC009/011/013.
  And the unchanged contract assertion holds: Type/lint/build/fullunit/realPG, meaningfultamperedcanonicalguardmutation+restoredgreen, rate/body/secretcanary/sourceimagebinding andfreshAstra.
  And the unchanged contract assertion holds: Reuse auditedN3/N6primitivepatterns withexactSHA/securityadaptationrecord
  And the unchanged contract assertion holds: no unrelateddonorcode/docs.
  And the unchanged contract assertion holds: B later consumes authoritative entitlement/partnerinterfaces
  And the unchanged contract assertion holds: Adoesnotclaimreportbadge yet.
  Examples:
    | case | expected |
    | localHTTPcheckoutoperatorcanonicalgrant /redirectmismatchcancel-expiry /canonicalguardmutant | actualoneTESTgrantconversionandallSC009011013negative branches; fullunitPGtype/lint/buildratebodycanarysourceimage,freshAstra; donorSHAadaptationaudited, no unrelatedcopiedscope; badgeBnotyetaccepted |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.

## SC-f05-evidence-billing-growth-007

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-007`, legacy `AC-B1`. Exact acceptance paragraph:

> AC-B1: owner-only boundedmanualobservations require sourceURL/reference, observeddates, metric/unit/windows, rawvalue/denominator andexplicitmanualverification. NoexternalURLfetch; strictfinitevalues/direction/window validation, untrustedstringsescaped. Labelmanual/user-confirmed, notindependentproviderverification. Missingvalidobservation reputationunknown; SMTPaccepted/localfixturecounts separately no inventedscore/causalclaim.

```gherkin
@AC-f05-evidence-billing-growth-007 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-007
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the owner submits the bounded manually verified observation and the server validates/persists its private metadata for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: owner-only boundedmanualobservations require sourceURL/reference, observeddates, metric/unit/windows, rawvalue/denominator andexplicitmanualverification.
  And the unchanged contract assertion holds: NoexternalURLfetch
  And the unchanged contract assertion holds: strictfinitevalues/direction/window validation, untrustedstringsescaped.
  And the unchanged contract assertion holds: Labelmanual/user-confirmed, notindependentproviderverification.
  And the unchanged contract assertion holds: Missingvalidobservation reputationunknown
  And the unchanged contract assertion holds: SMTPaccepted/localfixturecounts separately no inventedscore/causalclaim.
  Examples:
    | case | expected |
    | validmanualinput /missingmanualcheckboxorNaNbadwindow /sourceURLwithsecret /noobservation | boundedownmanualobservations source-refdatesmetricunitdirectionrawdenominator; strictfinitevalidation0externalURLfetch; escapedstringsmanualuserconfirmednotproviderverified; unknownnoreputationfictionnocausality |
```

## SC-f05-evidence-billing-growth-008

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-008`, legacy `AC-B2`. Exact acceptance paragraph:

> AC-B2: comparability same source/metric/unit/direction/equalUTCwindowduration nonoverlap, latestage<=7days exactboundary, baseline<=28days beforelatest, nofuturedata. Strictdeclaredhigher/lower improvement; n<30 rawcountsonly, bothdenominators>=30forratios. Unknown/stale/incomparable/noimprovement explicitreason, shareblocked. Tenantbinding404foreign. Deterministic7days/7days+1ms/28days+1ms/29/30/badwindow tests allSC008-3.

```gherkin
@AC-f05-evidence-billing-growth-008 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-008
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the server compares the selected own observation pair using UTC windows, direction, freshness and denominator guards for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: comparability same source/metric/unit/direction/equalUTCwindowduration nonoverlap, latestage<=7days exactboundary, baseline<=28days beforelatest, nofuturedata.
  And the unchanged contract assertion holds: Strictdeclaredhigher/lower improvement
  And the unchanged contract assertion holds: n<30 rawcountsonly, bothdenominators>=30forratios.
  And the unchanged contract assertion holds: Unknown/stale/incomparable/noimprovement explicitreason, shareblocked.
  And the unchanged contract assertion holds: Tenantbinding404foreign.
  And the unchanged contract assertion holds: Deterministic7days/7days+1ms/28days+1ms/29/30/badwindow tests allSC008-3.
  Examples:
    | case | expected |
    | latest7daysor7days+1ms /baseline28days+1ms /equalnonoverlaporfuture /denominator29or30 /higher-lowerdirection | same sourcemetricunitdirectionequaldurationnonoverlapUTC <=7days<=28days; futureinvalid; strictdeclaredimprovement; nless30rawcounts,bothdenominators>=30ratios; deniedexplicitreasonsforeign404 |
```

## SC-f05-evidence-billing-growth-009

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-009`, legacy `AC-B3`. Exact acceptance paragraph:

> AC-B3: explicitauthenticatedPOSTshare selectsowncomparablepair, idempotencykey boundpayload. Createone randomopaqueanonymousreport/token andone shareevent; noautoemail/post. Publicprojectionwhitelist generatedtitle, constrainedmetric/unit/dates/rawvalues, privacy-safeprovenance (sourceorigin/manuallabel, omitprivateURLpath/query/reference); no emails/mailboxIDs/tenantIDs/credentials/contactfields/rawHTML. Privateinputsource/reference maycontain sensitiveinfo andmustnotpasspublic. No broad sanitizer guess replacesexplicitwhitelist. Authorizepair/recheckfreshnessatcreation, noforeignreads.

```gherkin
@AC-f05-evidence-billing-growth-009 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-009
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the owner explicitly POSTs share and the transaction rechecks the pair, idempotency payload and anonymous public projection for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: explicitauthenticatedPOSTshare selectsowncomparablepair, idempotencykey boundpayload.
  And the unchanged contract assertion holds: Createone randomopaqueanonymousreport/token andone shareevent
  And the unchanged contract assertion holds: noautoemail/post.
  And the unchanged contract assertion holds: Publicprojectionwhitelist generatedtitle, constrainedmetric/unit/dates/rawvalues, privacy-safeprovenance (sourceorigin/manuallabel, omitprivateURLpath/query/reference)
  And the unchanged contract assertion holds: no emails/mailboxIDs/tenantIDs/credentials/contactfields/rawHTML.
  And the unchanged contract assertion holds: Privateinputsource/reference maycontain sensitiveinfo andmustnotpasspublic.
  And the unchanged contract assertion holds: No broad sanitizer guess replacesexplicitwhitelist.
  And the unchanged contract assertion holds: Authorizepair/recheckfreshnessatcreation, noforeignreads.
  Examples:
    | case | expected |
    | parallelshareownpair /changedkeypayload /foreignpair /privateURLquerycontactfields | explicitPOSTfreshcomparable recheck oneopaqueanonymousreportoneevent idempotent; completepublicwhitelistprivacy-safeoriginmanual label,omitprivatepathqueryrefemailIDscredentialsrawHTML; noautoemailpost |
```

## SC-f05-evidence-billing-growth-010

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-010`, legacy `AC-B4`. Exact acceptance paragraph:

> AC-B4: public report dynamicallyconsultscurrentserverentitlement onEVERYview; free/expired/revokedreturnsonevisibleN7sourcebadge, paidTESTteammayhide, paid=true/clientflagsignored. Immutablehistoricalsnapshot retainsrawvalues/provenance; onstaleview labelhistorical anddisablecurrentimprovementclaim, notfalselyfresh. Sharingneverremovesunsubscribeinmailrenderer. Accessiblepublicreport HTML noactiveusercontent, opaque404unknown/revoked token, noPIIcanaries.

```gherkin
@AC-f05-evidence-billing-growth-010 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-010
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the public report handler renders the snapshot using current server entitlement, freshness and token state for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: public report dynamicallyconsultscurrentserverentitlement onEVERYview
  And the unchanged contract assertion holds: free/expired/revokedreturnsonevisibleN7sourcebadge, paidTESTteammayhide, paid=true/clientflagsignored.
  And the unchanged contract assertion holds: Immutablehistoricalsnapshot retainsrawvalues/provenance
  And the unchanged contract assertion holds: onstaleview labelhistorical anddisablecurrentimprovementclaim, notfalselyfresh.
  And the unchanged contract assertion holds: Sharingneverremovesunsubscribeinmailrenderer.
  And the unchanged contract assertion holds: Accessiblepublicreport HTML noactiveusercontent, opaque404unknown/revoked token, noPIIcanaries.
  Examples:
    | case | expected |
    | freepaidexpiredrevokedentitlement /forgedpaidflag /stalesnapshot /unknownrevokedtoken | EVERYviewcurrentserverbadge exactlyonefreeexpiredrevoked,TESTpaidmayhide; rawimmutablehistoricalsnapshotlabelstale nofreshclaim; opaque404token,accessibleinactiveHTML0PII; mailunsubscribestays |
```

## SC-f05-evidence-billing-growth-011

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-011`, legacy `AC-B5`. Exact acceptance paragraph:

> AC-B5: partnerpanelownaggregate events(counts onlyunder30), twoeligibleconversionscount2, duplicates0, foreigntenant404/noidentities. Shareeventcopy/link UIseam explicit andidempotent, metricprovenanceandTESTconversionlabelspreserved. Serverpagination bounds histories/reports/events. No fabricatedgrowth/reputation/socialproof.

```gherkin
@AC-f05-evidence-billing-growth-011 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-011
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the owner queries partner/report history or explicitly records a copy/link event against bounded aggregate storage for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: partnerpanelownaggregate events(counts onlyunder30), twoeligibleconversionscount2, duplicates0, foreigntenant404/noidentities.
  And the unchanged contract assertion holds: Shareeventcopy/link UIseam explicit andidempotent, metricprovenanceandTESTconversionlabelspreserved.
  And the unchanged contract assertion holds: Serverpagination bounds histories/reports/events.
  And the unchanged contract assertion holds: No fabricatedgrowth/reputation/socialproof.
  Examples:
    | case | expected |
    | twoeligibleconversionsorreplay /foreignpanel /repeatcopy-link /historyoverflow | owncountsaggregate2/replay0,under30countsnoidentities; explicitidempotentshareeventsboundedpagination; TESTandprovenancepreserved; nofakegrowthreputation |
```

## SC-f05-evidence-billing-growth-012

Source: `01_specification.md` heading `AC-f05-evidence-billing-growth-012`, legacy `AC-B6`. Exact acceptance paragraph:

> AC-B6: realPG/API(publicreportHTTP) source-boundallSC008/010/012/013, concurrencyshare/dedup andentitlementexpiry/revocation races, meaningfulshareguardorbadgepredicate mutantRED/restoredGREEN, fullregression/type/lint/build/securitysourceimageproof+freshAstra. FullcabinetPlaywrightF06stillmandatorylater; reportHTMLbackendtestsnotclaimwholeUX. EntireF05requiresA+B12/12.

```gherkin
@AC-f05-evidence-billing-growth-012 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f05-evidence-billing-growth-012
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized evidence acceptance procedure drives realPG share/badge races, relevant mutations and full regression/source/fresh-review gates for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: realPG/API(publicreportHTTP) source-boundallSC008/010/012/013, concurrencyshare/dedup andentitlementexpiry/revocation races, meaningfulshareguardorbadgepredicate mutantRED/restoredGREEN, fullregression/type/lint/build/securitysourceimageproof+freshAstra.
  And the unchanged contract assertion holds: FullcabinetPlaywrightF06stillmandatorylater
  And the unchanged contract assertion holds: reportHTMLbackendtestsnotclaimwholeUX.
  And the unchanged contract assertion holds: EntireF05requiresA+B12/12.
  Examples:
    | case | expected |
    | concurrentsharebadgeexpiryrevocation /share-badgeguardmutant /failedregression | realPG/publicHTTPallSC008010012013 source-boundraces,meaningfulRED/restoredGREEN,fullunitPGtype/lint/buildsecuritysourceimagefreshAstra; backendreportnotwholeUX,F06mandatory; entireF05both12 |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
