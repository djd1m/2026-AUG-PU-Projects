# Anti-drift decisions — autonomous owner authorization

Owner permits code/spec correction by judgment after verification; every decision retained for review.

## DRIFT-003 — reusable viewer placement

Architecture initially places viewer in apps/web. Code canon deliberately refines to reusable @n8/viewer package with caller-owned asset resolution, no Next/SQL/API import. User explicitly requires reusable modules. Behavior unchanged; reject duplicated engine or donor business coupling. Space independent review and final browser tests verify. Canon frozen SHA70ae... retained.

## DRIFT-004 — Job idempotency scope (FND-D1)

Architecture SQL prose said project/key; normative SubmitAndRunProposal and actualDDL account/key replay before mutable eligibility. Correct Architecture prose to account/key so caller cannot reuse same key across anotherproject. Reject weakening SQL to contradictory project scope. Architecture before 5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee; after 1a902141862ccbfa411fb853460506a3238b8e6c10ba70a774ea1ba822f6b99c. Spec/Pseudocode/CJM unchanged. Narrow reviewer closure pending.

## DRIFT-005 — malformed cursor and SQL backing guards

FND-R1: Date.parse permits invalid PGcursor value0; code now strict timestamp/calendar with microseconds preserved, rejects400 before SQL. Production repo before 32b104a883accb4b0d9f72d1e003de00a11b989f796a5fa51d3c9363c434ac46; after 0d97a1276f8e95dc661c99e08d8dc50b7491592643d9cfcb1c6b202fcce72157. Added realPG+HTTP FND-R1 test; reject changing spec to allow503 for badinput. FND-R2/R3: Architecture requires unique AuditEvent.event_key and project-leading archive/history indices; add separate002-indexes.sql rather than changing immutable001 authorbaseline. Uniquegrowthkey supports RecordGrowth idempotency; final growth module must ONCONFLICT dedupe. Actual targeted tests and independent closure pending.

FND-R1 narrow closure found PG timezone+23 rejection despite Date.parse acceptance. Cursor producer now emits exact UTC ISO with6microsecond digits through to_char, validator accepts UTC ISO only; regression includes+23. Opaque cursor contract unchanged. FND-R2 is project-leading archive index; FND-R3 audit unique key+kind/time index. Initial draft log numbering corrected to actual independent reviewer IDs.

## DRIFT-006 — reusable project policy port (FND-D2)

Architecture named ProjectStore/pure caps, implementation initially exposed only concrete PgProjects with caps inline. Add genuine domain ProjectStore interface and pure capacity/page policies, implement in PgProjects. SQL owner predicates/locks/archive financial transactions remain repository-owned; moving SQL locks into domain would couple pure code to pg. Rejected meaningless delegation-only wrapper. Existing realPG cap/concurrency/page tests exercise policy through repository; independent narrow closure required.

## DRIFT-007 — explicit live request token overhead

SubmitAndRunProposal requires conservative complete-request ceiling with explicit rate overhead. Config initially lacked overhead field; design integration adds required positivebounded N8_AI_REQUEST_OVERHEAD_TOKENS (≤100000), no defaultlive value. Adapter request/credit caps remain unchanged. Real config mandatory-field/no-egress regression covers this addition; F3 independentreview includes touchedsharedconfig. Reject silently assuming zerooverhead.

## DRIFT-008 — always accessible measured plan (SPACE-R1)

SourceAC-space1 requires plan and3D; UI exposed plan onlyonWebGLfailure. Root SpacePanel now renders measured RoomPlan alongside3D for manualrooms, with explicit dimensions. GLB continues without inventedsemanticfloorplan. Focused UI SSRtest asserts plan present even when3D merelyloading; finalbrowser checks actualcanvas/plan. Reject weakening source to3Donly.

## DRIFT-009 — canonical upload/file/list contract (SPACE-R2)

