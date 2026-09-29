# Фичи Proofwall (N1) после MVP

Каталог — фичи, прошедшие отдельный цикл (план → реализация → ревью). Требования и их трассировка к тестам —
[`../Specification.md`](../Specification.md) §6 и [`../test-scenarios.md`](../test-scenarios.md); состояние на стенде и
порядок повторения с нуля — таблица «Состав фич и где описаны» в [`../REPRODUCE.md`](../REPRODUCE.md).

| Каталог | Требование | Что |
|---|---|---|
| [`fr-009-login/`](fr-009-login/01_specification.md) | FR-009 | вход по почте и паролю |
| [`fr-010-password-change/`](fr-010-password-change/01_specification.md) | FR-010 | смена пароля |
| [`fr-011-partner-dashboard/`](fr-011-partner-dashboard/01_specification.md) | FR-011 | кабинет партнёра |
| [`fr-012-transcribe-retry/`](fr-012-transcribe-retry/01_specification.md) | FR-012 | повтор расшифровки |
| [`fr-014-csv-import/`](fr-014-csv-import/01_specification.md) | FR-014 | импорт отзывов из CSV |
| [`fr-015-password-reset/`](fr-015-password-reset/01_specification.md) | FR-015 | восстановление пароля |
| [`fr-016-yandex-id/`](fr-016-yandex-id/01_specification.md) | FR-016 | вход через Yandex ID |
| [`paid-tier-checkout/`](paid-tier-checkout/01-plan.md) | FR-PAY-001 | оплата плана со сроком через ЮKassa |
| [`model-spend-ceiling/`](model-spend-ceiling/01_specification.md) | FR-SPEND-001 | потолок расхода на модель (в коде не реализован) |
| [`platform-proof/`](platform-proof/01_specification.md) | FR-PROOF-001 | отзыв с внешней площадки |
| [`n3-affiliate-bridge/`](n3-affiliate-bridge/01_specification.md) | FR-N3-001 | мост в партнёрскую программу N3 |
| [`agent-purchase/`](agent-purchase/01_specification.md) | FR-AGENT-001 | покупка агентом (пилот) |

FR-013 (адрес виджета) своего каталога не имеет — план и описание в `Specification.md` §6.
