-- 011_payment_grants.sql — права трактов оплаты и истечения.
-- Правило «каждая роль × каждая таблица её кода» — целиком, а не по местам споров.

GRANT SELECT, INSERT, UPDATE ON checkout_sessions TO app_owner;
GRANT SELECT, INSERT         ON webhook_events    TO app_owner;
GRANT SELECT                 ON partners          TO app_owner;
GRANT SELECT, UPDATE         ON attributions      TO app_owner;
GRANT SELECT, INSERT         ON commissions       TO app_owner;

-- Истечение живёт в notifier: вернуть бренд-строку и погасить подписку.
GRANT SELECT, UPDATE (status)            ON subscriptions TO app_notify;
GRANT SELECT (id, account_id, slug), UPDATE (branding_required) ON places TO app_notify;

-- RLS-политики для notifier на таблицах, включённых в 007: без политики UPDATE молча
-- обновил бы ноль строк — класс, уже дважды ловленный в 008.
CREATE POLICY notify_subs_update   ON subscriptions FOR ALL TO app_notify USING (true) WITH CHECK (true);
CREATE POLICY notify_places_update ON places        FOR ALL TO app_notify USING (true) WITH CHECK (true);
