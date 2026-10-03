# F05b correction F1/F2

Fresh review on ab5a6eda found two P2 input/replay defects. Correct only src/evidence/input.ts and src/growth/reports.ts plus focused tests/required checks. Require primitive string before enum membership for direction and event kind; arrays/objects/null return400 and zero writes. Normalize accepted UUIDs before lookup and idempotent comparison. Identical uppercase/mixed-case requests and concurrent duplicate shares/events must return same result; actual changed pair/kind still409.

Sol6.1 high one attempt <=900seconds, fresh Astra closure <=300seconds. Reuse unchanged successful suites; production change retains required type/lint/build/unit/PG, exact enum/UUID mutation RED/restored GREEN and source/image checks. No public projection/entitlement/consent/reply or new scope. Preserve old reviews/failed delivery. Owner autonomy applies, no new approval.
