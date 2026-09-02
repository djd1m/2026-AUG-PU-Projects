# Передача аккаунта · Алгоритмы

## Создание дочернего аккаунта (агентство)

```
POST /accounts/child   {name}
  проверка: у текущего аккаунта parent_account_id IS NULL      # один уровень, как в триггере
  проверка: неоплаченных детей < LIMIT_UNPAID_CHILDREN         # HAND-6, отказ явный
  транзакция:
    child = INSERT accounts(name, parent_account_id = current)
    INSERT account_members(child, current_owner, 'admin')      # агентство работает в нём
    INSERT attributions(account_id=child, partner_id=?, source='sub_account', expires_at=now+90d)
        # только если у родителя есть партнёрская запись; иначе строки нет вовсе (fail-closed)
    INSERT audit_log(child_created)
```

## Приглашение и приём — механика одноразового токена

Повторяет привязку Telegram, потому что там она уже доказана: секрет не хранится, одноразовость
обеспечена **условием в UPDATE**, а не проверкой перед ним.

```
POST /accounts/:child/invite      (агентство)
  token = 32 случайных байта                      # показывается ОДИН раз, в ссылке
  UPSERT handover_invitations(account_id=child, token_hash=sha256(token),
                              created_by=owner, expires_at=now()+7d, accepted_at=NULL)
  вернуть ссылку BASE_URL/handover/<token>

GET /handover/:token               (заказчик, БЕЗ входа — публичный путь)
  найти по sha256(token) действующее приглашение
  показать: название аккаунта, точки, ЧТО получит, КТО сохранит доступ к приватным обращениям
  форма: почта + пароль

POST /handover/:token
  транзакция:
    inv = UPDATE handover_invitations SET accepted_at = now()
           WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
           RETURNING account_id, created_by                    # одноразовость — В УСЛОВИИ
    если строк 0 -> «ссылка недействительна» и ВЫХОД             # истекла, использована, подделана
    owner = существующий по почте ИЛИ создать нового
    INSERT account_members(inv.account_id, owner, 'admin') ON CONFLICT DO NOTHING
    INSERT audit_log(handover_accepted)
  выдать сессию -> /dashboard
```

## Отвязка агентства (заказчик)

```
POST /accounts/detach
  проверка: инициатор — участник ЭТОГО аккаунта, и аккаунт имеет родителя
  транзакция:
    SELECT attach_parent(NULL)                    # см. ниже: прямой UPDATE запрещён грантом
    DELETE account_members WHERE account_id = current AND owner_id IN (участники родителя)
        # без этого агентство осталось бы участником напрямую, минуя parent_account_id
    INSERT audit_log(agency_detached)
```

Вторая строка несущая: родство и членство — **два независимых канала доступа**, и снятие
одного при сохранении другого даёт заказчику ложное ощущение, что он отвязался.

## Привязка родителя — только через функцию, никогда прямым UPDATE

```
FUNCTION attach_child(child uuid, token_hash bytea) SECURITY DEFINER:
  проверяет действующее приглашение по хешу И то, что child его адресат
  UPDATE accounts SET parent_account_id = <создатель приглашения> WHERE id = child
```

Приложению право `UPDATE (parent_account_id)` НЕ выдаётся вовсе (колоночный грант). Причина в
следующем разделе: это единственное поле, запись в которое раздаёт доступ к чужим данным.
