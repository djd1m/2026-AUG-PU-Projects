-- 007_rls_owner.sql — мульти-арендная изоляция кабинета.
--
-- ДВА НЕЗАВИСИМЫХ МЕСТА, оба обязательны, и они защищают РАЗНОЕ:
--
--  1. RLS здесь — для роли кабинета (app_owner). Она видит много арендаторов, и без
--     политики один владелец прочитал бы точки другого.
--  2. Гостевые роли RLS НЕ ИСПОЛЬЗУЮТ ВОВСЕ, и это не пробел, а более сильная защита:
--     им нечего задавать в контекст, потому что они резолвят slug → place_id и НЕ
--     ПРИНИМАЮТ идентификатор арендатора никак. Нечего подменить.
--
-- SET LOCAL живёт ВНУТРИ транзакции: соединение, вернувшееся в пул, не наследует чужой
-- контекст. Это несущее свойство — без него следующий запрос из пула читал бы данные
-- предыдущего владельца.

ALTER TABLE places            ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_bindings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;

-- Видимые арендаторы: свой аккаунт плюс его прямые суб-аккаунты.
-- Вложенность РОВНО ОДИН уровень: агентство видит клиентов, клиент — никого.
-- Глубже не бывает по построению — за этим следит триггер trg_accounts_one_level.
CREATE FUNCTION visible_accounts() RETURNS SETOF uuid AS $$
  SELECT current_setting('app.current_account_id')::uuid
  UNION
  SELECT id FROM accounts WHERE parent_account_id = current_setting('app.current_account_id')::uuid;
$$ LANGUAGE sql STABLE;

CREATE POLICY tenant_places ON places FOR ALL TO app_owner
  USING (account_id IN (SELECT visible_accounts()))
  WITH CHECK (account_id IN (SELECT visible_accounts()));

CREATE POLICY tenant_links ON platform_links FOR ALL TO app_owner
  USING (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())))
  WITH CHECK (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())));

-- Приватные обращения кабинет только ЧИТАЕТ: правка чужого текста уничтожила бы улику,
-- а «удалить неудобный отзыв» — ровно та возможность, которой у продукта быть не должно.
CREATE POLICY tenant_feedback ON private_feedback FOR SELECT TO app_owner
  USING (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())));

CREATE POLICY tenant_events ON guest_events FOR SELECT TO app_owner
  USING (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())));

CREATE POLICY tenant_bindings ON channel_bindings FOR ALL TO app_owner
  USING (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())))
  WITH CHECK (place_id IN (SELECT id FROM places WHERE account_id IN (SELECT visible_accounts())));

CREATE POLICY tenant_subs ON subscriptions FOR ALL TO app_owner
  USING (account_id IN (SELECT visible_accounts()))
  WITH CHECK (account_id IN (SELECT visible_accounts()));

GRANT USAGE ON SCHEMA public TO app_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON places, platform_links, channel_bindings, subscriptions TO app_owner;
GRANT SELECT                         ON private_feedback, guest_events TO app_owner;
GRANT SELECT, INSERT, UPDATE ON owners, sessions, accounts, account_members TO app_owner;
GRANT SELECT, INSERT ON analytics_events, audit_log TO app_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_owner;
