Run-ID: 20261003T000534Z-badge-referral
Work-Unit-ID: badge-referral-ui
Attempt-ID: ui-2
Source-Revision: c3d8cfcc3b3f1c61cc0998b378ecf2a677a7daff
Build-Revision: sha256:9bf6944d0ab3506b27e6237083e7ebf03d6bc28fb39fa64a00d257951747a3df
Launch-SHA256: 7cdac64df081a1cf15e63767c3199ea8829ad3a883a7aeb14308107f2996798d
Finished-At: 2026-10-03T01:06:27.902Z
Verdict: failed

Second browserattempt timed out observing ownbot badge after FIRST page.setContent at line25. Genuine badge redirect/cookie/registration and ownbot creation/publication succeeded beforehand. This narrows failure to fixture document replacement, not intent behavior; exact browser lifecycle cause unproven. Artifacts preserved in ui-attempt2. Retry uses ordinary HTTP navigation to tiny test-only foreign-host HTML server, no browser document.write/setContent and no production response mocks. Productbytes unchanged. Ownstackcleanup complete.

Status: failed