Pseudocode API table retained multipart and nested file path while actual single-reader bounded uploader uses raw stream+kind/rights headers and owned /api/assets/:id[?original=1]. Correct table to implemented contract and complete≤50page lists. Guard/auth/Origin/quota/magic/deadline restrictions unchanged. Reject parser rewrite merely for obsolete table. Pseudocode before af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59; after 1d25bc13918dba5af5b6a483cacc1fa96ba4c3dfd324abcef67a0fb82c2847c8. Spec22keys65SC unchanged; sourceversions updated, independent narrowclosure pending.

## DRIFT-010 — stable typed error across Next/Node copies

Production E2E2 passed browser auth/plan/WebGL then malformedGLB unexpectedly503UNAVAILABLE; directNodeadapter samebytes returned422INVALID_ASSET. Replace class-identity-only HTTP/error check with stable Symbol.for n8.domain-error brand + strict typed guard. Unbranded lookalike remains generic503/redacted; new9-testHTTP suitepassedaftermissingimport correction. Reject accepting arbitrary status/message structural objects. Actual rebuilt image parser/photo roundtrip stillrequired beforeclosure; firstfailure evidenceimmutable.

## DRIFT-011 — immutable reserve fences live repricing (DESIGN-R2 HIGH)

IndependentrealPGprobe admitted100micro, restartedconfig rates/caps produced228micro ceiling butpreviousmarkauthorized. Code now ceilingNow≤savedreservedMicroUsd inadditioncurrentcap; otherwise predipatchfail/releasesbothledgers/credit, noPOST/re-reserve. ExactrealPGregression passes; reject silentlychangingconsent/reservation or weakeningmoneyguard.

## DRIFT-012 — GLB opaque material IDs (DESIGN-R1)

Spaceparser/export/viewer already use stable mesh:n:primitive:n IDs fromimmutableGLB, provider advertisedgeneric scan which validatorrejected. Use measured descriptor IDs inrequest; labels carry nofloor/wallsemantic, GLBfit/area remainunknown/unconfirmed. Exactrequest→validatorregressionpasses. Canonical wording scan describedsemanticunknown; formalannotationpending onceactivewriter finishes beforecanonhashupdates, notchangingfrozenwriterbaseline silently. Reject guessingwalls/floor ordiscardinggranular IDs.

## DRIFT-013 — catalog primitive inrenderprojection (DESIGN-R3)

Catalog allowscylinder butviewer renderedallboxes. Addoptional primitive onlytoViewerObject presentation projection, resolvefromimmutablecatalog inapp; actualcylinder mesh scaleswidth/depth/height and2Dellipse. PersistedstrictSceneProposal unchanged(no addedclientAIkeys); NullEnginegeometry/boundsregressionpasses. Actualapp projection/browser stillrequired. Reject replacingcatalogcylinderwithbox orchangingmeasurements.

## DRIFT-014 — design API prose matchesproved handlers (DESIGN-D1)

CorrectPseudocode table changeReason field, servercatalogID/source, exactpreview/consent submitbody, globalownedjobGET, restoreandempty-bodyapprove. Guards,immutablegeometry/cost/consent criteria unchanged. Before1d25bc13918dba5af5b6a483cacc1fa96ba4c3dfd324abcef67a0fb82c2847c8;after407824005319b4ba4fe6d4a83fcdfdb33d7d1005a1b138c916088891a9ea1d1d; sourceversionsupdated. Reject backwardaliasparser that hideswrongcanonicalAPI. Independentnarrowclosurepending.

## DRIFT-015 — refunded derivative generic download bypass
Independent BILLING-R1 reproduced paid_export=false/billing_hold=true plus generic asset200. Decision: code correction, reject every share_image on ordinary /api/assets/:id (including original=1); prepared exports use dedicated entitlement-aware route. No spec relaxation. Paid access checked again on download/publication. Original probe and author/review evidence preserved; independent closure pending.

