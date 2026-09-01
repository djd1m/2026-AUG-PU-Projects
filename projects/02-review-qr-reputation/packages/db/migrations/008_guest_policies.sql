-- 008_guest_policies.sql — политики для гостевых ролей после включения RLS.
--
-- ЧЕТВЁРТЫЙ ДЕФЕКТ СТЫКА ЗА ПРОГОН, и снова каждый документ был внутри себя верен.
-- Архитектура говорит: «гостевые роли RLS не используют вовсе» — и это правда О ЗАМЫСЛЕ.
-- Но ENABLE ROW LEVEL SECURITY переключает таблицу в «запрещено всем, у кого нет
-- политики», а не «включена проверка для тех, кому она нужна». Миграция 007 дала
-- политики только app_owner — и гостевые роли молча получили: SELECT — пустоту,
-- INSERT — отказ 42501. Три сервиса легли, 12 тестов покраснели.
--
-- Найдено ПОЛНЫМ прогоном всех наборов. Прогоны по отдельности этого не показывали:
-- каждый сервис тестировался до включения RLS и был зелёным в своём прошлом.
--
-- Политики ниже — «разрешено то, что разрешают гранты»: USING (true). Это НЕ дыра:
-- изоляция гостевых путей держится не на строках, а на самих правах (нет SELECT на
-- private_feedback у рендера) и на том, что slug резолвится, а идентификатор арендатора
-- не принимается никак. RLS здесь лишь возвращает поведение, которое было до 007.
-- Альтернатива BYPASSRLS отвергнута: она сняла бы и будущие политики, о которых мы
-- ещё не знаем, — молоток шире гвоздя.

CREATE POLICY guest_places_read   ON places           FOR SELECT TO app_render USING (true);
CREATE POLICY guest_links_read    ON platform_links   FOR SELECT TO app_render USING (true);
CREATE POLICY guest_events_write  ON guest_events     FOR INSERT TO app_render WITH CHECK (true);

CREATE POLICY intake_places_read  ON places           FOR SELECT TO app_intake USING (true);
CREATE POLICY intake_fb_write     ON private_feedback FOR INSERT TO app_intake WITH CHECK (true);

-- ЧЕТВЁРТОЕ повторение класса «политика выписана не для всех ролей» — уже внутри самой
-- починки третьего: первая редакция этого файла дала app_notify политики на
-- private_feedback и channel_bindings и забыла places, из-за чего join доставки
-- возвращал пустоту и пять тестов краснели. Роль перечисляется ЦЕЛИКОМ по таблицам,
-- которые трогает её код, — правило из 006 применено и здесь.
CREATE POLICY notify_places_read  ON places           FOR SELECT TO app_notify USING (true);
CREATE POLICY notify_fb_read      ON private_feedback FOR SELECT TO app_notify USING (true);
CREATE POLICY notify_bind_read    ON channel_bindings FOR SELECT TO app_notify USING (true);
