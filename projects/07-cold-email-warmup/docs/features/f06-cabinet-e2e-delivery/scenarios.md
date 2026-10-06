# f06-cabinet-e2e-delivery — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f06-cabinet-e2e-delivery-001

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-001`, legacy `AC-A1`. Exact acceptance paragraph:

> AC-A1: public auth register/login transitions into protected/app; direct unauthenticated/app redirects signin. Accessible navigation across Overview/Mailboxes/Campaigns/Evidence/Billing/Partner. All displayed state comes from accepted APIs and survives refresh/relogin, no localStorage credentials/private state. Central request lifecycle: pending/empty/error/blocked states, actionable typed errors, buttons double-submit bounded; expired/revoked401 clears private DOM/state and returns signin. Abort/epoch fence prevents late requests from prior session repopulating private UI afterlogout/accountswitch. Current modelocal_test/disabled labels from server safe metadata, not fabricated live readiness.

```gherkin
@AC-f06-cabinet-e2e-delivery-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the user enters or reloads the protected cabinet, logs out/switches identity, or an asynchronous request resolves against the current epoch for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: public auth register/login transitions into protected/app
  And the unchanged contract assertion holds: direct unauthenticated/app redirects signin.
  And the unchanged contract assertion holds: Accessible navigation across Overview/Mailboxes/Campaigns/Evidence/Billing/Partner.
  And the unchanged contract assertion holds: All displayed state comes from accepted APIs and survives refresh/relogin, no localStorage credentials/private state.
  And the unchanged contract assertion holds: Central request lifecycle: pending/empty/error/blocked states, actionable typed errors, buttons double-submit bounded
  And the unchanged contract assertion holds: expired/revoked401 clears private DOM/state and returns signin.
  And the unchanged contract assertion holds: Abort/epoch fence prevents late requests from prior session repopulating private UI afterlogout/accountswitch.
  And the unchanged contract assertion holds: Current modelocal_test/disabled labels from server safe metadata, not fabricated live readiness.
  Examples:
    | case | expected |
    | passivevalidsignin /registerloginlogoutaccountschange /expired401orlateoldresponse | protectedappredirectunauthenticated; sixaccessibleAPIbackednavsections; persistentrefreshrelogin; pendingemptyerrorblockedtypeddoublesubmit; epochabortclearprivateDOM401/logout,lateoldneverrenders; no sensitivestorage,fabricatedmode |
```

## SC-f06-cabinet-e2e-delivery-002

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-002`, legacy `AC-A2`. Exact acceptance paragraph:

> AC-A2: real mailbox save/edit/limit1..30/quarantine controls, SMTP465or587/IMAP993 mandatoryTLS, secret inputs never populated fromAPI and cleared on success; defaultlimit10. Local verification explicitly TEST/no realconnection. Separate unchecked pool and campaign grants with current version/fingerprint, granted/revoked states rereadAPI. Pool disclosure explicitly senderaddress/routingheaders/testbody visible to peers, privatecampaigns/credentials protected. Save/registration do not consent. Revoke and quarantine explain already-submitting one possible in-flight attempt; cannot promise unsend. Seedpool waiting<2 honestaggregate, no fakeparticipants. Reply polling state/source/local labels/staleness visible, no browser-authenticated operator controls.

