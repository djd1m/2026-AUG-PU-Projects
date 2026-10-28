Обновление после исследования: https://support.clipmkr.ru работает, General Root URL и N5_SUPPORT_BASE_URL переключены;105браузерныхпроверокпрошли. ВходSystem, пароль остаётся только в приватном config.env. Ниже сохранён исходный read-only срез до DNS-cutover.

# Libredesk owner access — 2026-10-28

Read-only inspection; no credentials copied, no authentication requests, no user/ticket/config/DNS mutations.

- Open https://n5-help.194.85.249.105.sslip.io/ (GET 200). Direct /login returns 404; use root SPA entry.
- Local password login is enabled. Built-in setup account identifier is exactly `System` (case preserved), confirmed from the dedicated DB; no email delivery is required for this login.
- Password: host-private file `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/05-podcast-clips-opus/.env.n5-helpdesk-private/config.env`, variable `LIBREDESK_SYSTEM_USER_PASSWORD`. File and neighboring config.toml are mode0600. Owner should read locally; do not paste into chat/logs. No password value was read into tool output.
- Runtime own app/proxy/DB/Redis containers are running; DB/Redis healthy. Account aggregate: one vendor agent (built-in System), two visitors. A separate human Agent has not been created. System is intended for setup; owner can use it now, then create a minimally privileged human Agent for ongoing inbox work.
- N5 `support_operator` is a product-side role; it is separate from a Libredesk System/Agent account and does not grant portal access.

DNS check: host resolver returns no address for `help.clipmkr.ru` or `support.clipmkr.ru`; `clipmkr.ru` resolves to194.85.249.105. Product `/support` returns200. Current standalone operator portal uses temporary sslip.io origin. Existing recipe prefers `help.clipmkr.ru`; Libredesk subpath hosting has not been qualified.

Proposed next bounded task, requiring explicit publication/configuration authorization: bind `help.clipmkr.ru` A record to194.85.249.105; configure existing outer Caddy HTTPS host to reverse_proxy127.0.0.1:4191 with existing WebSocket/trusted-client-IP behavior; set Libredesk General Root URL and N5_SUPPORT_BASE_URL to new origin; review widget allowed website domain for clipmkr.ru; verify portal TLS/login, widget asset/WSS, synthetic visitor/reply/receipt and reload continuity. Preserve existing origin until accepted. No provider email/SMTP/DNS changes performed here.

Owner setup checklist after login: inspect General Root URL; inspect existing Live Chat inbox and widget origin (do not duplicate); keep mandatory pre-chat email disabled; add individual Agent and restrict inbox access; choose assignment/team/routing and business hours. SMTP, email inbox and Resend remain disabled pending owner's domain/configuration decision. Current System reply capability does not prove separate human Agent onboarding.

Source reviewed: `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/docs/libredesk-operations.md` and config example. No source/git changes.
