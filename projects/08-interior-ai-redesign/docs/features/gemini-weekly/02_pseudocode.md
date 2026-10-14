# Weekly provider verification

1. Parse config: absent both pair -> legacy daily/global day. Otherwise require exact daily|weekly and positive safe integer cap>=job; daily cap<=global day.
2. requireLive validates the same pure helper.
3. Existing worker claims job; verifyBudget reads self-key metadata at fixed endpoint with bounded body.
4. Compare reset/ceiling/BYOK/remaining; reject contradictory or unknown data.
5. Existing mark-dispatched and application daily ledger remain unchanged. No paid automatic retry.
6. Actual UI generation awaits compatible provider controls; manual fallback remains.
