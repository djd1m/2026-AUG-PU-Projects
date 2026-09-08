# Evidence: payouts for project 03 (official sources only)

Date: 2026-09-08. Scope: evidence for a Rewardful-like affiliate payout flow;
this is product/technical research, not legal advice. No provider adapter is built.

## Decisions now

1. Keep the demonstrated operating model: an internal, auditable payout registry;
   an operator approves the previous month's amounts and issues payments by day 5
   of the next month. This calendar is a product policy, **not** a YooKassa or
   CloudPayments requirement.
2. Treat up to 100 partners as a planning assumption. The sources do not state
   an equivalent hard limit. CloudPayments describes processing hundreds of
   payouts in minutes, but this is marketing guidance, not a capacity commitment.
3. Preserve the stated provider attachment: `Split payments` means the former
   **Yandex.Kassa**, now **YooKassa**, marketplace product. Do not turn it into
   the affiliate-payout adapter: it distributes one buyer payment to connected
   seller stores at payment acceptance. Affiliate rewards paid later from the
   platform's own balance are closer to ordinary payouts.
4. For the three static HTML CJM screens, render the registry and payment state
   as fake/local data. Do not expose an action which claims to send real money.

## Verified facts

### YooKassa

* YooKassa confirms its 2020 rename from Yandex.Kassa. Therefore “Yandex.Kassa
  split payments” maps to the current YooKassa documentation below.
  [Company history](https://yookassa.ru/about)
* Ordinary payout API: a company pays a physical person; destinations include a
  bank card, YooMoney wallet, and SBP. It has a payout balance, provider records,
  and supported status/webhook handling. [API overview](https://yookassa.ru/developers/payouts/overview)
* It requires a manager contact, a YooBusiness settlement account, registration,
  and API integration for production API payouts. [Activation in the API overview](https://yookassa.ru/developers/payouts/overview)
* The support page says senders may be IPs or legal entities (including
  non-residents) and supports API commands or a recipient file. [YooKassa payout support](https://yookassa.ru/docs/support/payouts)
* Sandbox is usable immediately after registration, even before a contract; it
  simulates the flow but transfers no money. [YooKassa test mode](https://yookassa.ru/developers/payouts/overview)
* Split payments automatically distribute one customer payment among marketplace
  stores. The platform and every seller must connect; sellers sign a contract and
  configure their shops. [Split payments basics](https://yookassa.ru/developers/solutions-for-platforms/split-payments/basics)

### CloudPayments

* CloudPayments offers mass payouts to cards via Cabinet or API. Connection
  requires an acquiring application, discussion with a manager, and a funded
  automated-payout account. [Mass-payout product page](https://cloudpayments.ru/payouts)
* Its official explainer describes a merchant (OOO or IP) forming a recipient
  list and sending an instruction by API/file; recipients may be individuals,
  self-employed people, and IPs. [Mass-payout explainer](https://cloudpayments.ru/blog/mass-payouts/)
* `Safe deal` supports a 1:N settlement pattern (one payment to many payouts),
  but it must not be called “split payments” in this project: that name remains
  attached to Yandex.Kassa/YooKassa. It needs two terminals, is card/payment-
  token only, and support depends on the acquiring bank.
  [Safe deal documentation](https://developers.cloudpayments.ru/)
* In the documented 1:N safe-deal flow, cumulative payouts cannot exceed the
  source payment and the deal closes once cumulative payouts equal it (or earlier
  with `FinalPayout`). [Safe-deal payout constraints](https://developers.cloudpayments.ru/)

## Hypotheses / statements to avoid presenting as facts

* “Yandex Kassa” is a historical product name; its current official name is
  **YooKassa**. A future YooKassa adapter needs a separately selected product:
  ordinary payouts versus the marketplace **Split payments** product.
* Do not confuse either of those with **Yandex Split**: it is a buyer-facing
  service for paying a purchase in parts, not the YooKassa marketplace money-
  distribution API. [Yandex Split product page](https://bank.yandex.ru/pay/split)
* “Activation always takes three days” is unsupported as a universal promise.
  An older YooKassa recipe says processing takes three days *if everything is in
  order*, but current API activation requires manager/contract/account steps;
  the CloudPayments sources found give no fixed activation duration.
  [YooKassa recipe](https://yookassa.ru/recipes/pro-yookassa/massovye-vyplaty-yookassa/)
* “An IP is universally required” is false as phrased: YooKassa explicitly also
  permits legal entities, while CloudPayments' explainer says OOO or IP. Exact
  eligibility for the planned business, payout purpose, recipient types, and
  tariff remains provider/manager confirmation.
* Neither provider source establishes that affiliate commissions themselves are
  an eligible purpose for the proposed account. Obtain a written provider answer
  before production onboarding.

## Unknowns that block a real adapter

* Contract/tariff, onboarding duration, per-operation and aggregate limits,
  required recipient data, and which products are enabled for this merchant.
* Whether a particular affiliate is paid as a physical person, self-employed
  person, or IP, and the applicable operational documentation.
* Production credentials, webhook endpoints, payout-account funding, and
  reconciliation ownership. Do not place any of these in the prototype.

## Implementation and test implications

* Define a provider-neutral `PayoutInstruction` / `PayoutAttempt` boundary now:
  registry id, recipient reference, amount/currency, period, idempotency key,
  status, provider reference, and failure reason. The screens can display these
  fields using fixtures only.
* Tests for the static prototype: eligibility/filtering, amount totals, states
  (draft, approved, queued, paid, failed), and the day-5 schedule label. They
  must make no network call and cannot attest to payment completion.
* Later sandbox tests: YooKassa's test gateway can verify creation, cancellation
  and insufficient-funds handling without money movement. Production tests need
  the approved, funded merchant accounts and provider-specific webhooks/reports.
* A future CloudPayments adapter must distinguish ordinary mass payouts from
  Safe deal; a future YooKassa adapter must distinguish ordinary payouts from
  the Yandex.Kassa/YooKassa marketplace Split payments product. Neither can be
  faithfully inferred from the three HTML CJM screens.

Status: completed at EOF.
