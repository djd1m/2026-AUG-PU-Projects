# N7 isolated mail library compatibility prototype

This experiment is confined to loopback TLS and synthetic messages. It does not migrate N7 or establish scheduler cadence, DB privacy, TTL, quota, consent, provider access, product regression or cost savings. The approved packet is `/tmp/n7-client-library-assessment-20261007/prototype-plan.md` (SHA256 `db13c414fd1a881f72db70cf87527cf7280a16ccd72198e9d44e36f5ff812b0b`).

Run with protected Node22.22.3 (product target remains22.20.0):

```sh
PATH=/tmp/n6b-f06-node22/bin:$PATH npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache
/tmp/n6b-f06-node22/bin/node --test test.mjs
```

Dependencies are exactly ImapFlow2.2.6 and Nodemailer10.0.15, with a private lockfile. No lifecycle scripts, pooling, retries, live mail or DB access. Each operation owns one child, a numeric127.0.0.1 endpoint, verified fixture.invalid SNI and TLS≥1.2. Tests confirm raw peer closure plus native child exit/close, then remove owned private-key directories. Public test CA certificates can be preserved in an explicitly supplied `N7_EVIDENCE` directory.

## Observed verdicts

**ImapFlow: FAIL for N7 compatibility.** Its public constructor exposes `maxLiteralSize`, `maxLineLength` and `maxResponseSize`. Both a64MiB advertised literal with a bounded prefix and an8MiB partial-ignoring stream fail with `LiteralTooLarge` before attacker-sized materialization. The numeric UID horizon, EXAMINE, PEEK partials, sparse UID, duplicate/out-of-range/no-tag rejection, metadata holds, UIDVALIDITY reset, TLS negatives and deadlines have executable witnesses. However `maxResponseSize` limits one assembled response. The aggregate counterexample sends1,100 reused small unsolicited OK responses, crosses the normative1MiB total receive envelope and still publishes a complete page. Its passing negative-witness test confirms this compatibility failure. The≤128KiB aggregate pending-buffer invariant remains unproven. No private parser hook or replacement parser was introduced.

**Nodemailer: INCONCLUSIVE for the complete gate; tested transport behavior passes.** The explicitly exported `nodemailer/lib/smtp-connection` supports one connection, one recipient, PLAIN after implicit TLS or required STARTTLS, exact raw MIME and single dot escaping. An exclusively owned public Readable supplies every MIME byte: before its first production, a disconnect is `not_accepted`; after production it is conservatively `unknown_delivery`. Library disposal may consume a source after refusal, so production alone never proves acceptance or a safe retry. Complete final250 alone accepts; explicit DATA/final4xx/5xx reject; dropped/truncated/final-trickled replies and slow-body abort remain unknown. Tests cover native joins and guard mutations. A distinct independently changed resolver/endpoint fixture, stalled/trickled auth and pre-first-byte body-abort matrix are still missing; no full S1/S5 compatibility PASS is asserted.

The small native suite can pass while mandatory compatibility fails or remains unknown. Its assertions intentionally preserve the aggregate failure witness. Both guard mutations run from temporary module copies and are deleted. The suite does not send raw MIME with a wire terminator or pre-applied dot stuffing.

Raw evidence: `/tmp/n7-mail-library-prototype-author-i1-20261007/`. Earlier failed fixture output is retained. Requested author setting is gpt-6.1-sol/medium; host-confirmed actual model, usage and cost are unavailable and recorded as null. Independent HIGH review is a separate stage. Combined library replacement is not recommended on this result.

Next bounded step: inspect a supported public transport receive/pending limit or reject ImapFlow adoption, and add only the missing SMTP/common scenarios before any complete local compatibility claim. Product integration requires its own authorized checks and delivery scope.
