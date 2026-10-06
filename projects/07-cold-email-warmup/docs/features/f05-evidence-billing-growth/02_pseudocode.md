# F05 algorithms

### Algorithm: attribution-snapshot

REQUIREMENT: `AC-f05-evidence-billing-growth-002`

Attribution: validateexplicitcode ifsuppliedelseverifyboundedpurposeHMACcookie→rejectinactive/self→freeze partner/code snapshot in immutableintentbeforeprovidercreate. Sameidempotencykey withsameinputreturnsintent, changedinputconflict. PubliclandingonlysetsnonPIIsignedcookie andredirectstoownorigin, notopenredirect.

### Algorithm: checkout-resource-authority

REQUIREMENT: `AC-f05-evidence-billing-growth-001`
REQUIREMENT: `AC-f05-evidence-billing-growth-003`

Checkout: serverplan→transactionuniqueintent/snapshot→COMMIT→independentlocalprovidercreate(idempotency=intentID)→transactionbindsamepaymentonly. Retryalwaysreusebinding/canonicalpayment. Operatorfixturecanonicalstateversion transitionsindependentofintent/grant, noordinaryuserwrite.

Before creating a mailbox or starting a new campaign, apply the existing server-owned resource-limit procedure from legacy AC-A1: current entitlement under serialization, retained over-limit read/edit/pause, idempotent active start, and unchanged quota/consent/unsubscribe.

### Algorithm: canonical-reconcile-grant

REQUIREMENT: `AC-f05-evidence-billing-growth-004`
REQUIREMENT: `AC-f05-evidence-billing-growth-005`

Reconcile: authenticatednotificationwake→fetchcanonicalprovideroutsideapplicationtransaction→sharedbillingserialization/versionfence→match immutabletenant/intent/amount/currency→applylatestmonotonicstatus→uniquegrant plus firsteligibleconversion, snapshotbeforegrant. Canceled/revoked/expired revokes/notresurrect, expiryfixedverifiedpaidAt30days. Latefetchversioncannotoverwrite newerterminalstate. DonorN6transaction/networkseparationretained.

### Algorithm: manual-evidence-share-badge

REQUIREMENT: `AC-f05-evidence-billing-growth-007`
REQUIREMENT: `AC-f05-evidence-billing-growth-008`
REQUIREMENT: `AC-f05-evidence-billing-growth-009`
REQUIREMENT: `AC-f05-evidence-billing-growth-010`
REQUIREMENT: `AC-f05-evidence-billing-growth-011`

Evidence/share: validateprivateobservationmetadata→boundedownpairlookup→compareexactcanonicalwindows/freshness/direction→sharetransactionidempotency→storeanonymouswhitelistreportandshareevent. Publicrender computescurrententitlement/expiryandcurrentfreshness, includesonebadgeiffree; no clientflag authority. NoarbitraryURLfetch/sourcebodycopy. Sourceprovenancepublicoriginonly +manualverificationlabel, privateURL/referenceprivate.

### Algorithm: billing-evidence-verification

REQUIREMENT: `AC-f05-evidence-billing-growth-006`
REQUIREMENT: `AC-f05-evidence-billing-growth-012`

Verification binding: follow the unchanged conditions in `01_specification.md` for the claimed legacy verification AC, using the existing `05_completion.md` execution/acceptance procedure and historical `acceptance.md`. Run only the stage-authorized gates; source-bound historical results remain attached to their original receipts. This document repair executes no runtime gates and grants no new acceptance.
