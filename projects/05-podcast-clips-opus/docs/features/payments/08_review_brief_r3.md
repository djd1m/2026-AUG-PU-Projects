# Бриф повторного ревью (круг 3, проверка второго круга исправлений) — фича 30 `payments`

Ты — независимый ревьюер другого семейства моделей (код писал Claude Opus 5.5). Только чтение. Каталог — текущий
(`projects/05-podcast-clips-opus`). Брифы прошлых кругов: `docs/features/payments/08_review_brief.md` (что проверять),
`08_review_brief_r2.md`. Твой ответ круга 2 — оценка B, 2 × medium:
1. инверсия блокировок оплаты (`payment_intent` → `account`) и стирания аккаунта (`account` → `payment_intent`);
2. откат в `scripts/stand-set-yookassa.sh` не проверялся.

Исправления — коммит `9969cace` (`git show 9969cace -- .`): `packages/db/src/payments.ts` (порядок account →
payment_intent в `applyVerifiedPayment` и `recordVerifiedRefund`, намерение перечитывается после блокировки),
`tests/billing.integration.test.ts` (тест «AC-9 гонка со стиранием аккаунта»), `tests/run-payments-mutations.mjs`
(мутация `intent-before-account`), `scripts/stand-set-yookassa.sh` (подтверждение отката). Проверка шести веток скрипта на
подменном docker — `tests/artifacts/payments/stand-script-restart-check.txt`.

Задача: (а) закрывают ли исправления находки, не внесён ли дефект того же класса (другая инверсия блокировок: оплата ↔
`ops:set-plan`, сторож `expirePaidPlans`, запрос удаления `erasure.ts`, списание минут; потеря денег в ветке «намерение
исчезло»; FK-блокировки при вставке `payment`); (б) последний взгляд на всю фичу по пунктам 1–9 брифа круга 1.

Формат: первая строка `ОЦЕНКА: <A|B|C|D>`, таблица `| # | серьёзность | файл:строка | что не так | последствие | как чинить |`,
затем «Заявления, не подтверждённые кодом». Не выдумывай находок; если чисто — так и напиши и перечисли проверенное.
Отвечай по-русски.
