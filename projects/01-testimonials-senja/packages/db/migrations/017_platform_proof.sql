-- 017_platform_proof.sql — отзыв, перенесённый владельцем с внешней площадки.
--
-- Продукт умел принимать только то, что написали в его собственную форму. Отзывы, уже
-- существующие на Яндекс.Картах и в 2ГИС, попасть на стену не могли: импорта с площадок нет и
-- быть не может — публичного API отзывов у них не существует (см. инвентарь внешних
-- зависимостей). Разрыв закрывается не импортом, а тем, что владелец приносит доказательство
-- сам: ссылку на публичный отзыв или его снимок экрана.

alter table testimonials add column source_url            text;
alter table testimonials add column source_platform       text;
alter table testimonials add column screenshot_object_key text;

alter table testimonials drop constraint if exists testimonials_source_check;
alter table testimonials add constraint testimonials_source_check
  check (source in ('form', 'import', 'demo', 'platform'));

-- Отзыв «с площадки» без ссылки и без снимка — это просто текст, набранный владельцем.
-- Ограничение не даёт ему маскироваться под перенесённый: пометка источника на карточке
-- обещает читателю проверяемость, и обещание должно быть обеспечено хотя бы одним из двух.
alter table testimonials add constraint ck_platform_has_proof
  check (source <> 'platform' or source_url is not null or screenshot_object_key is not null);

-- Обратное ограничение, и оно важнее, чем кажется: без него завтра появится отзыв
-- source='form' со ссылкой на Яндекс, и никто не скажет, что это значит.
alter table testimonials add constraint ck_source_fields_only_platform
  check (source = 'platform' or (source_url is null and source_platform is null));
