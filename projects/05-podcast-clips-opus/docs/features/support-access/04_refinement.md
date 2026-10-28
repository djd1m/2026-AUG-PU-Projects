# Support access — refinement and adversarial checks
| Boundary | Concrete negative checks |
|---|---|
| Proof | Wrong purpose/account/current or issuing session; original logout; destination another device same account; expired during lock wait; replay; resend supersession |
| Reset | Unknown email same202; old password/session blocked; no new session/credits/proof; login/reset race; account erasing; bcrypt outside tx |
| Admission | Concurrent different emails same IP and different IPs same email; literal5/30/5 +60s; full10000 storage; Redis outage; no network while DB lock held |
| Transport | Missing/unknown mode, incomplete SMTP, test in production, invalid certificate, required STARTTLS absent, timeout/trickle, fifth concurrent send, ambiguous final reply; no retry or secret output |
| Staff | Anonymous/ordinary/revoked role+session, forged actor/role, membership revoke between layers, empty bootstrap, no public allowlist, privileged command actor/reason audit |
| Read DTO | Bound query/cursor; foreign/missing404; exact projections; no object key/media/token/hash; POST money writes rejected; no existing money path added |
| Widget | Unverified legacy same-email contact gets no JWT; two immutable accounts; no client user_id; observed account switch/logout; focus after reset; script unavailable; anonymous no N5 history lookup |
| Context | Foreign video vs missing404; no body actor; consent preview; deep link without staff404; arbitrary query/token does not authenticate |
| Retention | Local proof/tokens/mapping removed on erasure; client old identity cleared; remote10h session limitation plainly documented; real deletion/backups not claimed |
Mutation proofs required for NEW guards: remove proof account/session/purpose/expiry predicate;
remove single-consumer condition; bypass staff predicate; allow unverified JWT; bypass video
ownership; allow test in production; omit reset session revocation. Record red with injected
defect and green after restoration, exact source snapshot. Existing unchanged guards need
no ornamental rerun beyond mandatory full suite. PostgreSQL proves races; mocks do not.
Local vendor fixture is intentionally weaker than real Libredesk: validates request/claim
shape, failure branches, UI clearing and two-account application separation. It cannot prove
vendor contact matching, identity-required inbox behavior, remote revoke, messages/attachments
retention or actual operator reply. Those remain named pinned-pilot cases, not a false PASS.
Cross-device verify: login normally and reopen email link; never persist token across login.
For real use choose retention period/operator/contact and verify policy before sending PII.
