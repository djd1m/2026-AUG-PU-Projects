# N7 secret management

ADR001 owner-approved SERVER AEAD supersedes client-only boilerplate: background worker
requires decryption. Distinct session/credential/unsubscribe keys,>=32decodedbytes,
external runtime injection. Key version and tenant/mailbox AAD are mandatory.
Never print env values, HTTP auth headers, credentials or LLM keys. .env* ignored except
.env.example containing names/placeholders only. No production key required by local MVP.
Rotation preserves versioned decryptability; unknown key version fails closed. Runtime
error canaries must remain absent from API/logs. Never place keys in dz learned store.