## DRIFT-016 — procurement PR-01 through PR-08
Applied seven manifest-verified author corrections against independent review411d6c1aea34c7355279afbab4baf5f3c52274e642a176ce14c4bf2f1df5f68a. Code corrected: local Decimal80 exact ceil; 1e12 line cap/piece-only objects; immutable parent/delta reserve configuration; CAS quantity edits; replacement next selection; named CSV money columns; pre-SQL typed ownership/coverage/catalog capacity; unknown phase subtotal order independence. Specification kept. Rejected masking unknowns or weakening monetary boundaries. Focused30tests and precision mutation accepted by author; independent closure pending.

## DRIFT-017 — non-root image source ownership
Actual image2 compile passed, migrationEACCES /app/package.json. Root optimization runtime-onlychown broke preserved0600 sourcefiles. Decisioncodefix COPY --chown=node:node for everysource/manifest layer, retainUSERnode; rejectrootruntime/hostchmodsecrets. Freshimage3 execution required.

## DRIFT-018 — production parser worker URL rewriting
ActualE2E3 repeated503 despite stricterrorbranding. BuiltNextchunk rewrites newURLworker to WebpackrelativeURL. Decisioncodefix Nodepathjoin+dirname(import.meta.url), rejectWebpackstaticURLfork and rejectweakening422AC. Directparserchecksplusnewproductioncontainer required; earlierbrandinghypothesis nottreatedruntimeclosure.

## DRIFT-019 — sharing bounded page contract
Independent F6 reviewer confirmed LIMIT64/100 unpaged lists violate inherited≤50/page. Codecorrected sharedownedtuplepagination51→50+nextCursor, ineligible/foreign cursor404, no droppedrows. Existing arraytest adapted to page.items withunchangedprivacyassert; added52-row fullcoveragefixture. Spec kept.

## DRIFT-020 — F7 benchmark unknown workload and worker storage parity
Independent reviewer found original200 fixture allknown despiteSC0242 requiredunknown case, andactualnodeworker started with0500assets. Codecorrected finalbenchmarkvariant keeps200lines withoneunmatched object (known67090000,reserve6709000,scenarioNULL,unknown1,golden e859e7593e7ec83599a7f41435ef6db7a337f0cb481a808626b9485629706aee), originalfixture/golden retained ashistoricalauthor measurement. Worker boot and10s sticky maintenance nowreuse exactwebschema/storage R/W/X/free-space/currentratescheckReady gate; no dispatchwhilefailed. Rejectspecweakening/rootworker. Actualindependentclosure pending.

## DRIFT-021 — mandatory UI review corrections
UI reviewer confirmed AssetUpload errorRef scope caused image4 TS2304; giveupload itsownerrorref/effect, preservetypedinput. SavedGLB editor incorrectlyreturnedmanual/blankanchors; hydratesmode, asset, anchors, measuredsegments/tolerance/floorarea fromcurrentimmutableShell andkeysformbyShellID, retainingdraftonerror. Productreplacement oldloadclosure could overwritenewdraft; removeoldmanualreloadafterparentrefresh, cancelstaleownedloads andcommitdesign/products/lines together. Jobs postsubmitpagination usescorrectcursor key. Rejectspecweakening. Narrowactualbrowser/typecheck/buildproof required.

## DRIFT-022 — remaining read lists and current cart scope
Coordinator found catalogGET returned≤100 unpaged versusNFR≤50/page, andProductsPanel loadedall historical shoppingline clones into500-rowclientcollector: permittedmultiple designrevisions could exhaustit. Codefix catalog afterUUID50pages; internalProject.sceneCatalog remainsfull≤100 atomicaggregate forvalidation. Optionalstrict owneddesignId filter onlines pagedquery; frontendloads onlycurrentDesign≤200, preserveshistoryAPIdefaults. Reuseexistingownedtuplepagination/currentProjectIDs; no newpagingengine orspecweaken. Foreign/ineligiblecursor404, crossprojectdesign404. Tests+narrowindependentclosure required.

