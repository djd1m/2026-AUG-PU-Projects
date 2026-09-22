-- 004: маска префикса адреса зависит от семейства (DEC-A-019).
--
-- Дефект, найденный ИНТЕГРАЦИОННЫМ прогоном, а не чтением: код после DEC-A-019 усекает IPv6 до
-- /64, а ограничения 001 требовали ровно /24 у ЛЮБОГО адреса. Юнит-тесты функции были зелёными —
-- они проверяют функцию, а не базу; настоящая вставка сессии с IPv6 падала на
-- session_ip_prefix_check. Это тот же класс, что и три дефекта стыка фичи foundation: модуль
-- корректен, система нет.
--
-- Почему /24 для IPv4 и /64 для IPv6: /24 у 128-битного адреса — аллокация регистратора, а не
-- абонент; несвязанные пользователи попадали бы в одно ведро ограничителя (см. RV-014).
--
-- Откат: вернуть CHECK (masklen(...) = 24) в обеих таблицах и удалить строки с IPv6-префиксами.

ALTER TABLE session DROP CONSTRAINT IF EXISTS session_ip_prefix_check;
ALTER TABLE session ADD CONSTRAINT session_ip_prefix_check
  CHECK (
    (family(ip_prefix) = 4 AND masklen(ip_prefix) = 24)
    OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 64)
  );

ALTER TABLE growth_event DROP CONSTRAINT IF EXISTS growth_event_ip_prefix_check;
ALTER TABLE growth_event ADD CONSTRAINT growth_event_ip_prefix_check
  CHECK (
    ip_prefix IS NULL
    OR (family(ip_prefix) = 4 AND masklen(ip_prefix) = 24)
    OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 64)
  );
