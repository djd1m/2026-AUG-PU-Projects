-- Выполняется ДО 004 (имена сортируются migrate()). Не меняет SHA уже применённой 004.
-- Старый IPv6 /24 не позволяет восстановить настоящий /64: усечённые биты потеряны.
-- Удаляем только такие сессии/приблизительные growth events. Потребуется повторный вход.
-- На схеме с уже применённой 004 это no-op. Откат удалённых строк — из резервной копии.
DELETE FROM session WHERE family(ip_prefix) = 6 AND masklen(ip_prefix) <> 64;
DELETE FROM growth_event WHERE family(ip_prefix) = 6 AND masklen(ip_prefix) <> 64;
