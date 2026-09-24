# Постановка для Codex — фича 20 `partner-fairness`: RT-002 и RT-009

Готовы фичи 1–19, **684 теста** в образе. Решение владельца 24.09.2026: «RT-002 и RT-009 — делай, как
рекомендуешь» (`docs/decisions-pending.md`, разделы RT-002 и RT-009). Меняются канон §4 (закрытый
набор `attribution.status`) и §7 (правило анти-фрода) — это разрешено владельцем.

## RT-002 · блокировка кода: различные аккаунты и разблокировка

**Сейчас** (`apps/web/src/server/partner.ts:70-77`): 50 событий `code_applied` одного кода с одного
`ip_prefix` за 10 мин блокируют код; считаются ПРИМЕНЕНИЯ, разблокировки нет.

**Надо:**
1. Считать **различные аккаунты**: `count(DISTINCT account_id)` тех же событий в том же окне. Один
   аккаунт, применивший код многократно, двигает счётчик на 1. Порог 50 и окно 10 мин не меняются.
2. **Разблокировка оператором** — без новой процедуры tRPC и без нового публичного пути (канон §5
   закрыт): скрипт `scripts/partner-code-unblock.mjs <код> "<причина>"`, который запускает оператор
   в контейнере `web` (как `migrate.js`). Причина обязательна, непустая, ≤ 500 знаков. Код не найден
   или не заблокирован → код возврата 1 с сообщением; успех → 0. Одним оператором `UPDATE …
   WHERE code=$1 AND status='blocked' RETURNING` (без «прочитать, потом записать»).
3. Миграция `016_partner_fairness.sql` (часть RT-002): `partner_code.unblocked_at timestamptz`,
   `partner_code.unblock_reason text CHECK (unblock_reason IS NULL OR char_length(btrim(unblock_reason)) BETWEEN 1 AND 500)`.
   Разблокировка: `status='active', blocked_reason=NULL, blocked_at=NULL, unblocked_at=now(), unblock_reason=$2`.
4. **Окно после разблокировки** начинается не раньше `unblocked_at`: события до разблокировки в счёт
   не идут — иначе следующее же применение заблокирует код снова тем же всплеском.
5. **Уведомление партнёра** — в кабинете (`PartnerPanel.tsx`): у активного кода с `unblocked_at` —
   строка «Код разблокирован <дата по Москве>: <причина>». Причину выводить как ТЕКСТ (React-
   экранирование, никакого `dangerouslySetInnerHTML`). `dashboard` отдаёт `unblocked_at`, `unblock_reason`.

## RT-009 · атрибуция переживает удаление партнёра

**Сейчас** (`apps/web/src/server/retention.ts`): удаление аккаунта-партнёра УДАЛЯЕТ атрибуции
приглашённых им живых аккаунтов; источник исчезает, и тот же человек может быть «приведён» заново.

**Надо** (в той же миграции 016):
1. `attribution.partner_code_id` — обнуляемый, внешний ключ `ON DELETE SET NULL`.
2. `attribution.status` — **4** значения: добавить терминальный `partner_deleted`. `CHECK` обновить;
   `ATTRIBUTION_STATUS` в `packages/shared/src/enums.ts` — 4 элемента; `readAttributionStatus`
   неопознанное по-прежнему читает как `rejected`.
3. Инвариант `CHECK (partner_code_id IS NOT NULL OR status = 'partner_deleted')`.
4. `retention.ts`: атрибуции, где ЭТОТ аккаунт — приглашённый (`account_id = $1`), удаляются как
   раньше; атрибуции ЧУЖИХ аккаунтов на коды удаляемого партнёра — `UPDATE … SET
   status='partner_deleted', partner_code_id=NULL, activated_at` без изменений — ДО удаления кодов.
5. `code.apply` для аккаунта с атрибуцией `partner_deleted` → `409` (как для `rejected`):
   `replacementAllowed` и `WHERE status NOT IN ('rejected','partner_deleted')` в UPDATE.
6. Обезличенность: в строке остаются `account_id` приглашённого, `source`, `status`, даты; ничего о
   партнёре.

## Канон и документы
`docs/` НЕ правь (кроме отчёта) — координатор сам обновит канон §4 и §7. Но в отчёте перечисли все
места кода, где закрытые наборы и числа («ровно 3») проверяются тестами.

## ОБЯЗАТЕЛЬНЫЕ правки после VALIDATE (перекрывают текст выше)

Проверка плана (Anthropic): READY WITH FIXES.

1. **[high] Скрипт — в образе.** `scripts/` в образ `web` не копируется. Положить скрипт в
   `packages/db/scripts/partner-code-unblock.mjs` (или `packages/db/src` → `dist`), чтобы он ехал с
   `packages/`. Команда оператора (впиши её в шапку скрипта и в отчёт):
   `docker compose --project-directory . --env-file .env exec web node packages/db/<путь>/partner-code-unblock.mjs <код> "<причина>"`.
   Без `DATABASE_URL` — код 2 с сообщением («проверка НЕ ВЫПОЛНЕНА»), не «не найдено». Логику
   вынести в функцию `unblockPartnerCode(pool, code, reason, now)` — её и зовёт тест.
2. **[high] Тест «различные аккаунты» должен различать.** Один аккаунт даёт не больше 3 успешных
   событий на код (`cookie → guest_link → explicit`), повторы дают 409 и событий не пишут. Сценарий:
   **17 аккаунтов × 3 смены источника = 51 событие, 17 различных** → код активен при `DISTINCT`, и
   блокируется при `count(*)` (мутация обязана покраснеть). Плюс: 50 разных → `blocked`, 49 → активен.