```gherkin
@AC-f06-cabinet-e2e-delivery-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the user saves/edits mailbox settings or explicitly grants/revokes consent/quarantine and reloads the authoritative state for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: real mailbox save/edit/limit1..30/quarantine controls, SMTP465or587/IMAP993 mandatoryTLS, secret inputs never populated fromAPI and cleared on success
  And the unchanged contract assertion holds: defaultlimit10.
  And the unchanged contract assertion holds: Local verification explicitly TEST/no realconnection.
  And the unchanged contract assertion holds: Separate unchecked pool and campaign grants with current version/fingerprint, granted/revoked states rereadAPI.
  And the unchanged contract assertion holds: Pool disclosure explicitly senderaddress/routingheaders/testbody visible to peers, privatecampaigns/credentials protected.
  And the unchanged contract assertion holds: Save/registration do not consent.
  And the unchanged contract assertion holds: Revoke and quarantine explain already-submitting one possible in-flight attempt
  And the unchanged contract assertion holds: cannot promise unsend.
  And the unchanged contract assertion holds: Seedpool waiting<2 honestaggregate, no fakeparticipants.
  And the unchanged contract assertion holds: Reply polling state/source/local labels/staleness visible, no browser-authenticated operator controls.
  Examples:
    | case | expected |
    | savesecretthenreload /uncheckedseparateconsents /campaignversionchanges /revokeafterfinal /pooloneparticipant | TLS465587993default10limit1..30maskedsecretneverprefilledclearedsuccess; TESTonly; exactscopeversionfingerprintgrantsreread; explicitpeerdisclosureprivatecampaignprotected; registration-save0consent; in-flightmax1honest; waitingrealaggregatepollprovenance |
```

## SC-f06-cabinet-e2e-delivery-003

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-003`, legacy `AC-A3`. Exact acceptance paragraph:

> AC-A3: actual campaign create/edit with1..5steps subject/body/delay>=24h and recipients<=100 with allowlisted personalization; usable labelled form/importlines rather than rawJSON editor. Missingfields/errorsvisible, escaped preview fromacceptedAPI, version/currentrecipientconsent independent. Start andpause callrealAPI, afteredits reloadnewversion/reconsent; startblocked actionableifconsent/mailbox/freshness/limits absent. Status/errors persistence and duplicate submission robust. Shared dailybudget and unsubscribe cannot be removed byUI; no UI send-bypass or simulated success.

```gherkin
@AC-f06-cabinet-e2e-delivery-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the user edits/imports the labelled campaign form, previews it and explicitly starts/pauses or reconsents after its version changes for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: actual campaign create/edit with1..5steps subject/body/delay>=24h and recipients<=100 with allowlisted personalization
  And the unchanged contract assertion holds: usable labelled form/importlines rather than rawJSON editor.
  And the unchanged contract assertion holds: Missingfields/errorsvisible, escaped preview fromacceptedAPI, version/currentrecipientconsent independent.
  And the unchanged contract assertion holds: Start andpause callrealAPI, afteredits reloadnewversion/reconsent
  And the unchanged contract assertion holds: startblocked actionableifconsent/mailbox/freshness/limits absent.
  And the unchanged contract assertion holds: Status/errors persistence and duplicate submission robust.
  And the unchanged contract assertion holds: Shared dailybudget and unsubscribe cannot be removed byUI
  And the unchanged contract assertion holds: no UI send-bypass or simulated success.
  Examples:
    | case | expected |
    | boundedformimport /missingfieldhostilepreview /startabsentguard /editv2reconsent /reloadpause | ordinarylabelled1..5steps100recipientsdelay24hallowlist; escapedauthoritativepreviewerrorsvisible; versionandrecipientconsentseparate; realstartpauseAPIblockedreasons,currentversionreload; sharedbudgetunsubscribekept0bypass0simulatedsuccess |
```

## SC-f06-cabinet-e2e-delivery-004

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-004`, legacy `AC-A4`. Exact acceptance paragraph:

> AC-A4: owner manual observation form source/ref/UTC windows/metric/direction/numerator/denominator/manualcheckbox, real saved history; compareownselectedpair throughAPI. Unknown/stale/incomparable/noimprovement displayed andshareblocked; raw smalln/ratio rule visible. Explicit create report returnsrealopaque link; copy/open event explicit/idempotent, revoke works. Publicreport opens actualserverHTML, noprivateprovenance echoed. No AI inference/provider reputation or causal promise. Private form values rendered via textContent/escapedtemplates, no untrustedinnerHTML.

