# FR-016 · Архитектура

## Что меняется

| Файл | Изменение | Требование |
|---|---|---|
| `packages/db/migrations/015_sso.sql` | **новый** — таблица `sso_identities`, `password_hash` становится nullable, гранты | NFR-016.1, .7 |
| `apps/web/src/lib/sso.ts` | **новый** — OAuth-клиент: URL согласия, обмен кода, чтение профиля, PKCE | NFR-016.3, .4 |
| `apps/web/src/lib/sso-account.ts` | **новый** — разрешение учётки по идентификатору и политика связывания | NFR-016.1, .2 |
| `apps/web/src/app/api/auth/yandex/start/route.ts` | **новый** | FR-016.1 |
| `apps/web/src/app/api/auth/yandex/callback/route.ts` | **новый** | FR-016.2 |
| `apps/web/src/lib/password-change.ts` | правка ~3 строки: `password_hash = NULL` → отказ, а не `500` | NFR-016.7, AC-016.7 |
| `apps/web/src/lib/urls.ts` | правка: адрес возврата | — |
| `apps/web/src/app/login/login-form.tsx`, `app/page.tsx` | кнопка входа | FR-016.5 |
| `apps/web/tests/sso.test.ts` | **новый** | AC-016.1 – .18 |
| `apps/web/tests/login.test.ts` | правка: маршруты в страж предела тела; новый тест на `NULL`-хеш | AC-016.6, .18 |
| `docker-compose.yml`, `.env.example` | `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` | NFR-016.8 |

## Миграция

```sql
create table if not exists sso_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  provider text not null check (provider in ('yandex')),
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists sso_identities_account_idx on sso_identities (account_id);

alter table accounts alter column password_hash drop not null;

grant select, insert on sso_identities to app_service;
```

**`unique (provider, external_id)`** — ключ учётной записи. Он же обеспечивает идемпотентность
двух одновременных коллбэков с одним кодом: `on conflict do nothing`, а не проверка перед
вставкой. Та же форма, что у партнёрских кодов и начислений.

**`check (provider in ('yandex'))`** — второй провайдер появится вместе с осознанной правкой
схемы, а не опечаткой в коде.

## `password_hash` становится nullable — и это НЕ открывает дыру

Разбор по строкам, а не по ощущению:

| Место | Что произойдёт при `NULL` | Действие |
|---|---|---|
| `login.ts:127` | `account?.password_hash ?? await dummyHash()` — `NULL` коалесцируется в заглушечный хеш от 32 случайных байт; `verifyPassword` честно не сходится, счётчики пишутся, время неотличимо от «аккаунта нет» | **не меняется.** Нужен ТЕСТ, закрепляющий свойство (AC-016.6) |
| `password-change.ts:168` | `verifyPassword(NULL, …)` — argon2 бросит, маршрут отдаст `500` | правка ~3 строки: `NULL` → записать счётчики и вернуть `unauthorized` |
| `register.ts:107` | парольная регистрация всегда передаёт хеш | не меняется |
| `password-reset.ts` | сброс задаёт хеш; SSO-учётка получит пароль, если человек им воспользуется | не меняется |

**Альтернатива «оставить `NOT NULL` и писать заглушечный хеш» отвергнута:** это данные-ложь,
и она молча ломает сравнение-и-замену в смене пароля (`password-change.ts` сравнивает хеш с
хешем), а также делает неразличимыми «пароля нет» и «пароль есть, но неизвестен».

## Граница ответственности

`lib/sso.ts` не знает про БД: строит URL, обменивает код, читает профиль, возвращает
`{ externalId, email }`. `lib/sso-account.ts` не знает про сеть и про HTTP: принимает `client`,
идентификатор и адрес, применяет политику связывания.

**Сетевые вызовы физически не могут оказаться внутри транзакции:** `sso-account.ts` не
импортирует `sso.ts`, а маршрут вызывает их последовательно — сначала сеть, потом транзакцию.
Свойство сигнатур, а не порядка строк.

```ts
export type SsoResolution =
  | { kind: 'linked'; accountId: string }
  // Случая «впустить по совпадению адреса» в типе НЕТ — маршрут не может его выбрать.
  | { kind: 'needs_password_login' };
```

## Четвёртый и пятый внешние вызовы проекта

`FR-015` учил дорого: посылка «внешних вызовов не было» оказалась ложной и стоила
незамеченного дефекта в вебхуке оплаты. Здесь состояние проекта названо по факту:

| Вызов | Где | Внутри транзакции? | Таймаут |
|---|---|---|---|
| ЮKassa: чтение платежа | `payment.ts:97` | **да, осознанно** (FR-008) | есть, 10 с |
| ЮKassa: создание платежа | `payment.ts:222` | нет | есть, 10 с |
| Почта: письмо сброса | `email.ts:69` | нет | есть, 8 с |
| **Яндекс: обмен кода** | `sso.ts` | **нет** | **8 с** |
| **Яндекс: чтение профиля** | `sso.ts` | **нет** | **8 с** |

Страж `AC-016.12` считает вызовы против таймаутов по всему `apps/web` — он уже существует
(добавлен в `FR-015`) и новые вызовы попадают под него автоматически.

## Состояние между запросами — новый класс

До `FR-016` в проекте не было данных, которые надо пронести между двумя HTTP-запросами и
проверить на возврате. `state` и `code_verifier` живут в подписанной httpOnly-cookie с
десятиминутным сроком: сервер их не хранит, значит нечего чистить и нечего утекать из БД.

`sameSite: 'lax'` обязателен и не является послаблением: возврат от Яндекса приходит
GET-редиректом с чужого домена, и при `strict` cookie не отправилась бы вовсе.
