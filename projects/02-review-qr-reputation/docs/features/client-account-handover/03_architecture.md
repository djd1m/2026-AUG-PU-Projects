# Передача аккаунта · Архитектурная дельта

## Находка, определившая всю конструкцию

`visible_accounts()` раздаёт доступ по родству:

```sql
SELECT current_setting('app.current_account_id')::uuid
UNION
SELECT id FROM accounts WHERE parent_account_id = current_setting('app.current_account_id')::uuid;
```

Одиннадцать RLS-политик ключуются на её результате. Значит **запись в
`accounts.parent_account_id` есть выдача доступа к чужим данным** — включая приватные обращения
гостей чужого заведения.

При этом сегодня: `accounts` и `account_members` **не под RLS** (RLS включена на `places`,
`platform_links`, `private_feedback`, `guest_events`, `channel_bindings`, `subscriptions` — и
только), а роль `app_owner` имеет на них `SELECT, INSERT, UPDATE`. Изоляция этих четырёх таблиц
держится **исключительно на том, что код всегда фильтрует по `session.accountId`**.

Сегодня это безопасно ровно потому, что **ни один путь кода не пишет `parent_account_id`**.
Фича создаёт первый такой путь. Одна ошибка в нём — подставленный чужой идентификатор — и
атакующий делает чужой аккаунт своим ребёнком, после чего одиннадцать политик честно отдают ему
чужие данные. Обнаружено при чтении схемы под эту фичу, до написания кода.

## Ответ: сделать запись невыразимой, а не проверяемой

Тот же приём, которым в этом продукте закрыт гейтинг: не «проверить в коде», а **отнять право**.

```sql
-- Миграция 012
REVOKE UPDATE ON accounts FROM app_owner;
GRANT  UPDATE (name) ON accounts TO app_owner;      -- ровно одна колонка

ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_accounts ON accounts FOR SELECT TO app_owner
  USING (id IN (SELECT visible_accounts()));
CREATE POLICY tenant_accounts_ins ON accounts FOR INSERT TO app_owner
  WITH CHECK (parent_account_id = current_setting('app.current_account_id')::uuid);
  -- создать МОЖНО только собственного ребёнка; чужого родителя не подставить

CREATE POLICY tenant_members ON account_members FOR ALL TO app_owner
  USING (account_id IN (SELECT visible_accounts()))
  WITH CHECK (account_id IN (SELECT visible_accounts()));

CREATE FUNCTION attach_child(p_child uuid, p_token_hash bytea) RETURNS void
  SECURITY DEFINER SET search_path = public AS $$ ... $$;
REVOKE ALL ON FUNCTION attach_child FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attach_child TO app_owner;
```

После этого «привязать к себе чужой аккаунт» не является ошибкой валидации — это **отказ СУБД**,
такой же, как чтение тональности ролью рендера.

**Риск, который вносит `SECURITY DEFINER`, назван честно:** функция выполняется с правами
владельца схемы и обходит RLS внутри себя. Поэтому она делает ровно одно действие, принимает
только хеш токена (не идентификатор родителя), и `search_path` у неё зафиксирован — иначе
подставленная схема подменила бы вызываемые ею функции.

## Новая таблица

```sql
CREATE TABLE handover_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL,                    -- сам токен не хранится нигде
  created_by   uuid NOT NULL REFERENCES owners(id),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz NULL,
  CONSTRAINT uq_handover_token UNIQUE (token_hash),
  CONSTRAINT ck_handover_hash CHECK (octet_length(token_hash) = 32)
);
```

Одно действующее приглашение на аккаунт обеспечивается частичным уникальным индексом по
`account_id WHERE accepted_at IS NULL` — иначе агентство рассылает пять ссылок и не знает, какая
сработает.

## Матрица прав — новые строки

| Роль | Таблица | Право |
|---|---|---|
| app_owner | handover_invitations | SELECT, INSERT, UPDATE |
| app_owner | accounts | UPDATE **только (name)** — отрицательная строка стража |
| app_render / app_intake / app_notify | handover_invitations | НИЧЕГО — отрицательные строки |

Публичный путь `GET|POST /handover/:token` живёт в `apps/web` и работает **до** установления
контекста арендатора: контекст берётся из найденного приглашения, никогда из адреса или формы.
Это тот же закон, что в вебхуке оплаты.