```gherkin
@AC-f06-cabinet-e2e-delivery-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the user saves manual observations, compares their own pair and explicitly shares/copies/opens/revokes its public report for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: owner manual observation form source/ref/UTC windows/metric/direction/numerator/denominator/manualcheckbox, real saved history
  And the unchanged contract assertion holds: compareownselectedpair throughAPI.
  And the unchanged contract assertion holds: Unknown/stale/incomparable/noimprovement displayed andshareblocked
  And the unchanged contract assertion holds: raw smalln/ratio rule visible.
  And the unchanged contract assertion holds: Explicit create report returnsrealopaque link
  And the unchanged contract assertion holds: copy/open event explicit/idempotent, revoke works.
  And the unchanged contract assertion holds: Publicreport opens actualserverHTML, noprivateprovenance echoed.
  And the unchanged contract assertion holds: No AI inference/provider reputation or causal promise.
  And the unchanged contract assertion holds: Private form values rendered via textContent/escapedtemplates, no untrustedinnerHTML.
  Examples:
    | case | expected |
    | manualsourcecompareownpair /unknownstalenotimproved /explicitsharecopyrevoke /hostilestring | realpersistedmanualUTCmetricdirectionrawdenomwindowsform; reasonsandrawsmallnvisible; shareguardrealopaqueURLpublicserverHTML privateprovenanceomitted; textContentescaped noXSS; no AI/provider/causalclaims |
```

## SC-f06-cabinet-e2e-delivery-005

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-005`, legacy `AC-A5`. Exact acceptance paragraph:

> AC-A5: billing currentfree/teamlimits+expiry+TEST100minorRUB30days, disabled typedunavailable. Explicitpartnercode beforecheckout (cookie fallback statusvisible), retryusesstableidempotencykey untilpayloadchange; actualownerintent/status shown, no clientpaidflag authority or mocksuccess. TEST canonical success remainsoperator-only outsidebrowser; UIrefreshreflectsrealgrant. Partnercode create/deactivate/link andcounts-only TESTaggregates no fabricatedreward, share/copy/link histories bounded. Usercan copycode/link with clipboardfallback.

```gherkin
@AC-f06-cabinet-e2e-delivery-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the user retries/refreshes TEST checkout or activates/deactivates/copies their partner code while an operator changes canonical fixture state outside the browser for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: billing currentfree/teamlimits+expiry+TEST100minorRUB30days, disabled typedunavailable.
  And the unchanged contract assertion holds: Explicitpartnercode beforecheckout (cookie fallback statusvisible), retryusesstableidempotencykey untilpayloadchange
  And the unchanged contract assertion holds: actualownerintent/status shown, no clientpaidflag authority or mocksuccess.
  And the unchanged contract assertion holds: TEST canonical success remainsoperator-only outsidebrowser
  And the unchanged contract assertion holds: UIrefreshreflectsrealgrant.
  And the unchanged contract assertion holds: Partnercode create/deactivate/link andcounts-only TESTaggregates no fabricatedreward, share/copy/link histories bounded.
  And the unchanged contract assertion holds: Usercan copycode/link with clipboardfallback.
  Examples:
    | case | expected |
    | TESTcheckoutstablepayloadrepeat /changedpayload /disabled /operatorcanonicalsuccessoutsidebrowser /partnercopyfallback | actualfree-teamlimitsTEST100RUB30daysstatusintent; stablekeyretrynotclientpaidflag; explicitcodecookievisible; operatorsecretabsent; refreshrealgrant; codeactivate/deactivatecountsTESTboundedhistorynofakereward; clipboardfallback |
```

## SC-f06-cabinet-e2e-delivery-006

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-006`, legacy `AC-A6`. Exact acceptance paragraph:

> AC-A6: implementationtype/lint/build/unit/fullPG and focused HTTP route/auth/staticsecurity tests; meaningful central401/sessionguard or relevant UIauthority mutation RED/restoredGREEN; serverassets CSP no thirdparty/untrustedinline JS. Modules<500lines, sameNodeTS stack, no newframework/deps. Source/build/image andsecrets/PIIcanary receipts. Fresh independentAstra A review; actualbrowser B remainspending until executed. Existingauth/backendtests retained or correctedonlywhencontractchanged, safetyassertionsneverweakened.

