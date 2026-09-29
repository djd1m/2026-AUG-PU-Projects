# Фичи ReviewQR (N2) после Phase 1

Каталог — фичи, прошедшие отдельный цикл (`/feature` или план → реализация → ревью). Фичи,
сделанные напрямую по документам Phase 1 (гостевая поверхность, приём, доставка, кабинет, QR,
привязка Telegram), своих каталогов не имеют — их источники и описания в таблице «Состав фич»
[`../REPRODUCE.md`](../REPRODUCE.md).

| Каталог | Что | Состояние | Где в SPARC |
|---|---|---|---|
| [`payment/`](payment/01_specification.md) | оплата плана «Точка» через ЮKassa, вебхук, истечение (PAY-1…PAY-5) | ✅ реализовано 02.09; живой тестовый платёж; магазин тестовый (DEC-PAY-2 открыта) | FR-010, FR-011, FR-PAY-001, FR-EXPIRE-001 ([`Specification-OWNER.md`](../Specification-OWNER.md)) |
| [`guest-ip-forwarding/`](guest-ip-forwarding/01_plan.md) | ключ лимита приёма — адрес гостя через стык guest → intake | ✅ выложено на стенд 28.09 | NFR-SEC-005 ([`Specification-NFR.md`](../Specification-NFR.md)), [`Pseudocode-OPS.md`](../Pseudocode-OPS.md) §9 |
| [`client-account-handover/`](client-account-handover/01_specification.md) | передача аккаунта заказчику (тир XL) | ⏸ только план, реализация не запускалась; ждёт DEC-HAND-1…3 и перенумерации миграции (`012` занят) | — (перспективная) |
