-- Уведомления партнёру (пункт 4 из пяти пробелов, 17.09.2026).
--
-- До этого о начислении и выплате партнёр узнавал, только зайдя в кабинет. Почтовой отправки в
-- продукте нет вовсе, исходящих сообщений в Telegram — тоже; заводить SMTP ради одной строки
-- «вам начислено» значит завести ещё один внешний отказ и ещё один секрет.
--
-- Решение (DEC-A-059): источник истины — СТРОКА В БАЗЕ, которую показывает кабинет. Она есть
-- всегда и ни от чего внешнего не зависит. Доставка в Telegram — НАДСТРОЙКА поверх неё, и
-- только для тех, у кого аккаунт связан с Telegram: её неудача не теряет уведомление, а
-- записывается рядом.

CREATE TYPE notification_kind AS ENUM ('commission_accrued', 'commission_clawed_back', 'payout_recorded');

CREATE TABLE notification (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  kind            notification_kind NOT NULL,
  -- Сумма — копейками целым числом, как и везде в проекте. NULL там, где суммы нет.
  amount_minor    integer,
  read_at         timestamptz,
  -- Доставка наружу: когда удалась и почему не удалась. `delivered_at IS NULL` вместе с
  -- непустой `delivery_error` означает «пытались и не смогли», а не «ещё не пытались».
  delivered_at    timestamptz,
  delivery_error  text
);

-- Непрочитанные конкретного аккаунта — единственный запрос горячего пути (значок в кабинете).
CREATE INDEX notification_unread_idx ON notification (account_id, created_at DESC) WHERE read_at IS NULL;

-- Права на НОВУЮ таблицу выдаются явно: `GRANT … ON ALL TABLES` миграции 001 действует
-- только на таблицы, существовавшие В ТОТ МОМЕНТ. Без этой строки `api` получил бы
-- permission denied на первой же записи уведомления.
GRANT SELECT, INSERT, UPDATE ON notification TO n4_app;
