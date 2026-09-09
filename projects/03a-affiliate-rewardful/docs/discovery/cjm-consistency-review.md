# CJM consistency review

Run: `20260909T170111Z-discovery-958f`
Work unit: `cjm-consistency-review`
Method: independent read-only review of the generated CJM assets. No prototype or
production source was changed; no browser run was needed for this semantic check.

## Verdict

**Pass for the user's CJM choice.** All three variants retain one shared pilot core:
Proofwall/N1 → YooKassa-confirmed payment → N3a commission → manual payout on the 5th
for the preceding calendar month. The variations change acquisition and onboarding,
not the first integration or money flow. No contradiction was found that would make a
user select a variant on a false claim.

## Required invariants

| Invariant | Evidence | Verdict |
|---|---|---|
| N1 is the sole first integration | Every setup/flow identifies Proofwall as N1; shared comparison says `N1 → ЮKassa → комиссия → ручная выплата`; pilot message limits connection to N1. `assets/app.js:15,22-25,33,53`; `assets/shell.html:8,11`. | Preserved in A, B, C. |
| 20% is illustrative, not approved | State defaults to `rate:20`; the rate field labels it a demo condition and not an approved rate; footer says 20% is an example. `assets/app.js:2,15`; `assets/shell.html:11`. | Preserved. |
| 990 RUB is N1's manual 30-day renewal | Payment scene is Proofwall/30 days/990 RUB; ledger calls the 15 October event a manual renewal and explicitly says N1 does not use automatic charges. `assets/app.js:19-20`. | Preserved. |
| MRR is not asserted | Ledger says subscription data are unconfirmed and displays actual payments rather than MRR. `assets/app.js:20`. | Preserved. |
| No automatic payout | Setup, invitation, payout screen, CSV action and confirmation state that the owner transfers manually and HTML makes no bank transfer. `assets/app.js:15,17-18,21,48-50`; `assets/shell.html:11`. | Preserved. |
| Day 5 for preceding calendar month | Setup names the preceding calendar month; `monthly()` maps September to 5 October and October to 5 November; all variants share it. `assets/app.js:13,15,17-18,20-21,23,35`. | Preserved. |
| Export does not imply paid | CSV action only downloads a table and its toast says payout status is unchanged; only an explicit simulated manual confirmation sets `sent`. `assets/app.js:48-50`. | Preserved. |
| No actual approval is inferred | Choice dialog says a PRD follows only a user message and chat approval; it explicitly says approval is not assumed and work stops at CJM. Shell repeats that no variant is chosen. `assets/app.js:33-35`; `assets/shell.html:10-11`. | Preserved. |

## Findings relevant to a reader

There are no blocking contradictions. The display string on the payout screen's disabled
October marker still says “Отметить перевод 5 октября” while the selected October period
correctly displays “Перевод: 5 ноября” (`assets/app.js:21`). It is disabled for October,
so it cannot assert a wrong payout action and does not affect the choice among A/B/C.
If the prototype is revised after the user chooses a path, make this label derive from
`m.date` to remove the visual inconsistency.

The use of “РЕКОМЕНДУЕМ” for A is qualified twice as a preliminary recommendation rather
than a selected decision (`assets/data.js:2`; `assets/app.js:33`; `assets/shell.html:10-11`).
It therefore does not infer approval.

## Reviewed snapshot hashes

| File | SHA-256 |
|---|---|
| `assets/data.js` | `9103880d41d62f2084b3364482c861189d59bdf157131e077d89b4d4129a34e6` |
| `assets/app.js` | `6e66f00c31df5046b0a4bfa25b3ff8b7fba55af03f45656946d9504c93124ef5` |
| `assets/shell.html` | `49d7fa25e24d9efa6b0e91e31195d0bc585236f2ba3065d98a69405a9f91a2b4` |

Status: completed
