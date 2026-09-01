-- 001_types.sql — перечисления.
--
-- Значения взяты ДОСЛОВНО из docs/Architecture-DATA.md §1 и из FR-012 (guest_event_kind).
-- Дословность здесь не педантизм: она убирает шаг перевода между требованием и схемой,
-- на котором в Phase 1 уже разошлись §4 и §12 одного и того же документа.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE plan                AS ENUM ('free','point','network','agency');
CREATE TYPE member_role         AS ENUM ('admin','manager','viewer');
CREATE TYPE platform            AS ENUM ('yandex_maps','twogis');
CREATE TYPE link_kind           AS ENUM ('review_form','card');

-- ТРИ значения, не два. `door_click` + `platform IS NULL` отвергнут: смысл, живущий в NULL,
-- верен ровно до первого, кто добавит площадку без ссылки.
CREATE TYPE guest_event_kind    AS ENUM ('scan','public_door_click','private_door_click');

CREATE TYPE channel             AS ENUM ('telegram','max');
CREATE TYPE delivery_status     AS ENUM ('pending','sending','sent','failed');
CREATE TYPE checkout_status     AS ENUM ('pending','completed','expired');
CREATE TYPE attribution_source  AS ENUM ('promo_code','sub_account','cookie');
CREATE TYPE attribution_status  AS ENUM ('pending','converted','expired','rejected','frozen');
CREATE TYPE partner_status      AS ENUM ('active','deactivated');
CREATE TYPE review_count_source AS ENUM ('manual');
