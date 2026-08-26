-- packages/db/migrations/010_commission_default.sql
--
-- Ставка комиссии партнёра по умолчанию — 30%.
--
-- ЗАКРЫВАЕТ [GAP] из 004_growth.sql и Pseudocode §566 («ставка комиссии по умолчанию
-- не задана в PRD/Specification»). Число НЕ выдумано: это ставка САМОГО Senja —
-- продукта, который проект воспроизводит.
--
-- Первоисточник проверен в этом репозитории: research/verification-report.md п.2.2 —
-- открыт https://senja.io/affiliates, точная цитата: "Earn 30% for life for every
-- paying customer you refer, without limits." Статус: ПОДТВЕРЖДЕНО.
--
-- Независимо подтверждено ресерчем по нише: 30% публикуют ЧЕТЫРЕ из четырёх ссылочных
-- программ категории — Senja, Testimonial.to, Trustmary, Famewall. То есть это не
-- верхняя граница диапазона, а норма категории.
--
-- "for life" = без ограничения срока; код нигде не обрезает начисления по времени.
-- ОТКРЫТЫЙ ВОПРОС ВЛАДЕЛЬЦА: Trustmary при той же ставке ставит потолок €1500 на клиента.
-- Мы потолок не ставим — как оригинал. Если политика изменится, менять здесь и в
-- convertAttributionOnPayment, а не в двух местах.

alter table partner_codes
  alter column commission_rate set default 0.3000;

update partner_codes set commission_rate = 0.3000 where commission_rate is null;

comment on column partner_codes.commission_rate is
  'Доля от суммы платежа, рекуррентно и бессрочно. Дефолт 0.30 — ставка самого Senja '
  '(senja.io/affiliates, "30% for life"), см. research/verification-report.md п.2.2.';