3. **[high] Окно после разблокировки — одни часы.** `unblockPartnerCode` принимает момент `now`
   (скрипт передаёт `new Date()`), в тестах — тот же `clock`. `unblocked_at` читается в том же
   `SELECT … FOR NO KEY UPDATE OF c`. Нижняя граница окна:
   `created_at > GREATEST($3::timestamptz - interval '10 minutes', c.unblocked_at)` (GREATEST
   игнорирует NULL). Стражи: «50 событий до + 1 после → активен» И «после разблокировки 50 НОВЫХ
   различных аккаунтов → снова `blocked`».
4. **[medium] Страж перечислений `tests/enums.test.ts`** читает CHECK только из `001` (+ исключение
   `013`). Обобщить: для каждой `table.column` берётся ПОСЛЕДНЕЕ определение CHECK по всем миграциям;
   CHECK в `016` писать в форме `CHECK (status IN (…))`. Мутация «4-е значение в enums, CHECK из 001» → красный.
5. **[medium] Миграция 016 — порядок и имена:** `ALTER COLUMN partner_code_id DROP NOT NULL` →
   `DROP CONSTRAINT attribution_partner_code_id_fkey` (без `IF EXISTS`) → `ADD CONSTRAINT
   attribution_partner_code_id_fkey FOREIGN KEY … ON DELETE SET NULL` → `DROP CONSTRAINT
   attribution_status_check` → `ADD CONSTRAINT attribution_status_check CHECK (status IN
   ('pending','activated','rejected','partner_deleted'))` → `ADD CONSTRAINT attribution_partner_deleted_null
   CHECK (partner_code_id IS NOT NULL OR status = 'partner_deleted')`. Тест через `pg_constraint`: на
   `attribution.status` ровно один CHECK. (Следствие: удаление кода мимо `retention` упадёт на CHECK —
   это fail-closed, так и задумано.)
6. **[medium] `retention.ts`:** `UPDATE` чужих атрибуций (`status='partner_deleted',
   partner_code_id=NULL, reject_reason=NULL`) — ДО `DELETE FROM attribution` и `DELETE FROM
   partner_code`; сам `DELETE FROM attribution` сузить до `account_id=$1`. Тест — в
   `tests/retention.integration.test.ts` (там его сейчас нет); мутация `UPDATE → DELETE` — в
   `scripts/test-retention-mutations.mjs`.
7. **[medium] `partner.ts`:** тип `Attribution` (`partner_code_id: string | null`, статус с
   `partner_deleted`); `UPDATE … status NOT IN ('rejected','partner_deleted')`; в `replacementAllowed`
   проверка `partner_deleted` ПЕРВОЙ. `PartnerPanel.tsx`: словарь статусов — без поломки типов.
8. **[medium] `tests/partner.test.ts:19`** — заглушка ищет `SELECT count(*)`; обновить под новый
   запрос. Строку `if (count >= 50)` сохранить дословно (её ищет мутация `burst-50`).
9. **[low] Кабинет:** дата — `Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' })`;
   `unblocked_at` приходит строкой — тип честный; страж «в `PartnerPanel.tsx` нет
   `dangerouslySetInnerHTML`». В шапке скрипта: «причину видит партнёр — не писать в неё данные
   чужих аккаунтов (адреса, IP)».
10. **[low] Семантика скрипта:** снимает блокировку с ЛЮБОЙ причиной (`antifraud_ip_burst` и `manual`
    — ручную ставит тот же оператор). Причина: `trim`, затем 1..500, хранится обрезанной.
    Конкурентный тест утверждает распределение ответов (ровно 50 успехов до блокировки, остальные —
    409 или 422 `code_blocked`) и что `blocked_at` выставлен один раз.

## Тесты

| Страж | Что проверяет | Дефект → ожидание |
|---|---|---|
| различные аккаунты | 1 аккаунт × 60 применений → код активен; 50 разных аккаунтов → заблокирован; 49 → активен | `count(*)` вместо `DISTINCT` → красный |
| конкурентный | 60 параллельных применений 55 разными аккаунтами с одной подсети — блок ровно один раз, строк `blocked` = 1 | — |
| разблокировка | скрипт: заблокированный → активный с причиной; без причины / пустая / 501 знак → 1; активный → 1; несуществующий → 1 | снять проверку причины → красный |
| окно после разблокировки | 50 событий до разблокировки + 1 применение после → код активен | окно без `unblocked_at` → красный |
| кабинет | строка разблокировки с причиной; причина с `<script>` выводится текстом | — |
| RT-009 удаление | партнёр с 3 приглашёнными удалён → 3 строки `partner_deleted`, `partner_code_id IS NULL`; собственная атрибуция удалённого (как приглашённого) — удалена | `DELETE` вместо `UPDATE` → красный |
| RT-009 повтор | приглашённый с `partner_deleted` применяет другой код → 409, строка не изменилась | разрешить замену → красный |
| CHECK | `partner_code_id NULL` при `status='activated'` → ошибка БД | снять CHECK → красный |
| перечисления | `ATTRIBUTION_STATUS` ровно 4, совпадает с CHECK миграции | — |

Интеграционные — на настоящем PostgreSQL (как `tests/partner.integration.test.ts`). Мутации обеими
строками — дополнить `scripts/test-partner-mutations.mjs`. Прогон — `npx vitest run` по затронутым
файлам; интеграционные тебе без Docker недоступны — это НЕ повод для `failed`, полный прогон в образе
делает координатор.

## Границы
НЕ меняй порог 50 и окно 10 мин, самореферал, приоритет источников (ADR-007), процедуры и пути.
Применённые миграции 001–015 не трогать.

## Отчёт
`docs/features/partner-fairness/07_code_report.md`; последняя строка — ровно `Status: completed` либо `Status: failed`.
