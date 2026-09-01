-- 002_core.sql — учётные записи, точки, ссылки на площадки.
--
-- ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ (docs/Architecture.md §3.1). Перечислено явно, потому что
-- отсутствие поля не видно при чтении схемы, а именно оно и есть защита:
--   gating_enabled · rating_threshold · positive_destination · negative_destination
--   show_if · platform_links.position / sort_order · любая оценка ДО развилки
-- Единственная оценка во всей схеме — private_feedback.rating, и она стоит ПОСЛЕ того,
-- как гость сам выбрал приватную дверь. Оценка как часть отзыва законна; оценка как
-- условие показа путей — гейтинг, и он невыразим, потому что поля для него нет.

CREATE TABLE accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  plan              plan NOT NULL DEFAULT 'free',
  parent_account_id uuid NULL REFERENCES accounts(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_accounts_named CHECK (true)
);

-- Один уровень вложенности суб-аккаунтов: агентство → клиенты, и не глубже.
-- Триггером, а не CHECK: CHECK не видит другую строку той же таблицы.
CREATE FUNCTION trg_accounts_one_level() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounts WHERE id = NEW.parent_account_id AND parent_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'accounts: допустим только один уровень вложенности';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_one_level
  BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION trg_accounts_one_level();

CREATE TABLE owners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_owners_email UNIQUE (email)
);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash)
);

CREATE TABLE account_members (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES owners(id)   ON DELETE CASCADE,
  role       member_role NOT NULL,
  CONSTRAINT pk_account_members PRIMARY KEY (account_id, owner_id)
);

CREATE TABLE places (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug       text NOT NULL,
  name       text NOT NULL,
  address    text NULL,
  -- ДЕНОРМАЛИЗОВАНО НАМЕРЕННО. Бренд-строка зависит от тарифа, но рендер гостевой страницы
  -- НЕ ИМЕЕТ ПРАВА читать accounts: чтение строки вне карточки точки нарушило бы инвариант
  -- «ответ зависит только от slug». Поле обновляет владельческий тракт при смене тарифа.
  -- DEFAULT true — fail-closed: неизвестный или не обновившийся тариф ПОКАЗЫВАЕТ бренд.
  branding_required boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT uq_places_slug UNIQUE (slug)
);

CREATE TABLE platform_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  platform    platform NOT NULL,
  url         text NOT NULL,
  -- Диплинка на форму отзыва у Яндекс.Карт и 2ГИС НЕ СУЩЕСТВУЕТ (проверено в Phase 0).
  -- link_kind фиксирует, что именно дал владелец: форму или карточку. Это факт о данных,
  -- а не настройка поведения — оба вида показываются одинаково.
  link_kind   link_kind NOT NULL,
  verified_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Ровно одна ссылка на площадку у точки. Порядка НЕТ намеренно: поле сортировки стало бы
  -- ручкой «эту площадку показать выше», то есть неравенством дверей.
  CONSTRAINT uq_platform_links_place_platform UNIQUE (place_id, platform)
);