## DRIFT-023 — distinct consented AI intents while pending
UIreviewerraisedoneactivejob interpretation. Canon admission/concurrency explicitlypermitsdifferentUUID intents withinaccount/globalcaps; noone-activejob invariant. Decisionkeepindependentnewrequestspossible, eachfreshpreview/exactconsent, sameintent retrykeepskey. Rejectunaskedserial-only restriction; actualcap/idempotencytests remainmandatory.

## DRIFT-024 — provider-specific payment authenticity proof
Final documentation replaces obsolete not-implemented/spoof/replay/reorder pending labels with actual independent and full-regression offline proof. Keep provider API re-fetch + direct socket source and atomic monotonic ledger; reject invented HMAC support or modifying generic toolkit to force PASS. Generic raw-signature checker remains explicitly inapplicable exit2; live payment/provider delivery remain untested.

## DRIVER-025 — final keyboard actionability
Fresh E2E3 pressed Enter on a disabled approve button before async save finished: keyboard press does not await enabled actionability. Driver4 uses trial click solely to wait readiness, then native Enter. No product/spec changes or false PASS; failed3 receipt retained.

## DRIFT-026 — production export dependency resolution
Actual final-image E2E5 reached canonical export and returned INVALID_EXPORT. Compiled chunk4400 contains N8_SHARP_MODULE:9288: Webpack rewrote parent require.resolve('sharp') into a bundle module ID, so child Node cannot load native Sharp. Move fixed require('sharp') inside already isolated static decoder string and set child cwd to real adapter source directory using fileURLToPath+dirname (same proven production parser path pattern). Native module resolution runs in Node child, never compiler. Keep pixel/bytes/time/RSS/privacy limits unchanged; reject weakening export validation or fake successful screenshot. Failed image6 receipt retained; scoped tests, production image7 and independent closure required.

## DRIFT-027 — preserve input while saved budget hydration is delayed
Actual E2E6 and deterministic read-only delayed-GET probe reproduce saved-history hydration replacing actively edited works status and limit (estimate/12345 became confirmed/20000). Product correction: track dirty form input/select/change plus Add/Remove expense button capture; first hydration restores saved values only while untouched. Preserve history loading and typed-error focus; reject merely waiting in driver to hide real input-loss race. Red proof budget-hydration-red-1.json image7; green proof + narrow independent review required on image8.

## DRIFT-028 — exact privacy status for embedded design relations
Independent final composition reviewer found reference arrays use422 while literalSC0191 requires404 for unknown/foreign relationalIDs. Keep specification and strengthen consistent code: references/parent/product-catalog snapshot/nonnull shell/scene catalog reject404 NOT_FOUND without IDs; duplicate arrays or altered known dimensions remain422 validation errors. Jobs preserve replay-first semantics and owned-old-shell409, but establish shell ownership before stale mismatch rejection. Reject broad spec relaxation or only URL ownership proof. ExistingactualPgDesigns fixture reused for foreign+absent pairs, manualcreate/jobpreview/admission, withunchangedversion/catalog/pointers and no design/job rows. RED capturedforeign-reference422; focusedGREEN/affectedDesignsuite+independentclosure required.

## DRIFT-029 — explicitly authorized public HTTPS ingress
User authorized publication via sslip.io and Docker browser UI review on 2026-10-14. Override historical local-only scope for this release, preserving manual AI and payments off. Reuse existing project Caddy/Compose patterns. Trust only exact dedicated proxy socket172.29.8.2, overwrite a single client IP header after stripping spoofable ingress headers. Rate limits use rebuilt client address; billing source validation retains actual socket address. Keep DB/assets unexposed. Initial Docker dynamic-web/proxy collision fixed with explicit web172.29.8.3; official Caddy file capability needs only NET_BIND_SERVICE under cap_dropALL/no-new-privileges. Failed startup attempts retained, no DB recreation.

