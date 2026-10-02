# F03b reuse inventory

Source SHA: 1c05004e47a245c953a359c89525487e2be79456.
Exact local donors only; no broad copying, new framework or external SMTP dependency.

| Donor | Decision | Adaptation / reason |
|---|---|---|
| src/consent/transaction.ts (F02) | reuse unchanged | exact lock(7,1) FIRST, short transaction |
| src/mailboxes/crypto.ts (F02) | reuse unchanged | versioned tenant/mailbox AEAD; only addresses passed to sink |
| src/mailboxes/store.ts cancelMailbox/change (F02) | reuse unchanged | actual atomic eligibility/limit/stop writers |
| src/consent/store.ts act/campaign (F02) | reuse unchanged | current consent/version and pool withdrawal writers |
| src/campaigns/store.ts openRecipient/recipientDigest (A) | reuse unchanged | purpose-bound AEAD and keyed recipient digest |
| src/dispatch/store.ts (A) | adapt | terminal retry expiry/outcome exclusions; preserve rotation sequence and derived quota |
| src/dispatch/eligibility.ts (A) | reuse unchanged | exact complete poll0<=age<60s and current pool consent predicates |
| src/dispatch/seams.ts (A) | adapt | minimal atomic complaint/quarantine effect, existing reply/suppress effects |
| scripts/check-f03a-heavy.sh / check-f03a-final.sh | adapt | own stack/runtime/port/grant, unchanged minute-bucket assertions |
| scripts/check-f03a-mutation.py / check-f03a-secrets.py | adapt | final-only freshness mutant, source restore/hash and own-stack canaries |
| db001–004 | reject edits | additive005 only; A acceptance/history immutable |
| socket transport/framework donors | reject | approved local sink is durable and socket-free; live disabled |

No key reuse for token hashing: unsubscribe tokens are independent32-byte random
capabilities, bound by durable SHA256 lookup rather than reusing session/AEAD keys.
