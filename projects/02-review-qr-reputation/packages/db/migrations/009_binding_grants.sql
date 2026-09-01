-- 009_binding_grants.sql — права для завершения привязки мессенджера.
--
-- Тир по complexity-router: новый грант = L, но FR-003 расписан в Phase 1 — скидка до M.
--
-- Поток привязки: кабинет генерирует одноразовый токен и кладёт ЕГО ХЕШ (сам токен уходит
-- владельцу в диплинке t.me и в БД не попадает — та же дисциплина, что у сессий). Владелец
-- жмёт Start у бота; НОТИФАЕР видит /start <токен> в getUpdates, сверяет хеш и дописывает
-- chat_id. Значит нотифаеру нужно ЧИТАТЬ хеш и ПИСАТЬ chat_id/bound_at — ровно это и
-- выдаётся, по колонкам.

GRANT SELECT (id, place_id, channel, chat_id, bind_token_hash, bound_at) ON channel_bindings TO app_notify;
GRANT UPDATE (chat_id, bound_at) ON channel_bindings TO app_notify;

-- Политика UPDATE для нотифаера: RLS на channel_bindings включена в 007, и без политики
-- UPDATE молча обновил бы ноль строк — тот же класс, что ловили в 008.
CREATE POLICY notify_bind_update ON channel_bindings FOR UPDATE TO app_notify
  USING (true) WITH CHECK (true);
