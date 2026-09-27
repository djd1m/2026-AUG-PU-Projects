-- account-erasure (фича 17, FR-AUTH-002, NFR-SEC-003, SC-US-015-1; решения владельца на чекпойнте плана — A-N6-054).
-- Только добавляющая миграция: статусы account (active/erasing/deleted) и erase_deadline уже есть в 001.
-- Донор формы — N5 projects/05-podcast-clips-opus/packages/db/migrations (deletion_requested_at, очередь повторов по
-- updated_at) — адаптировано: отдельная колонка порядка повторов вместо общего updated_at аккаунта.

-- 1. Когда удаление запрошено (тихий час считается от него) и когда была последняя неудачная попытка стирания
--    (справедливость очереди: сбой одного аккаунта не держит остальных — N5 retention.ts).
--    Колонка без NOT NULL-ограничения: строка erasing без времени запроса (записанная напрямую, до этой миграции) очередью
--    сторожа читается как запрошенная за 72 ч до срока — она стирается, а не зависает навсегда (fail-closed).
ALTER TABLE account ADD COLUMN erase_requested_at timestamptz;
ALTER TABLE account ADD COLUMN erase_attempted_at timestamptz;
CREATE INDEX account_erasing_queue ON account (erase_deadline) WHERE status = 'erasing';

-- 2. Клиенты удалённого партнёра больше не приносят комиссию (ответ владельца 4): атрибуция помечается, а не стирается —
--    строка принадлежит КЛИЕНТУ, а не партнёру.
ALTER TABLE attribution DROP CONSTRAINT attribution_status_check;
ALTER TABLE attribution ADD CONSTRAINT attribution_status_check CHECK (status IN ('pending', 'converted', 'rejected', 'partner_deleted'));

-- 3. Код удалённого партнёра замораживается в момент запроса удаления (новых применений и начислений нет).
ALTER TABLE partner_code DROP CONSTRAINT partner_code_frozen_reason_check;
ALTER TABLE partner_code ADD CONSTRAINT partner_code_frozen_reason_check CHECK (frozen_reason IN ('antifraud_ip_burst', 'operator', 'owner_erased'));

-- 4. Оплата, пришедшая аккаунту, который уже удаляется: деньги реальны — платёж записан на разбор, план не выдан, комиссия
--    не начислена; вернуть — оператор по заявке (ответ владельца 1).
ALTER TABLE payment DROP CONSTRAINT payment_review_reason_check;
ALTER TABLE payment ADD CONSTRAINT payment_review_reason_check CHECK (review_reason IN ('amount_mismatch', 'refund', 'unknown_intent', 'account_erasing'));

-- 5. Сгоревшее при удалении партнёра (ответ владельца 2): холд и доступное меньше 1 000 ₽ — компенсирующая запись
--    forfeit, чтобы баланс надгробной строки был нулём ЯВНО, а не «забыт». Записи денег хранятся 5 лет (ответ 3, 402-ФЗ).
ALTER TABLE commission_entry DROP CONSTRAINT commission_entry_kind_check;
ALTER TABLE commission_entry ADD CONSTRAINT commission_entry_kind_check CHECK (kind IN ('accrual', 'clawback', 'payout', 'forfeit'));
ALTER TABLE commission_entry DROP CONSTRAINT commission_sign;
ALTER TABLE commission_entry ADD CONSTRAINT commission_sign
  CHECK ((kind = 'accrual' AND amount_minor > 0) OR (kind IN ('clawback', 'payout', 'forfeit') AND amount_minor < 0));
ALTER TABLE commission_entry DROP CONSTRAINT commission_payment_iff_not_payout;
ALTER TABLE commission_entry ADD CONSTRAINT commission_payment_iff_not_payout CHECK ((kind IN ('payout', 'forfeit')) = (payment_id IS NULL));
CREATE UNIQUE INDEX commission_forfeit_once ON commission_entry (partner_account_id) WHERE kind = 'forfeit';

-- 6. Журнал стирания — служебный, БЕЗ персональных данных: только надгробный id, событие, сумма и время.
CREATE TABLE erasure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('requested', 'waiting_payout', 'forfeited', 'payout_owed', 'erased', 'failed', 'overdue')),
  amount_minor bigint
);
CREATE INDEX erasure_audit_account ON erasure_audit (account_id, created_at);
CREATE UNIQUE INDEX erasure_audit_overdue_once ON erasure_audit (account_id) WHERE event = 'overdue';
