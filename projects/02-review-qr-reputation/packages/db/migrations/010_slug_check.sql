-- 010_slug_check.sql — форма слага закреплена ограничением БД.
--
-- CHECK был описан в Architecture-DATA и в миграции ОТСУТСТВОВАЛ — расхождение документа
-- со схемой, найденное ревью (slug-why). БД, принимающая то, что требование запрещает,
-- оставляет дефекту приложения место приземлиться: обход валидации приложения (или её
-- будущая правка) молча положил бы в таблицу слаг, который не наберёшь с визитки.
--
-- Ведущий/замыкающий дефис запрещены заодно: '/r/-ab' — рабочий адрес до этой миграции.
ALTER TABLE places ADD CONSTRAINT ck_places_slug_shape
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND length(slug) BETWEEN 3 AND 40);

-- Резервные слаги: пути кабинета и гостя. БЕЗ этого «/r/private/private» — рабочий адрес.
ALTER TABLE places ADD CONSTRAINT ck_places_slug_reserved
  CHECK (slug NOT IN ('api','admin','internal','static','assets','r','go','v',
                      'login','register','logout','dashboard','places','private'));
