# F01 donor adaptations

Source baseline `4947df93a610f98a0bae34a263ae51fa35127aee`; donor inventory baseline `3b84e9ef`.
Owner authorized internal reuse; no repository OSS license inferred. Only the five
listed source fragments below were read. No unrelated donor docs/assets copied.

| Fragment | Last-change SHA | SHA256 | Adaptation / rejected behavior |
|---|---|---|---|
| N3a `apps/web/src/lib/auth/password.ts` | e6bacf6ab1fdb1afc9795d7b90eab2a242d3f2e8 | 15e9ec01b1ff1f58299655663615bf31b95f2ce95be00b075cb3e6b9ef12891b | Native fixed Argon2id v19 m65536/t3/p1/out32 and Unicode/byte validation. Tightened accepted salt from16–64 to exactly16 bytes and canonical base64. |
| N3a `apps/web/src/lib/auth/kdf-admission.ts` | e6bacf6ab1fdb1afc9795d7b90eab2a242d3f2e8 | d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e | Two active native operations and finally release retained; FIFO8/timeout/abort queue rejected. N7 immediately503/Retry-After1 with queue0; no cancellation releases a running slot. |
| N1 `apps/web/src/lib/session.ts` | 1da81ea50d90ed0ab53be36c8156e04d26e42075 | 5f22ed53dc93ca1c775c101a59835f19459ab525f678e5298579c6ae54b32376 | random32byte opaque token and HMAC-SHA256 digest retained; donor30day TTL and16character key minimum rejected. N7 absolute7days, >=32decodedbytes external key, canonical43character token, HttpOnly/SameSite cookie. |
| N5 `apps/web/src/server/auth.ts` | 8da56bf1d5c9a04c0d192ad067ec16aeca573dc7 | 699076bf660eee46cfc1a3e67258cfc438219eabe958ce9d4b319816b438ead3 | AuthStore/service separation and short DB operations outside KDF retained. bcrypt/clipmaker/shared imports rejected; startup random Argon dummy makes absent-account login use the same KDF. Duplicate registration rolls back and grants no existing account. |
| N6 `apps/web/src/server/auth-store.ts` | e2e6d545c2c3dd2f549e2c9338ad5d7bdb20ec15 | 92bde38cef54de68b9b3e6be6c801738caf4c3cb3bda9068d49a049a7a096ecf | Conditional active-account/password-hash grant under FOR SHARE, durable revocation and lookup retained. Added active tenant predicate and tenant row lock; own schema, UUID session IDs, no partner/N6 package imports. |

All provenance paths above are rooted beneath the corresponding donor project in
`projects/`. N7 products are `src/auth`, `db/001-init.sql` and the F01 tests. Atomic
fixed UTC rate-bucket UPSERTs are N7-authored and retain attempts on429. Trusted IP
is the direct socket address; forwarded headers have no authority. No session
plaintext is persisted. Registration creates no mailbox or consent. Mailbox
metadata reads are only the tenant boundary fixture; mutations remain F02.

Third-party installed direct/transitive metadata and optional platform gaps are
recorded in [dependency-licenses.md](dependency-licenses.md). The lockfile pins all
versions/integrities. `npm audit` observed0 vulnerabilities at implementation time;
this is a registry snapshot, not a perpetual assurance.
