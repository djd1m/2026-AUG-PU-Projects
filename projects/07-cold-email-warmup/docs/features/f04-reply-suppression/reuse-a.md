# F04a reuse

Accepted F03 baseline `2ff44de2`, launch revision `64a093cc75eb4016a55e33196402ca84638bc811`.

| Existing N7 component | Reuse and compatibility |
|---|---|
| consent/transaction.ts | Exact global eligibility lock FIRST; no lock or transaction changes |
| dispatch/seams.ts | Extract client stop helper, retain wrappers and final submitting contract |
| campaigns/store.ts openRecipient | Exact existing versioned enrollment AEAD; no crypto/auth changes |
| mailbox_poll / send_job.message_id | Durable freshness gate and own-message reference lookup |
| db.ts migration registry | Add 006, preserve historical migrations |
| scripts/local-runtime.sh / compose | External key generation and isolated loopback runtime; no secret output or DB host ports |
| F03 PG tests / lock barriers | Preserve all old suites; new tests exercise the actual ReplyStore writer |

No external donor code, dependency, framework, root toolkit or historical evidence is modified. The requested `/tmp/n7-f03b-r1/.../node_modules` did not exist. Existing `/tmp/n7-f03b-sol/projects/07-cold-email-warmup/node_modules` is reused by ignored local symlink after identical package-lock SHA-256 verification (`49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a`); it is never pruned or changed by this unit. Container dependencies use the existing pinned lockfile.

Required tests: full type/lint/build/unit/PG regression, semantic-effect mutation RED followed by restored affected GREEN, runtime secret/header/body canary scan, host/image/copied-input hashes. Fresh independent Astra review remains the parent's gate; A implementation is not whole-feature acceptance. Browser and B public/protocol consumers are out of this unit's scope.