```gherkin
@AC-f06-cabinet-e2e-delivery-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized cabinet-source verification runs type/lint/build/full unit/PG/HTTP/static checks and a session-authority mutation with source/image/canary review for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: implementationtype/lint/build/unit/fullPG and focused HTTP route/auth/staticsecurity tests
  And the unchanged contract assertion holds: meaningful central401/sessionguard or relevant UIauthority mutation RED/restoredGREEN
  And the unchanged contract assertion holds: serverassets CSP no thirdparty/untrustedinline JS.
  And the unchanged contract assertion holds: Modules<500lines, sameNodeTS stack, no newframework/deps.
  And the unchanged contract assertion holds: Source/build/image andsecrets/PIIcanary receipts.
  And the unchanged contract assertion holds: Fresh independentAstra A review
  And the unchanged contract assertion holds: actualbrowser B remainspending until executed.
  And the unchanged contract assertion holds: Existingauth/backendtests retained or correctedonlywhencontractchanged, safetyassertionsneverweakened.
  Examples:
    | case | expected |
    | central401orsessionmutant /CSP-thirdparty /modulesover500 /missingruntimecanaryreceipt | type/lint/build/unit/fullPG focusedrouteauthstaticsecurity mandatory; meaningfulRED/restoredGREEN; CSPknownserverassetsnoinlineuntrustedthirdparty,moduleunder500sameNodeTSnonewdeps; exactsourcebuildimagecanaryPIIfreshAstra; Bbrowseronlyafterrealexecution |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.

## SC-f06-cabinet-e2e-delivery-007

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-007`, legacy `AC-B1`. Exact acceptance paragraph:

> AC-B1: actual existingDocker codex-ui-playwright@1.63.0 only; nohostbrowser install/newcontainer. Chromium real fulljourney at1440x900 and390x844, Firefox/WebKit criticalauth+cabinet+report smoke at390. Keyboard navigation/focus/labels, no unintendedhorizontaloverflow, reducedmotion, screenshots and console/pageerror checks; deterministic expectedservernegativeerrors classified nothidden. Source/build hashes and unique scripts/evidence path, companion ready preflight immediatelyBEFORE execution, globalUIflock andownnetworkattachment only withcleanup.

```gherkin
@AC-f06-cabinet-e2e-delivery-007 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-007
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized harness passes exact READY preflight, acquires shared UI flock and drives the stated viewport/engine/keyboard/screenshot matrix in existing Docker Playwright for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: actual existingDocker codex-ui-playwright@1.63.0 only
  And the unchanged contract assertion holds: nohostbrowser install/newcontainer.
  And the unchanged contract assertion holds: Chromium real fulljourney at1440x900 and390x844, Firefox/WebKit criticalauth+cabinet+report smoke at390.
  And the unchanged contract assertion holds: Keyboard navigation/focus/labels, no unintendedhorizontaloverflow, reducedmotion, screenshots and console/pageerror checks
  And the unchanged contract assertion holds: deterministic expectedservernegativeerrors classified nothidden.
  And the unchanged contract assertion holds: Source/build hashes and unique scripts/evidence path, companion ready preflight immediatelyBEFORE execution, globalUIflock andownnetworkattachment only withcleanup.
  Examples:
    | case | expected |
    | Chromium1440x900or390x844 /Firefox-WebKit390critical /keyboard-reducedmotion /errorconsole | existingDockerPlaywright1.63onlynohostnewcontainer; actualfulljourneyviewportnofullpageoverflowlabelsfocusscreenshots; deterministicnegativesclassifiednotmasked; exacthashpreflightREADYimmediatelybeforeexecutionUIflockownnetworkcleanup |
```

