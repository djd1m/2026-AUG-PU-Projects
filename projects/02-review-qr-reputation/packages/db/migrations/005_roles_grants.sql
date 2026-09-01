-- 005_roles_grants.sql — четыре роли и матрица прав.
--
-- ЭТО НЕСУЩАЯ ЧАСТЬ ЗАЩИТЫ, а не administrivia. Гейтинг здесь становится НЕВЫРАЗИМЫМ:
-- роль, обслуживающая публичную страницу, физически не может прочитать приватные
-- обращения, поэтому «показать площадки только довольным» падает с permission denied
-- при первом запуске, а не ловится на код-ревью.
--
-- ЧЕТЫРЕ РОЛИ = ЧЕТЫРЕ КОНТЕЙНЕРА, по одной на каждый. Не два пула в одном процессе:
-- пул можно перепутать в коде, а DATABASE_URL, которого в контейнере НЕТ, — нельзя.
--
-- ОДИН GRANT НА РОЛЬ В СТРОКЕ. Перечисление через запятую запрещено: этот блок — самое
-- проверяемое место комплекта, и `grep 'TO app_intake'` обязан отвечать правду. Ни один
-- комментарий здесь не повторяет форму TO <роль>; иначе он даст ложное срабатывание —
-- ровно это случилось при первой проверке и стоило ложного «гранта нет» на «грант есть».

-- Роли создаются ИДЕМПОТЕНТНО. Они живут в КЛАСТЕРЕ, а не в базе: пересоздание базы их
-- не удаляет, и голый CREATE ROLE падает на «role already exists». Найдено прогоном —
-- на боевом стенде это сломало бы деплой после любого восстановления базы из дампа.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_render') THEN CREATE ROLE app_render LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_intake') THEN CREATE ROLE app_intake LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_notify') THEN CREATE ROLE app_notify LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')  THEN CREATE ROLE app_owner  LOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_render;
GRANT USAGE ON SCHEMA public TO app_intake;
GRANT USAGE ON SCHEMA public TO app_notify;
GRANT USAGE ON SCHEMA public TO app_owner;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_render;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_intake;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_notify;

-- archived_at ВХОДИТ В ГРАНТ. Колоночный грант требует SELECT на КАЖДУЮ упомянутую
-- колонку, включая те, что стоят только в WHERE. Алгоритм обязан отличать архивную точку
-- (404) от живой, значит обязан её читать. Найдено прогоном: Architecture давала грант без
-- неё, Pseudocode требовал фильтр по ней, каждый документ был внутри себя верен, а вместе
-- они давали permission denied на первом же запросе. Чтением такое не ловится.
-- Секретом archived_at не является: 404 для архивной и несуществующей точки ОДИНАКОВ.
GRANT SELECT (id, slug, name, branding_required, archived_at) ON places        TO app_render;
-- archived_at И ЗДЕСЬ. Тот же дефект, что был у app_render, во второй роли: приём тоже
-- обязан отличать архивную точку от живой и тоже фильтрует по этой колонке.
-- Страж не поймал, потому что проверял права ОДНОЙ роли — защита была написана против
-- первого экземпляра класса и не покрывала второй. Список ролей в страже расширен.
GRANT SELECT (id, slug, name, archived_at)        ON places            TO app_intake;
GRANT SELECT (place_id, platform, url, link_kind) ON platform_links    TO app_render;
GRANT INSERT                                      ON guest_events      TO app_render;
GRANT INSERT                                      ON private_feedback  TO app_intake;
GRANT INSERT                                      ON notifications     TO app_intake;
GRANT INSERT, SELECT                              ON rate_limit_events TO app_intake;
GRANT SELECT                                      ON private_feedback  TO app_notify;
GRANT SELECT, UPDATE (status, attempts, last_error, sent_at) ON notifications TO app_notify;
GRANT INSERT                                      ON analytics_events  TO app_notify;
GRANT INSERT                                      ON analytics_events  TO app_intake;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_render;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_intake;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_notify;

-- ЕДИНСТВЕННОЕ НАМЕРЕННОЕ ЧТЕНИЕ РОЛЬЮ СОБСТВЕННЫХ ЗАПИСЕЙ во всей матрице:
-- app_intake читает rate_limit_events. Без SELECT скользящее окно не посчитать, а вторая
-- ступень лимита обещает ЧИСЛО («10 с адреса в час на точку»), которого счётчик в памяти
-- не обещает: он не переживает рестарт и умножается на число реплик.
--
-- ⚠️ БЕЗОПАСНО ТОЛЬКО В ПАРЕ с грубым барьером в памяти: он отбрасывает поток ДО обращения
-- к БД, поэтому отклонённый запрос не стоит нам SELECT. Убрать барьер из памяти нельзя,
-- не пересмотрев этот грант — иначе каждый запрос атакующего снова оплачивается запросом
-- к базе. Связь между ними иначе невидима, и первый упрощающий код снимет барьер как лишний.
-- Стережёт страж T3c.
