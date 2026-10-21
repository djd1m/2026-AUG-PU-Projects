# Independent bounded UI review

Verdict: ACCEPT_UI_SLICE

Source: 9d6a1d1ec7ba476c95cdf0ad3983550ce4d9ac0a against 4e4f0359fac7a22701f350adbb20447ade5de741. Reviewed the six owned UI/test files against the two approved planner packets; cross-read existing client/DOM session behavior and accepted server/live DTO projection. No author receipt or conversation read.

Must-fix findings: none.

The billing UI derives configured99000 minor-unit display as990,00 RUB, separates LIVE checkout from TEST code input and history, keeps immutable-payload stable keys, validates the exact HTTPS YooMoney host/default port/no userinfo/control character boundary and offers an explicit noopener/noreferrer anchor only while pending. Initial return parsing selects one UUID and ignores paid/state/price. Intent/manual refresh re-reads canonical intent, entitlement and history; canceled/terminal intents expose no payment link; unavailable text preserves server entitlement without granting a tariff. TEST entries use the existing history=TEST read-only route. Session epochs are checked before renders and follow-up requests.

Mail/campaign UI reports server modes without asserting authority, diagnostics, delivery or payment. TEST local readiness remains explicit and separate from real AUTH. Exactly one diagnostics POST remains; TLS/AUTH/provenance/date and disabled/error guidance remain distinct from send/capacity/consent. Refresh reads existing GET status only. Freshness is scanComplete with valid lastComplete and0<=age<60000; unknown realVerification remains unknown. Captured epoch, selected mailbox and inspection/readiness revisions reject old results. Campaign consent stays unchecked/separate and start stays explicit with server recheck.

Own short no-network witnesses passed price, safe/unsafe URL, query authority, TEST history path,59,999/60,000/future/incomplete/invalid freshness, fixture/unknown provenance, outage entitlement wording and delayed logout no-render/no-followup. Verified8 source hashes,10 build hashes and9 raw-log hashes. Native raw logs confirm82/82 units,6/6 web integration, mutation15 with14pass/1fail and restored/exact-restored15/15; typecheck/lint/build exit0 are supplied source-bound native facts, not reviewer reruns.

Author web-integration used legacy TRUNCATE on assigned disposable fake n7billing database contrary to namespace-only restrictions; no production database mutation. Keep this provenance caveat. Reviewer performed no DB/browser/provider calls, network, installs or product/global changes. Docker390/1440+keyboard journeys, heavy regressions and release gates remain coordinator responsibilities; accepting this bounded slice does not claim full release.

Profile:model-routing-econom; requested gpt-6.1-sol/high; actual model/effort/tokens/cost null because host metadata is unavailable.

Status: completed