## SC-f06-cabinet-e2e-delivery-008

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-008`, legacy `AC-B2`. Exact acceptance paragraph:

> AC-B2: real browser actions register/login/addeditmailbox/separateuncheckedconsents/poolwaiting/campaignpreviewstartpause/observationscompareexplicitshare/publicreport/revoke/checkoutpartner; page reload provesserverpersistence. Local fixture prerequisites may be seeded by operatorCLI/DB fixture withexplicitTESTlabels outsidebrowser, no businessAPI mock/intercept or fake assertions. Harness drives actualacceptedpoll/scheduler/providerfixture code to show reply stop/complaint quarantine/unsubscribe and TESTpayment canonical success; browser neverreceivesoperatorsecret. FullAPInegativefixtures prove deniedactionzeroeffects, not UIvisualonly. PublicunsubscribeGETconfirms/POST stops idempotently andeachrenderedmessagebody+headers preserved fromacceptedbackend.

```gherkin
@AC-f06-cabinet-e2e-delivery-008 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-008
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the harness drives real cabinet clicks and reloads while trusted operator fixture code supplies reply/complaint/unsubscribe/payment prerequisites outside the browser for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: real browser actions register/login/addeditmailbox/separateuncheckedconsents/poolwaiting/campaignpreviewstartpause/observationscompareexplicitshare/publicreport/revoke/checkoutpartner
  And the unchanged contract assertion holds: page reload provesserverpersistence.
  And the unchanged contract assertion holds: Local fixture prerequisites may be seeded by operatorCLI/DB fixture withexplicitTESTlabels outsidebrowser, no businessAPI mock/intercept or fake assertions.
  And the unchanged contract assertion holds: Harness drives actualacceptedpoll/scheduler/providerfixture code to show reply stop/complaint quarantine/unsubscribe and TESTpayment canonical success
  And the unchanged contract assertion holds: browser neverreceivesoperatorsecret.
  And the unchanged contract assertion holds: FullAPInegativefixtures prove deniedactionzeroeffects, not UIvisualonly.
  And the unchanged contract assertion holds: PublicunsubscribeGETconfirms/POST stops idempotently andeachrenderedmessagebody+headers preserved fromacceptedbackend.
  Examples:
    | case | expected |
    | actualregisterloginmailboxgrantrevokecampaignsharecheckout /reload /operatorfixturestopspayment /unsubscribeGETPOST | realclickrealAPIpersistedDB0businessmocks; TESToperatortrustedfixtureoutsidebrowserdrivespollschedulerprovider; browsernooperatorsecret; negativefixturesdenied0effects; nativeGETconfirmationPOSTidempotentstops andrendererallbodyheaderspreserved |
```

## SC-f06-cabinet-e2e-delivery-009

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-009`, legacy `AC-B3`. Exact acceptance paragraph:

> AC-B3: two independenttenantcontexts; privatebox/campaign/evidence/reportIDsforeign404, no cross-tenantDOMdata; logoutoldcookie401 anddelayedoldsessionresponse cannotrepopulateUI; expired401state reset. Empty/loading/invalidinput/unavailable/blockedstates accessible atmobile anddesktop; no accidental auto-consent or real externaltransport. Async assertions use actualDOM/HTTPresponses durableproof, avoid fragile Chromium response.json bodyeviction and fixture ordering races. Browsernetworkno request/responseauthheaders or secret values inlogs/traces/screenshots.

