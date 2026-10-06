# F08/F09 narrow primary capability preparation

Opened 2026-10-06 through web tool during independent legacy-document repair. No external sockets or library installation; this is not a live provider permission or runtime proof. Selected version source must still be inspected before dependent IMPLEMENT.

| Capability | Primary source and short quotation | Established boundary |
| --- | --- | --- |
| SMTP diagnostic AUTH without message | https://nodemailer.com/smtp — “authenticate without sending any message” | verify performs connection/TLS/auth, not acceptance for a sender. |
| SMTP mandatory STARTTLS | https://nodemailer.com/smtp — “Nodemailer requires a STARTTLS upgrade” | requireTLS must remain true with opportunisticTLS false. TLS hostname preserved when host is pinned IP. |
| SMTP explicit connected socket | https://nodemailer.com/extras/smtp-connection — “An already-connected socket to use.” | connection + secured documented; low-level login can run without send. |
| Immediate SMTP cancellation | https://nodemailer.com/extras/smtp-connection — “Closes the connection immediately without sending the QUIT command.” | use hard deadline plus close, not only inactivity timeout; precise pre/post DATA evidence remains unverified until pinned library source/fixtures. |
| IMAP auth, TLS hostname and immediate close | https://imapflow.com/docs/api/imapflow-client/ — “Establishes connection to the IMAP server and authenticates.”; “Closes the connection immediately without sending LOGOUT.” | secure/servername/tls, verifyOnly, readOnly EXAMINE, close documented. Pin host to validated IP, preserve hostname. Version-specific constructor/socket behavior and literal/header memory bounds need source/fixture verification. |

The obsolete URL https://imapflow.com/module-imapflow-ImapFlow.html returned404; current API link above was opened. SMTP inactivity timeout does not alone establish total30s bound. Protocol fixture with real TLS remains mandatory. No library version, source error.phase contract, or provider arrival meaning is inferred from documentation.
