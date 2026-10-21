# F02 reuse decisions

Source baseline d47f0cadf6b5b04efc9956ad9114743087ac2fbb; inventory read before crypto/network code.

- N3 `projects/03-affiliate-rewardful/shared/payments/yookassa.mjs`, last change `6775b833c306f93e45c7fd6b03c32e8585a56349`, SHA256 `4bf17f1be41dbb7d9ad235a94a36ca96aa9bd128492b14fccf0af2dd2cc21ccd`: adapt the bounded provider interface, typed error and deadline idea only. No billing code copied. Errors are fixed codes; raw provider text/cause is discarded.
- N6 `projects/06-rag-sales-chatbase/apps/web/src/server/ip.ts`, actual last change `c872f44dbfc97ebcb4dea239365a88508b8a980a`, SHA256 `db757f84b84e4d7ea0278457581fca731b7cfde38ea41e4229980162545bd2ce`: inspected and rejected as outbound safety donor. Its trusted proxy/IP-prefix semantics and mapped-address normalization conflict with mailbox SSRF rejection. New conservative public-IP classifier uses Node net validation, rejects mapped/reserved addresses and mixed unsafe DNS.
- F01 auth/session/errors/store helpers reused in-place; no auth algorithm edits. Server derives tenant and actor from authenticated identity.
- No suitable AEAD donor in bounded inventory: native Node AES-256-GCM, fresh 96-bit nonce, 128-bit tag, external versioned keys and JSON tuple AAD authored here.

Internal donor adaptations are owner-authorized; no repository-wide OSS license inferred. No broad package/docs/assets copies. No new dependencies. Local test adapter has no socket/send API; verified_test is a contract fixture result, never evidence of provider/inbox/reputation. Future live connector must consume pinned IP and TLS peername, enforce STARTTLS on 587, and remains disabled in this slice.