```gherkin
@AC-f06-cabinet-e2e-delivery-009 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-009
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When two real tenant browser contexts perform foreign requests, logout/expiry and delayed-response/negative-state journeys for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: two independenttenantcontexts
  And the unchanged contract assertion holds: privatebox/campaign/evidence/reportIDsforeign404, no cross-tenantDOMdata
  And the unchanged contract assertion holds: logoutoldcookie401 anddelayedoldsessionresponse cannotrepopulateUI
  And the unchanged contract assertion holds: expired401state reset.
  And the unchanged contract assertion holds: Empty/loading/invalidinput/unavailable/blockedstates accessible atmobile anddesktop
  And the unchanged contract assertion holds: no accidental auto-consent or real externaltransport.
  And the unchanged contract assertion holds: Async assertions use actualDOM/HTTPresponses durableproof, avoid fragile Chromium response.json bodyeviction and fixture ordering races.
  And the unchanged contract assertion holds: Browsernetworkno request/responseauthheaders or secret values inlogs/traces/screenshots.
  Examples:
    | case | expected |
    | twoactualcontexts /foreignIDs /logoutheldoldresponse /expired401 /mobileofflineloadinginvalid | foreignboxcampaignobservationreport404noforeignDOM; revokedoldcookie401andepochpreventsrepopulate; allstatesaccessible390and1440; noauto-consentexternaltransport; durableactualresponsesavoidbodyevictionrace,logstracesscreenshot0authsecrets |
```

## SC-f06-cabinet-e2e-delivery-010

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-010`, legacy `AC-B4`. Exact acceptance paragraph:

> AC-B4: actual source-bound10concurrent authenticated localAPIrequests (>=100samples,excludingKDF/providerIO) measurep95<500ms target, disclose exactcommands/source/CPU2/environment/errors; noestimatedbenchmark. OwnCompose startuphealth/DBnoports/loopbackonly/randomkeys andsecretcanary pass. Fullrequiredchecks affectedbyfinalchanges; no unchangedgreen repeat. Fresh independentAstra validatesallAC/evidence andfinalsourcehashes, mutationable401guard/safety preserved.

```gherkin
@AC-f06-cabinet-e2e-delivery-010 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-010
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized harness measures at least100 authenticated API samples with10workers on CPU2 and verifies source-bound health/secret/regression evidence for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: actual source-bound10concurrent authenticated localAPIrequests (>=100samples,excludingKDF/providerIO) measurep95<500ms target, disclose exactcommands/source/CPU2/environment/errors
  And the unchanged contract assertion holds: noestimatedbenchmark.
  And the unchanged contract assertion holds: OwnCompose startuphealth/DBnoports/loopbackonly/randomkeys andsecretcanary pass.
  And the unchanged contract assertion holds: Fullrequiredchecks affectedbyfinalchanges
  And the unchanged contract assertion holds: no unchangedgreen repeat.
  And the unchanged contract assertion holds: Fresh independentAstra validatesallAC/evidence andfinalsourcehashes, mutationable401guard/safety preserved.
  Examples:
    | case | expected |
    | 100authenticatedsamples10workersCPU2 /requiredsourcebuildmismatch /knownfailedcommand | actualp95less500msexcludingKDFproviderIOwith exactdistributionerrorenvcommand; composehealthprivateDBloopbackrandomkeycanary; finalaffectedchecksandfreshAstraexacthash/mutation; reuseunchangedgreenonly |
```

## SC-f06-cabinet-e2e-delivery-011

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-011`, legacy `AC-B5`. Exact acceptance paragraph:

> AC-B5: canonicaldocs Markdown updated PRD/Specification/Architecture/ADR onlyifactualdecisions, Completioncurrentstatus, README Russian and README.en.md withlocalsetup/secretfiles/modes/operatorTESTflow/tests/limitations, pipeline-walkthrough.md completechronologyandcurrentartifacts. Source-reuseinventory/provenanceknown, no unrelateddocs copy. Exact12top-levelAC traceability to acceptedF01–F06 receipts includingruntime/browser; telemetry actualmodels/time/usageunknownnull,costunknown notestimated. Existingtoolkit verify with documented installed1.13.2/inheritedsymlinks preserved, no globalsettings/hooks/rootmutations. Documentationarchitecturecanonical docs/.

