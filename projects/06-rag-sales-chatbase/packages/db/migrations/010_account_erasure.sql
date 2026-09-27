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

-- 5. Деньги удалённого партнёра (решение владельца 27.09 «Ничего не сжигать, всё — долг», A-N6-061; заменяет прежнее
--    сгорание холда и сумм < 1 000 ₽). При стирании ничего не списывается: записи начислений остаются обезличенными (5 лет,
--    ответ 3, 402-ФЗ), холд дозревает, сторно работает как обычно, невыплаченный баланс — долг сервиса. Списать долг может
--    ТОЛЬКО оператор явной командой с причиной (ops:erasure write-off) — компенсирующая запись write_off и строка
--    partner_audit debt_written_off. Выплата удалённому — обычная выплата по обезличенной почте deleted:<id>.
ALTER TABLE commission_entry DROP CONSTRAINT commission_entry_kind_check;
ALTER TABLE commission_entry ADD CONSTRAINT commission_entry_kind_check CHECK (kind IN ('accrual', 'clawback', 'payout', 'write_off'));
ALTER TABLE commission_entry DROP CONSTRAINT commission_sign;
ALTER TABLE commission_entry ADD CONSTRAINT commission_sign
  CHECK ((kind = 'accrual' AND amount_minor > 0) OR (kind IN ('clawback', 'payout', 'write_off') AND amount_minor < 0));
ALTER TABLE commission_entry DROP CONSTRAINT commission_payment_iff_not_payout;
ALTER TABLE commission_entry ADD CONSTRAINT commission_payment_iff_not_payout CHECK ((kind IN ('payout', 'write_off')) = (payment_id IS NULL));
ALTER TABLE partner_audit DROP CONSTRAINT partner_audit_kind_check;
ALTER TABLE partner_audit ADD CONSTRAINT partner_audit_kind_check
  CHECK (kind IN ('frozen_antifraud', 'unfrozen', 'code_issued', 'payout_recorded', 'accrual_skipped_fee_unknown', 'debt_written_off'));

-- 5а. Сырые PDF удалённых источников (шестое ревью, находка 2): deleteSource снимает задачи каскадом, и файл в томе
--     uploads/<index_job_id> теряет связь с аккаунтом — если общая уборка тома падает, стирание аккаунта его не нашло бы.
--     Служебная таблица (не сущность канона) держит связь до удаления файла: уборка и стирание удаляют файл, затем строку;
--     завершение стирания не наступает, пока у аккаунта есть такие строки.
CREATE TABLE upload_orphan (
  index_job_id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_orphan_account ON upload_orphan (account_id);

-- 6. Журнал стирания — служебный, БЕЗ персональных данных: только надгробный id, событие, сумма и время.
CREATE TABLE erasure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('requested', 'waiting_payout', 'payout_owed', 'erased', 'failed', 'overdue')),
  amount_minor bigint
);
CREATE INDEX erasure_audit_account ON erasure_audit (account_id, created_at);
CREATE UNIQUE INDEX erasure_audit_overdue_once ON erasure_audit (account_id) WHERE event = 'overdue';

-- 7. Свободный текст оператора (причина) о стираемом или стёртом аккаунте не появляется НИКОГДА (седьмое ревью, находки
--    1–2): выплата или списание долга удалённому партнёру, назначение плана, выдача и разморозка кода — любая строка
--    журнала, вставленная, пока аккаунт `erasing` или `deleted`, получает обезличенную причину. Страж на уровне базы:
--    новый путь записи в журнал не может забыть обезличивание. Строки, записанные РАНЬШЕ (аккаунт был active),
--    обезличивает проход стирания (packages/db/src/erasure.ts, ERASED_REASON — та же строка). Оператор (кто действовал) —
--    сотрудник сервиса, не данные клиента, и остаётся.
CREATE FUNCTION erased_reason_partner_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reason IS NOT NULL AND EXISTS (SELECT 1 FROM account a WHERE a.status IN ('erasing', 'deleted')
      AND (a.id = NEW.account_id OR a.id = (SELECT c.owner_account_id FROM partner_code c WHERE c.id = NEW.partner_code_id))) THEN
    NEW.reason := 'обезличено при удалении аккаунта';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER partner_audit_erased_reason BEFORE INSERT ON partner_audit
  FOR EACH ROW EXECUTE FUNCTION erased_reason_partner_audit();

CREATE FUNCTION erased_reason_operator_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM account a WHERE a.id = NEW.account_id AND a.status IN ('erasing', 'deleted')) THEN
    NEW.reason := 'обезличено при удалении аккаунта';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operator_action_erased_reason BEFORE INSERT ON operator_action
  FOR EACH ROW EXECUTE FUNCTION erased_reason_operator_action();

-- 8. Метка выплаты (`commission_entry.payout_key`) — тоже свободный текст оператора до 100 символов (восьмое ревью, находка 1).
--    У стираемого или стёртого партнёра она хранится только отпечатком `erased:<md5>`: детерминированным, поэтому повтор
--    выплаты с той же меткой по-прежнему узнаётся (commission.ts ищет и исходную метку, и её отпечаток), а уникальный индекс
--    выплаты работает. Старые метки переписывает проход стирания (erasure.ts), новые — этот триггер.
CREATE FUNCTION erased_payout_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payout_key IS NOT NULL AND NEW.payout_key NOT LIKE 'erased:%' AND EXISTS (SELECT 1 FROM account a
      WHERE a.id = NEW.partner_account_id AND a.status IN ('erasing', 'deleted')) THEN
    NEW.payout_key := 'erased:' || md5(NEW.payout_key);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_entry_erased_payout_key BEFORE INSERT ON commission_entry
  FOR EACH ROW EXECUTE FUNCTION erased_payout_key();
