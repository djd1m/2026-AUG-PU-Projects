# N3 — программа четырёх вариантов

2026-09-08. Новое решение владельца: подготовить отдельный PRD на каждый сценарий, затем реализовать4варианта с переиспользованием кода и выбрать/сочетать результат. Каждый вариант хранится в своей подпапке. Предыдущая остановка до PRD заменена этим поручением; владелец затем явно разрешил автономные /go shared→A→B→C→D после документов; F1 synthetic, production не включён.

Основной вход в пакет: [каталог вариантов](../variants/README.md).

| Документ | Роль |
|---|---|
| [shared/docs/PRD.md](../shared/docs/PRD.md) | Обязательные общие деньги/права/операции/измерения |
| [A](../variants/a-merchant/docs/PRD.md) | Merchant setup и месячный реестр |
| [B](../variants/b-customer/docs/PRD.md) | Customer referral и subscription credits |
| [C](../variants/c-partner/docs/PRD.md) | External partner portal и cash-комиссии |
| [D](../variants/d-agent/docs/PRD.md) | Агентный канал, делегация и общий артефакт |
| [Архитектура](variant-architecture.md) | Границы shared/variants и единые use cases |
| [План](variant-implementation-plan.md) | Функциональные fixtures → сравнение → протоколы/провайдеры/пилот |

Это пакет PRD для разрешённой реализации F1. Содержит23 уникальные пользовательские истории:6 общих и17 сценарных, с Given/When/Then. Ни наличие документа, ни работа HTML не доказывают выполнение этих критериев будущим runtime. SPARC Specification/Pseudocode/Architecture/Refinement/Completion подготовлен; проверяется перед реализацией.

## Передача discovery

- PD-PRODUCT-001, PD-MARKET-001: источники и сегменты сохранены в discovery; сценарии не объявляются доказанным спросом.
- PD-FINANCE-001: неизвестные экономики отражены в shared PRD; production defaults не утверждены; воспроизводимая F1 policy задана в runtime-contract.md.
- PD-GROWTH-001 / FR-GROWTH-001…006: value moment и opt-in → B; confirmed paid attribution → shared; referral/share kit → A/B/C; embedded → B; ledger → shared/C. Branding badge/paywall removal отложен за F1, так как не требуется для сравнения полезности первых четырёх сценариев; решение пересмотреть до commercial rollout.
- PD-PAYOUT-001, PD-PAYOUT-002: ручные выплаты до5-го и честная готовность adapters перенесены в shared/план.
- PD-LOOK-001 / FR-LOOK-001…005: визуальная основа/два столбца/границы реконструкции/ledger/адаптивность сохранены. Автоматический source path по-прежнему не измерен.
- PD-CJM-001, PD-CJM-002, PD-CJM-003, PD-CJM-004, PD-CHOICE-001:4 HTML разложены по variants; выбор заменён планом сравнения4 реализаций, а не потерян.
- PD-AGENT-001, PD-AGENT-002, PD-AGENT-003, PD-AGENT-004, PD-AGENT-005, PD-AGENT-006, PD-AGENT-007, PD-AGENT-008: отражены в общем PRD и D; endpoints пока не реализованы.
- PD-VALIDATION-001, PD-TELEMETRY-001: прежние свидетельства относятся к HTML; новая работа имеет собственную телеметрию и review.

Окончательный промоушен FR/AC в Specification и алгоритмы должен пройти штатные trace-гейты на W0; этот перечень не выдаётся за машинно подтверждённое покрытие SPARC.