```gherkin
@AC-f06-cabinet-e2e-delivery-011 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-011
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized documentation workflow reconciles actual canonical decisions, bilingual setup/operator TEST guides, twelve accepted criteria/telemetry and unchanged inherited toolkit evidence for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: canonicaldocs Markdown updated PRD/Specification/Architecture/ADR onlyifactualdecisions, Completioncurrentstatus, README Russian and README.en.md withlocalsetup/secretfiles/modes/operatorTESTflow/tests/limitations, pipeline-walkthrough.md completechronologyandcurrentartifacts.
  And the unchanged contract assertion holds: Source-reuseinventory/provenanceknown, no unrelateddocs copy.
  And the unchanged contract assertion holds: Exact12top-levelAC traceability to acceptedF01–F06 receipts includingruntime/browser
  And the unchanged contract assertion holds: telemetry actualmodels/time/usageunknownnull,costunknown notestimated.
  And the unchanged contract assertion holds: Existingtoolkit verify with documented installed1.13.2/inheritedsymlinks preserved, no globalsettings/hooks/rootmutations.
  And the unchanged contract assertion holds: Documentationarchitecturecanonical docs/.
  Examples:
    | case | expected |
    | unchangeddecisiondocs /bilingualsetupoperatorTEST /missing12ACreceipt orusage /toolkitverify | updateactualdecisionsonlycanonicaldocs,Completion,READMEru/enwalkthrough chronology;12topACsource-boundacceptedruntimebrowserreceipts; telemetryactualmodelsdurationusageunknownnull; reuseprovenanceknowninstalled1.13.2inheritedsymlinks no globaltoolkitmutations |
```

## SC-f06-cabinet-e2e-delivery-012

Source: `01_specification.md` heading `AC-f06-cabinet-e2e-delivery-012`, legacy `AC-B6`. Exact acceptance paragraph:

> AC-B6: commit/push Russian messages noCoAuthoredBy, clean N7scope diff/secretcheck, create PR feature/07-cold-email-warmup→defaultclaude/install-npm-packages-n7l3m5; do notcreate main/changdefault. PR description concrete localMVPbehavior/tests/limitations +links, no claimliveproduction. Concrete deploymentplan checkpoint artifact ready ifrelease later but no deploy/proxy/realprovideractivation/charge. AllapprovedMVPcriteria done before finalhandoff; outstandingliveactivation explicitlyoutside acceptedlocalMVP. WorkinglocalURL canbeprovided while ownstackruns, notclaimpublicdeployment.

```gherkin
@AC-f06-cabinet-e2e-delivery-012 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f06-cabinet-e2e-delivery-012
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized delivery workflow checks clean scoped commit/push and attempts the required branch-target PR creation while retaining the deployment checkpoint and excluded live actions for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: commit/push Russian messages noCoAuthoredBy, clean N7scope diff/secretcheck, create PR feature/07-cold-email-warmup→defaultclaude/install-npm-packages-n7l3m5
  And the unchanged contract assertion holds: do notcreate main/changdefault.
  And the unchanged contract assertion holds: PR description concrete localMVPbehavior/tests/limitations +links, no claimliveproduction.
  And the unchanged contract assertion holds: Concrete deploymentplan checkpoint artifact ready ifrelease later but no deploy/proxy/realprovideractivation/charge.
  And the unchanged contract assertion holds: AllapprovedMVPcriteria done before finalhandoff
  And the unchanged contract assertion holds: outstandingliveactivation explicitlyoutside acceptedlocalMVP.
  And the unchanged contract assertion holds: WorkinglocalURL canbeprovided while ownstackruns, notclaimpublicdeployment.
  Examples:
    | case | expected |
    | validcommitpushtarget /GitHub403PRcreation /releasewithoutcheckpointorliveauthority | RussianmessagesnoCoauthorcleanN7secretscheck; PRonlyfeature07→claude/install-npm-packages-n7l3m5nevermain; concretebehaviorcheckslimitslinks;403meansPRnotcreatedcriterionnotmet; deploymentplanreadybutnoactualdeployproxySMTPIMAPcharge; acceptedlocalMVPallcriteria beforehandoff |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