## DRIFT-030 — accessibility and readable budget presentation
Actual public Chromium/Firefox audit found text contrast4.35 below4.5 and budget metric label/value concatenation. Correct code with darker shared muted token, explicit metric grid/block spacing and Russian presentation of retained/costdelta labels; keep exact arithmetic formulas/history/calculation unchanged. Local N1 IntakeTabs and W3C GitHub manual-tabs example analyzed; extract reusable controlled Tabs with manual ArrowLeft/Right/Home/End focus, native Enter/Space activation and explicit tab/panel associations rather than adding a large UI dependency. Fresh actual-browser checks required. Frontend422 preservation tested with explicit injected response, separate from real server malformedGLB422. WebKit first attempt fails because test image lacks /etc/ssl/certs/ca-certificates.crt; install official Debian ca-certificates, preserve HTTPS validation. Do not ignoreTLSerrors or mark unexecuted WebKit pass. Literal liveCalls:0 removed from driver: manual/off and primary browser request guards are evidence, not a measured universal provider/network count.

## DRIVER-031 — scope frontend error assertion to its panel
Audit2 actual error rendered and retained input, but strict getByRole(alert) also matched Next.js route announcer. Correct test selector to active tabpanel alert; product unchanged. Preserve failedreceipt and use fresh audit3. Mount only exact public-ui-audit.mjs read-only in testcontainer to avoid reinstalling all browsers for a one-selector test fix; record actual runner SHA separately from unchanged146file production source/image binding. No TLS/AXE/keyboard assertion weakened.

## DRIFT-032 — dimensioned drawing without guessed geometry
User asks to avoid typing printed dimensions. Reuse existing private upload/parser slot/manual immutable room instead of a separate geometry engine. Offline OCR returns candidates, not inferred wall roles; owner selects units and dimensions then explicitly confirms room and openings. Optional original furniture does not imply automatic furniture extraction. Source image ownership/ready/rights is revalidated inside save transaction. PDF/CAD and irregular whole-apartment conversion remain explicit exclusions.

## DRIFT-033 — close OCR and mobile review findings
Independent code review reproduced area/scale false positives, far-away unit association and lost native timeout identity. Correct code and retain specification: include weak OCR context, exclude area/scale/date labels, bind only nearby same-line units, expose distinct bounded native failures. Independent UI review found tiny SVG labels, concatenated source text, ambiguous asset label and missing keyboard proof. Use fixed 14px HTML number markers, block source link, honest photo-or-drawing label; add real keyboard traversal/Enter test. Failed original attempts and receipts remain; no test/spec weakening.

## DRIFT-034 — Firefox results focus after committed render
Actual keyboard attempt5 timed out waiting for result-heading focus in Firefox. Earlier Chromium path passed; native select popup required explicit Escape in the driver, retained as failed attempt3. Product correction replaces requestAnimationFrame scheduling with a result-dependent effect, so focus follows committed result DOM. Driver waits for actual focus, never forces it; original red attempts remain. No specification relaxation.

## DRIFT-035 — explicitly authorized weekly provider ceiling
Owner chose to keep the existing10USD weekly OpenRouter key while applicationday caps remain5USD and jobcap0.10USD. Amend providerperiod contract only: explicit daily|weekly + positive safeinteger ceilingpair, absentboth preserveslegacydaily/globalday contract. Reject partial/blank/unknown pair, unlimited/overceiling/mismatchedreset and insufficient/inconsistent remaining metadata; retain includeBYOK=true. Applicationdaily ledger, uncertainholds, credits, scenevalidation andnoautomaticredispatch unchanged. Compose bare optional environmentvalues preserveactualabsence. Independent Astra plan/code review and negative weekly/daily tests required. Selected owneraccount received one idempotently audited operatortrialcredit; no blanket grant/paymentledger change. Actual live inference remains pending provider control verification, not claimed from offline tests.
