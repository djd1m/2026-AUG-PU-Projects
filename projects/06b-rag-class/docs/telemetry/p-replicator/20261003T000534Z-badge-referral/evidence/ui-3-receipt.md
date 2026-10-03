Run-ID: 20261003T000534Z-badge-referral
Work-Unit-ID: badge-referral-ui
Attempt-ID: ui-3
Source-Revision: c3d8cfcc3b3f1c61cc0998b378ecf2a677a7daff
Build-Revision: sha256:9bf6944d0ab3506b27e6237083e7ebf03d6bc28fb39fa64a00d257951747a3df
Launch-SHA256: a86961f94e70aa897e4c11f2b4e63dbf805c5d62e4da696189dea91e78cf4dc5
Finished-At: 2026-10-03T01:08:20.494Z
Verdict: pass

Actual Docker browser1440/390, six screenshots. Production w.js on foreign https://referral-host.test clicked its real badge, production302 to https://n6b-ui.test landing, HttpOnly/Secure/Lax/Path=/ cookie30days. Second touch retained original value and expiry, no new Set-Cookie; cache no-store. Actual registration stored first bot FK in PostgreSQL for both new accounts. Each registered account created/published its own bot via productionAPI; genuine widget loaded on existing foreign-origin test host markup and kept visible Free badge before and after authenticated removal intent. Test host HTML served via ordinary HTTP navigation by a tiny test-only Node server; no request routing/response mocks, no provider calls.

Intent200 with requestedpricecopy, repeatedrequest recordedfalse, foreignOrigin403, anonymous401. Persisted DB one intent/account/day, planfree/removalnone unchanged; source click deduplicated across browsercontexts sharing visitorprefix/day. Unknownbot302 withoutref. No horizontaloverflow or page JavaScript errors. Own containers/network/contexts/private environment removed; sharedbrowser retained. DB verification and report source/imagebound. This is isolated Docker acceptance, not publicdeployment.

Status: completed
