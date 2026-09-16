-- Реквизиты выплаты партнёру (пункт 3 из пяти пробелов, частично — 17.09.2026).
--
-- ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Автоматической отправки денег нет: она требует отдельного договора
-- на выплаты (ЮKassa Выплаты либо банковский API), ИП и статуса налогового агента по отношению
-- к партнёрам. Ничего из этого кодом не решается (DEC-A-062).
--
-- Что кодом решается и сделано: РЕКВИЗИТЫ, без которых невозможна ни автоматическая выплата, ни
-- ручная. Сегодня владелец переводит деньги руками и не знает куда — этот пробел закрывается
-- независимо от договора.
--
-- НОМЕРА КАРТ НЕ ХРАНЯТСЯ. Хранение PAN тянет за собой PCI DSS — требования к среде, аудиту и
-- шифрованию, несоразмерные задаче. Поддерживается СБП (телефон и банк — не платёжные данные в
-- смысле PCI) и свободная строка для прочих способов; ввод, похожий на номер карты, отвергается
-- кодом (`payout-details.ts`), а не просьбой «пожалуйста, не вводите».

CREATE TYPE payout_method AS ENUM ('sbp', 'other');

ALTER TABLE partner
  ADD COLUMN payout_method payout_method,
  ADD COLUMN payout_phone  text,
  ADD COLUMN payout_bank   text,
  ADD COLUMN payout_note   text,
  ADD COLUMN payout_updated_at timestamptz;

-- СБП обязан нести телефон: способ без адресата — это отсутствие реквизитов, а не реквизиты.
ALTER TABLE partner
  ADD CONSTRAINT partner_sbp_needs_phone
    CHECK (payout_method IS DISTINCT FROM 'sbp' OR payout_phone IS NOT NULL),
  -- Прочий способ обязан нести описание по той же причине.
  ADD CONSTRAINT partner_other_needs_note
    CHECK (payout_method IS DISTINCT FROM 'other' OR payout_note IS NOT NULL);
