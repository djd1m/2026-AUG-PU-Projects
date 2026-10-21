# Live mail runtime and private transport operator

The opt-in worker runs accepted F09/F10 only. Use a coordinator-frozen immutable image digest in required N7_ACCEPTED_IMAGE for both web and worker. Preserve existing secrets/allowlist. Worker billing is disabled with no merchant mounts even when web billing is live. Never run legacy local-poll or manual ticks alongside the runtime loop.

Commands are data for the separately authorized release operator:

```
docker compose -f docker-compose.yml -f docker-compose.live-mail.yml config
docker compose -f docker-compose.yml -f docker-compose.live-mail.yml up -d --no-deps runtime-worker
node dist/mailboxes/transport-operator.js publish <tenant-uuid> <mailbox-uuid> <expected-transport-grant-revision> <private-grant-file>
node dist/mailboxes/transport-operator.js revoke <tenant-uuid> <mailbox-uuid> <expected-transport-grant-revision>
```

Launch requires reviewed source/build/image, encrypted off-host backup, preserved keys, migrations1–17, readiness and port-conflict preflight. Measure existing joined SIGTERM cleanup before setting deployment stop_grace_period. Health proves config/schema readiness only; inspect process/restarts, runtime_due.last_served_at and fresh complete poll separately.

Token comes only from validated private OPERATOR_TOKEN_FILE. Grant cap is16384bytes; existing exact fields are scope=transport, tenant, mailbox, capabilities (smtp_submit/imap_headers), smtpHost, smtpPort465/587, imapHost, imapPort993, mailboxTransportRevision, configFingerprint=transportFingerprint(providerAllowlist), expiresAt future<=24h. Expected revision is transport_grant.revision (or0), distinct from mailbox.transport_revision. Metadata/IDs must match.

Read/size/JSON/invalid grant failures go through the publisher and commit revoke before nonzero invalid_input_authority_revoked. Authentication, stale CAS and unrelated/missing IDs preserve authority. Success outputs only an opaque revision. Every publication invalidates scan completion/cancels queued+claimed jobs; it never starts/resumes a campaign. Errors never print raw input, paths, credentials or native DB messages.

Live acceptance remains pending: off-host backup destination, exact owner-saved Gmail sender/private app settings, working live TLS/AUTH, explicit grants/egress/capacity/consent, post-grant full poll<60s, SMTP250 and separate inbox receipt, ordinary reply stop over full approved follow-up window. Local verified_test and nonempty credentials are distinct from live AUTH. Preserve unknown-delivery no-retry/backoff. No substitute sender or automatic grant/start. Disable campaign/consent and revoke pilot grant as authorized at end. F11/merchant setup excluded. No deployment/provider traffic is evidenced by this preparation.
