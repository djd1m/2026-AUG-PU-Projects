# F02 focused tests

SC-US-002-1..4 positive encryption and failure Examples; SC-US-003-1..3 persistence
and current-consent predicate; queued/claimed vs submitting revoke fixtures.
SC-US-003-4/5 complete stop-versus-final-submit race is F03, not claimed here.
Unit: AEAD roundtrip/tamper/swappedAAD/keyversion, secretcanary scrub, exactinput/
TLSport/host/IP classes/mixedDNS/rebinding revalidation and connector deadline.
PG: two tenants, maskedAPI+rawDBciphertext, registerednoauthority, distinctpool/
campaigngrants, modifiedcampaign recipients/version, withdrawal+queueatomicity.
Test realSQL rollback and shared-lock contention for F02 writers. No green suite
reruns without related server/config/schema changes; no hostbrowser.
CPU2 and /tmp/codex-heavy-build.lock for Docker/PG suites; acquire only when ready,
release after bounded run. Parent coordinates next available window N6→N8→N7.
