-- 003_guest.sql — гостевая поверхность: журнал событий и приватные обращения.

-- ЖУРНАЛ ГОСТЯ. Append-only.
--
-- UNIQUE-ИНДЕКСОВ НЕТ, И ЭТО ЧАСТЬ ЗАЩИТЫ, а не пропуск. Роль рендера имеет INSERT и НЕ имеет
-- SELECT. При уникальном индексе появился бы `ON CONFLICT DO NOTHING`, а он — канал чтения:
-- по числу затронутых строк можно узнать «такой гость уже приходил», не имея SELECT.
-- Пара «нет SELECT + нет UNIQUE» защищает только вместе; снять одно нельзя.
CREATE TABLE guest_events (
  id          bigserial PRIMARY KEY,
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  kind        guest_event_kind NOT NULL,
  platform    platform NULL,
  -- HMAC(секрет ‖ ISO-неделя, place_id ‖ IP ‖ UA), усечён до 16 байт.
  -- place_id В СООБЩЕНИИ ОБЯЗАТЕЛЕН: без него один телефон даёт ОДИНАКОВЫЙ хэш в разных
  -- заведениях, то есть сквозной идентификатор между точками — прямо запрещён FR-013.
  -- Числа метрики при этом остались бы ПРАВДОПОДОБНЫМИ, поэтому подмену не поймал бы ни
  -- один страж по данным. Стережёт страж по исходнику T12.
  device_hash bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_guest_events_platform
    CHECK ((kind = 'public_door_click') = (platform IS NOT NULL)),
  CONSTRAINT ck_guest_events_device_hash CHECK (octet_length(device_hash) = 16)
);

CREATE INDEX ix_guest_events_place_created ON guest_events(place_id, created_at);
-- Индекса (place_id, device_hash) НЕТ намеренно: он превратил бы журнал в удобный
-- инструмент слежения за устройством, ради невозможности которого хэш и солится неделей.

CREATE TABLE private_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id   uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  -- ТЕКСТ ОБЯЗАТЕЛЕН, оценка опциональна. «Две звезды без слов» дают владельцу сигнал,
  -- на который нечем ответить, и ломают требование о приватном канале: у ответа нет предмета.
  body       text NOT NULL,
  rating     smallint NULL,
  contact    text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_private_feedback_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  -- Границы СОВПАДАЮТ с требованием, не шире. СУБД, принимающая то, что требование
  -- запрещает, оставляет дефекту приложения место приземлиться молча: гость получил бы
  -- 500 от базы вместо 422 от валидации, а в логе была бы ошибка БД вместо ошибки ввода.
  -- Нижняя граница 2, а не 10: «Спасибо!» — восемь знаков и правдоподобное сообщение.
  -- Мусор отсекается частотой, а не длиной: длина — плохой фильтр спама и хороший фильтр
  -- живой речи, притом в неверную сторону.
  CONSTRAINT ck_private_feedback_body CHECK (length(btrim(body)) BETWEEN 2 AND 2000)
);

CREATE INDEX ix_private_feedback_place_created ON private_feedback(place_id, created_at DESC);

CREATE TABLE notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  private_feedback_id uuid NOT NULL REFERENCES private_feedback(id) ON DELETE CASCADE,
  channel             channel NOT NULL,
  status              delivery_status NOT NULL DEFAULT 'pending',
  attempts            int NOT NULL DEFAULT 0,
  last_error          text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz NULL,
  -- ЕДИНСТВЕННЫЙ UNIQUE во всей гостевой части, и он здесь идемпотентность, а НЕ канал
  -- чтения: таблицу пишет intake и читает notify — разные роли, и та, что пишет, не читает.
  CONSTRAINT uq_notifications_feedback_channel UNIQUE (private_feedback_id, channel)
);

CREATE INDEX ix_notifications_status_created ON notifications(status, created_at);

CREATE TABLE channel_bindings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id        uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  channel         channel NOT NULL,
  chat_id         text NULL,
  bind_token_hash bytea NOT NULL,
  bound_at        timestamptz NULL,
  CONSTRAINT uq_channel_bindings_place_channel UNIQUE (place_id, channel)
);

-- Счётчик скользящего окна. UNIQUE нет.
CREATE TABLE rate_limit_events (
  id         bigserial PRIMARY KEY,
  scope      text NOT NULL,
  key        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_rate_limit_scope_key_created ON rate_limit_events(scope, key, created_at);

-- Воронка владельца и служебные события. UNIQUE НЕТ — по той же причине, что у guest_events:
-- пишущие роли не имеют SELECT, и уникальный индекс сделал бы ON CONFLICT каналом чтения.
CREATE TABLE analytics_events (
  id         bigserial PRIMARY KEY,
  account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  account_id  uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  actor_id    uuid NULL,
  action      text NOT NULL,
  reason      text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
