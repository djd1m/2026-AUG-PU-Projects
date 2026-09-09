# Refinement — f3-access-onboarding

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty/oversized input | missing email/token, password over200chars | explicit400 without IO | exact keys/schema |
| Max size |64KiB provider body,10000liveflows/limiterkeys | bounded refusal | cap/concurrency/timeouts |
| Concurrent completion | same token twice, reset vs login, signup vs SSO | at most one mutation, no wrong identity | SQL lock/re-read/version/unique |
| Network failure | stalled Resend/Yandex, redirects/malformed JSON | generic mail uncertainty or OAuth unavailable |8s shared deadline, max4 calls |
| Scanner | GET email link | zero DB/token mutation | fragment+explicitPOST |
| Legacy account | unverified password account | safe reset, preserved business IDs | credential revoke + verified email |
| Identity collision | sameemail distinctexternalID incl nullpassword | refuse no merge | externalID is identity key |
| Contact collision | unverified provideremail | no reset unless previously verified | session AND email proof |
| Policy outage | sticky policy on, mail disabled | business remains denied to unverified | persistent policy check |
| Revoked in wait | accountversion/sessionexpire during IO/lock | refuse no new credentials | final proof check |

## Testing Strategy

Provider isolated fetch contract tests adapted from donors, real PostgreSQL integration for account/flow races, full118-test baseline plus additions. Dedicated Firefox provider stub flow on four exact HTTPS test origins, desktop1440/mobile390; scanner, duplicate, wrong purpose, replay, all UI states, delayed response afterlogout, keyboard. Public49CJM plus account and official MCP/A2A regression. No public stub route. Source-bound mutation guards: token reuse, expiry, purpose, accountversion revoke, email autolink, OAuthstate, PKCE, policy bypass. Network failure tests prove unrelated DB work can proceed during stalled IO; KDF max2 and provider max4 explicit.

## Test Cases

Given pending registration, When recipient submits matching activation token+password, Then one verified account+org exists and normal login succeeds.
Given old recovery token, When newer issuance or version change occurred, Then reset refuses and all prior identity state is preserved.
Given OAuth email collides with another passwordless account, When new externalID returns, Then no link/session is created.

## Security and Accessibility

No token in logs/localStorage, replace fragment immediately into transient memory; password/token fields reset on completion/logout. Shared context guard discards late responses. Explicit labels, keyboard controls, mobile no horizontal overflow. Quota counters use socket peer not caller X-Forwarded-For. Provider config and actual delivered/consent evidence kept distinct.

## Debt and limits

No auto external-account provisioning; no full specialized real CJM rewrite; no CloudPayments adapter; single shared backend deployment. Fixed limiter resource caps protect service but are not an availability SLA. Actual mail and Yandex consent NOTPERFORMED until dedicated external credentials/readiness exist.
