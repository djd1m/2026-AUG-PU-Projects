# Requirements Testability Analysis — b-customer
Spec revision: sha256:1685b59ca5fd0eda908165ff21256698ac1abb4ce87228466cb502fad68c6a13

Verdict: CAVEATS; no blocking criterion. Independent Astra high review requested; actual model/usage unexposed. Base story mean 90.00/100 (rubric vectors, AC quotes and scenario table in [receipt](../../telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/f1-requirements-validation.md)). Lowest story80/100.

Scope: all business AC on F1 fixtures and real UI. MCP/A2A wire, production SSO and payment integration deferred explicitly. No real model productivity claim. Preserve always-branded pilot, promo/link cohorts, B foreign-origin embed, all4 desktop/mobile and denied/error states. Tests must demonstrate invariant enforcement, not names alone.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-b-customer-2011 | SC-US-201-1 — Given клиент опубликовал виджет, событие value moment известно; When открывает предложение; Then видит условия и возможность отказаться, не теряя функции основного продукта. |
| AC-b-customer-2012 | SC-US-201-2 — Given согласие не получено; When открывает страницу или его агент читает условия; Then не создаётся enrollment; чтение не считается согласием. |
| AC-b-customer-2021 | SC-US-202-1 — Given друг подтвердил оплату и policy разрешает credit; When обрабатывается событие; Then credit отражён на проверке с источником и условием доступности. |
| AC-b-customer-2022 | SC-US-202-2 — Given есть только регистрация/клик либо self-referral; When система рассматривает награду; Then доступный бонус не появляется; причина отказа/ожидания объяснима. |
| AC-b-customer-2031 | SC-US-203-1 — Given есть доступный credit300 и fixture invoice1500; When применяет300 к счету; Then счёт1200, credit зарезервирован/применён однократно; отдельный статус при незавершённом счёте. |
| AC-b-customer-2032 | SC-US-203-2 — Given два запроса одновременно пытаются применить один credit; When выполняется общий use case; Then не тратится больше доступного остатка; проигравший получает актуальный баланс. |
| AC-b-customer-2033 | SC-US-203-3 — Given credit зарезервирован, а результат биллинга неизвестен после timeout; When повторяется применение; Then сохраняется исходная операция для сверки, нет второго расходования/фиктивного release. После подтверждённого отказа резерв освобождается ровно один раз; после успеха становится применённым. |
| AC-b-customer-2041 | SC-US-204-1 — Given участие добровольно оформлено; When запрашивает share kit в UI/MCP; Then получает ту же персональную ссылку и disclosure; отправка не производится автоматически. |
| AC-b-customer-2042 | SC-US-204-2 — Given личный агент имеет только read-balance grant; When пытается вступить/применить credit; Then отказ до изменения; тариф владельца не доступен клиенту как его собственная покупка. |
