# Requirements Testability Analysis — d-agent
Spec revision: sha256:b5e87047f8690a67e1ee18e262329086313633dfdbcc4f28b5acc11ac949f80f

Verdict: CAVEATS; no blocking criterion. Independent Astra high review requested; actual model/usage unexposed. Base story mean 90.80/100 (rubric vectors, AC quotes and scenario table in [receipt](../../telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/f1-requirements-validation.md)). Lowest story80/100.

Scope: all business AC on F1 fixtures and real UI. MCP/A2A wire, production SSO and payment integration deferred explicitly. No real model productivity claim. Preserve always-branded pilot, promo/link cohorts, B foreign-origin embed, all4 desktop/mobile and denied/error states. Tests must demonstrate invariant enforcement, not names alone.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-d-agent-4011 | SC-US-401-1 — Given идентифицирован пользователь/tenant и цель; When подтверждает read+draft grant; Then показаны срок, субъект и scope; платёж/approve/send не входят в grant. |
| AC-d-agent-4012 | SC-US-401-2 — Given grant истёк/отозван; When агент начинает новый защищённый шаг; Then операция запрещена; UI владельца остаётся доступен по независимым правам. |
| AC-d-agent-4021 | SC-US-402-1 — Given есть один logical task и fixture payments; When повторяет запрос подготовки; Then получает тот же logical artifact или явно новую версию, без второго payable registry. |
| AC-d-agent-4022 | SC-US-402-2 — Given появился refund; When запускает пересчёт; Then меняются и строки/сумма, и объяснение; прошлое утверждение недействительно. |
| AC-d-agent-4031 | SC-US-403-1 — Given видит artifact id/version/hash; When утверждает и выгружает; Then получает только утверждённое содержимое; экспорт не запускает перевод. |
| AC-d-agent-4032 | SC-US-403-2 — Given доступ агента отозван после пересчёта; When владелец открывает ручное продолжение; Then получает тот же исправленный реестр; новое owner approval разрешено без оживления grant агента. |
| AC-d-agent-4041 | SC-US-404-1 — Given есть own-status grant и taskT1; When создаёт запрос, затем повторяет его; Then видит тот же task и статус, без повторного начисления/отправки. |
| AC-d-agent-4042 | SC-US-404-2 — Given T1 отменён, затем создан T2; When приходит поздний ответ с taskT1; Then ответ не завершает T2; отмена не объявляется rollback внешних действий. |
| AC-d-agent-4051 | SC-US-405-1 — Given клиент имеет own-credit-read grant и fixture credit balance; When запрашивает доступную сумму и условие применения; Then ответ совпадает с B по балансу/резерву/доступности и не показывает cash-комиссии других ролей. |
| AC-d-agent-4052 | SC-US-405-2 — Given read-only grant; When агент пытается зарезервировать или применить бонус; Then изменения запрещены до отдельного разрешённого действия; чтение не тратит баланс. |
