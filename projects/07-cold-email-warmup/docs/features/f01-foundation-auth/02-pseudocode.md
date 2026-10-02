# F01 algorithm binding

Use docs/Pseudocode.md Identity and credential boundaries steps1–3 unchanged.
HTTP bounds→Origin→normalizedinput→atomicDBratebuckets→KDFadmission→exactArgon2→
transactionaccount/sessiongrant→HttpOnlySameSite cookie. Logout revokes digest
before clearing cookie. Session lookups join active account/tenant; use one pg
transaction client. Randomopaque32byte session;>=32byte sessionHMAC key fromruntime.
Every mailbox query includes serverderivedtenant plus validatedUUID. Bootstrap
migration creates tenant/account/session/authbucket/minimalmailbox metadata schema.
No credentials/consent/transport columns silently count as implemented F02.
