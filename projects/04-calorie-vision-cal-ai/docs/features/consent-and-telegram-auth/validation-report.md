**Verdict:** 🟢 READY

# Requirements Testability Analysis
Spec revision: sha256:a8e8a3807737def8f0bd4a96ea988b66e6e68eaab20bd941a76df9fd37c9b0c0

Проект: N4 «Тарелка». Фича: `consent-and-telegram-auth`. Валидатор: Phase 2 (Sonnet 5, константа
ранбука `docs/feature-runbook.md`), **повторный прогон (попытка 2)** после правок по VC-01…03
(попытка 1). Единица анализа — `FR-consent-and-telegram-auth-n` / `NFR-consent-and-telegram-auth-n`
(формат `sparc-prd-mini` на уровне фичи, как в `foundation` и `scan-pipeline`).

## Summary

- Требований проанализировано: 15 (13 FR + 2 NFR).
- Критериев приёмки: 20 (`AC-consent-and-telegram-auth-1` … `-20`) — количество не изменилось;
  два (`AC-8`, `AC-11`) расширены DEC-A-019 без смены id, все имеют строку в `## Criterion
  scenarios`.
- Средний балл: **94/100** (было 90/100 в попытке 1).
- Заблокировано (score < 50 или floor): 0.
- Blocking floor: не сработал ни для одного требования.
- Находок попытки 1: 3 (VC-01 high, VC-02 medium, VC-03 medium) — **все три закрыты**, см. ниже.
  Новых находок в этом прогоне: 0.
- Security acceptance criteria: применимо, присутствует специфично (бонус +5).
- Growth traceability: не применимо (+0), без изменений.

## Закрытие находок попытки 1

**VC-01 (был high) — ЗАКРЫТО.** Прежний недообновлённый абзац `02_pseudocode.md` §«Scenario Coverage»
заменён на текст, согласованный с остальным документом:
> «`AC-consent-and-telegram-auth-5` (повтор `initData`) РЕАЛИЗУЕТСЯ решением DEC-A-016: `TelegramLogin`
> шаг 2 отклоняет повтор ТОГО ЖЕ `hash` в пределах 24 ч `401 initdata_replayed`, сверяясь с
> `last_telegram_auth_hash`/`last_telegram_auth_at` на `account`… или на `device_session`…»

Проверено: `grep -n "экрана (кнопка входа" docs/features/consent-and-telegram-auth/02_pseudocode.md`
не находит ничего — прежняя строка с перепутанным префиксом (`AC-…-13` вместо `FR-…-13`) для
UI-экранов удалена вместе с остальным стале-абзацем, повторной путаницы идентификаторов не найдено.

**VC-02 (был medium) — ЗАКРЫТО.** Зафиксировано решением координатора:
> `docs/decisions-autonomous.md` DEC-A-019 (2026-09-12 20:53): «VC-02: план consent освобождал
> анонимный 7-дневный дневник от согласия → Исключения нет: согласие перед первой записью дневника
> для любой сессии; хранится на `device_session`, переносится к аккаунту → ADR-009 и SC-US-012-1
> буквально; данные о питании — специальная категория независимо от входа».

Реализация решения проверена по факту, не только по записи в журнале: `02_pseudocode.md` Data
Structures добавляет `device_session.consent_version/consent_text_hash/consent_at` (те же три поля,
что у `account`); `GrantOrDeclineConsent` шаг 1 разрешает владельца в `account` ИЛИ `device_session`;
`EnforceConsentBeforeDiaryWrite` шаг 1 прямо говорит «**Исключения для анонимной сессии НЕТ
(DEC-A-019...)**»; `TelegramLogin` получил новый шаг 6, переносящий согласие с `device_session` на
`account` при входе (без повторного запроса, без понижения уже имеющегося согласия аккаунта).
`01_specification.md` `AC-consent-and-telegram-auth-8` и `-11` переписаны и явно требуют прогона
ОБОИМИ вариантами владельца («Given … прогон повторяется ДВАЖДЫ — один раз с владельцем-аккаунтом,
один раз с АНОНИМНОЙ `device_session`… исключения по типу сессии НЕТ», `01_specification.md:284-290`).
FR-consent-and-telegram-auth-7 (`01_specification.md:126-130`) прямо ссылается на DEC-A-019.

**VC-03 (был medium) — ЗАКРЫТО.** Добавлен именованный конкурентный тест, отсутствовавший в
попытке 1:
> `04_refinement.md:89-90`: «`concurrency/auth-telegram-parallel.test.ts` — 20 одновременных `POST
> /auth/telegram` с ОДНОЙ `initData` → 1×`200`, 19×`401 initdata_replayed` (VC-03)» и «…два
> параллельных ПЕРВЫХ входа одним `telegram_user_id`, РАЗНОЙ `initData` → ровно одна строка
> `account` (VC-03)».

Тест закрывает ОБЕ половины прежнего пробела: гонку на сверке `last_telegram_auth_hash` (реальный
повтор одной и той же строки под конкуренцией) И гонку на вставке `account` при двух РАЗНЫХ первых
входах одного `telegram_user_id` (путь конфликта частичного уникального индекса
`(telegram_user_id) WHERE status != 'erased'`, `03_architecture.md:120-124`) — именно тот случай,
для которого в попытке 1 не было описано, превращается ли конфликт индекса в `401
initdata_replayed` или в необработанную ошибку. Пункт добавлен и в чеклист `05_completion.md:99`.

## Results

| Требование | Заголовок | Score | INVEST | SMART | Status |
|---|---|---|---|---|---|
| FR-consent-and-telegram-auth-1 | Проверка подписи `initData` | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-2 | Вход, атомарный перенос дневника И согласия | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-3 | Защита от повтора `initData` (DEC-A-016) | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-4 | Формат `TELEGRAM_BOT_TOKEN` при старте | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-5 | Согласие (`grant`), в т.ч. анонимное (DEC-A-019) | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-6 | Отказ не блокирует съёмку | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-7 | Fail-closed граница, без анонимного исключения (DEC-A-019) | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-8 | Отзыв согласия закрывает карточки | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-9 | `erase_all` синхронный, идемпотентный | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-10 | Фоновое удаление ≤ 72 ч | 92/100 | 50/50 ✓ | 30/30 ✓ | READY |
| FR-consent-and-telegram-auth-11 | Активный скан не прерывается удалением | 88/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-12 | Аудит передачи наружу без согласия | 88/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-13 | Экраны входа/согласия/удаления | 85/100 | 42/50 | 22/30 | READY |
| NFR-consent-and-telegram-auth-1 | Единая точка возврата `401` | 92/100 | 50/50 ✓ | 25/30 | READY |
| NFR-consent-and-telegram-auth-2 | Три состояния долгой задачи эразуры | 92/100 | 50/50 ✓ | 30/30 ✓ | READY |

**Средний балл: (95+95+95+92+95+92+95+95+95+92+88+88+85+92+92)/15 = 1411/15 = 94/100.**

Рост со 90 к 94 объясняется тремя требованиями: FR-3 (95, было 90 — конкурентный тест закрыл
пробел SMART/Achievable), FR-5 и FR-7 (95 каждое, было 82 у FR-7 — анонимное исключение снято
решением, `Specific`/`Relevant` больше не частичны, обе половины сценария явно проверяются).
FR-13 (экраны) оценка не изменилась: `Testable` по-прежнему частичен (4/8) — экраны фичи по-прежнему
не имеют СОБСТВЕННОГО `AC-n`, отдельного от серверных эффектов, которые они вызывают (то же
ограничение `reason: ui-only`, не регресс попытки 2, а неизменное свойство границы UI/API,
уже отмеченное в попытке 1 без штрафа floor).

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-consent-and-telegram-auth-1 | Успешный вход переносит все записи анонимного дневника в аккаунт (`tests/integration/auth-telegram.test.ts`) |
| AC-consent-and-telegram-auth-2 | Подделанная подпись отклоняется без создания аккаунта (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-3 | Верная подпись с `auth_date` старше 24 часов отклоняется (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-4 | Ответ 401 для подписи и свежести возвращается из одной точки исходника (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-5 | Повторное использование той же `initData` в пределах 24 часов отклоняется как `initdata_replayed`; под конкуренцией — 1×200/19×401 (`tests/integration/initdata-replay.test.ts`, `tests/concurrency/auth-telegram-parallel.test.ts`) |
| AC-consent-and-telegram-auth-6 | Вход с другого устройства связывается с существующим аккаунтом без потери или задвоения дневника (`tests/integration/auth-telegram.test.ts`) |
| AC-consent-and-telegram-auth-7 | Пустой `init_data` отклоняется как ошибка ввода без вычисления подписи (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-8 | Согласие с известной версией сохраняется на аккаунте ИЛИ на анонимной сессии и переносится при входе (`tests/integration/consent.test.ts`) |
| AC-consent-and-telegram-auth-9 | Отказ от согласия оставляет съёмку и результат доступными (`tests/integration/consent.test.ts`) |
| AC-consent-and-telegram-auth-10 | Неизвестная версия и несовпавший хэш отклоняются одним кодом (`tests/unit/consent.test.ts`) |
| AC-consent-and-telegram-auth-11 | Запись дневника без согласия отклоняется на границе фичи для аккаунта И для анонимной сессии (`tests/unit/enforce-before-diary-write.test.ts`) |
| AC-consent-and-telegram-auth-12 | Отзыв согласия закрывает карточки и блокирует новую запись дневника `consent_required` (`tests/integration/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-13 | Запрос `erase_all` переводит аккаунт в `erasing` и отвечает синхронно с дедлайном (`tests/integration/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-14 | Повторный `erase_all` во время `erasing` получает 409 без сдвига дедлайна (`tests/concurrency/account-delete-race.test.ts`) |
| AC-consent-and-telegram-auth-15 | Фоновая задача завершает удаление в срок и повторный прогон идемпотентен (`tests/integration/erasure-job.test.ts`) |
| AC-consent-and-telegram-auth-16 | Активный скан откладывает удаление одного аккаунта, не блокируя остальные (`tests/concurrency/erasure-job.test.ts`) |
| AC-consent-and-telegram-auth-17 | Запрос без `confirm` отклоняется без изменения статуса (`tests/unit/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-18 | Передача дневника наружу без согласия отклоняется и попадает в аудит (`tests/unit/consent-denied-audit.test.ts`) |
| AC-consent-and-telegram-auth-19 | Токен бота неверного формата валит старт с названной причиной (`tests/unit/token-format.test.ts`) |
| AC-consent-and-telegram-auth-20 | Вход после удаления аккаунта создаёт новый аккаунт без восстановления старых данных (`tests/integration/auth-telegram.test.ts`) |

Источник имён — дословные заголовки/описания тестов из `05_completion.md` §«Criterion coverage»
(плановая таблица) и новых строк `04_refinement.md:89-90` (VC-03).

## Security acceptance criteria

Без изменений по существу относительно попытки 1: применимо целиком, бонус +5 (шесть из семи
применимых категорий присутствуют специфично). Data Protection больше не несёт оговорки VC-02:
защита специальной категории ПДн распространяется на анонимный дневник без исключения (DEC-A-019),
что усиливает, а не ослабляет этот пункт по сравнению с попыткой 1.

## Growth traceability

Без изменений: не применимо (+0) — см. попытку 1, `FR-GROWTH-006` трассирован на уровне проекта до
этой фичи, фича его реализует, не промоутирует.

## Проверено без замечаний (дополнительно к попытке 1)

- Перенос согласия при входе (`TelegramLogin` новый шаг 6) НЕ понижает уже существующее согласие
  аккаунта анонимным состоянием текущей сессии («IF у аккаунта УЖЕ есть своё `consent_at`… оставить
  его без изменений») — корректная защита от опрокидывания более сильного факта более слабым.
  Выполняется в ТОЙ ЖЕ транзакции, что перенос дневника (FR-2, «частичный перенос запрещён»
  теперь явно распространён и на перенос согласия, шаг 9).
- Отзыв согласия (`RevokeConsentOrErase`) по-прежнему определён только для `account` (маршрут 13
  требует `Authorization: Bearer`, то есть вошедших) — для анонимной `device_session` отзыва не
  существует, и `EnforceConsentBeforeDiaryWrite` шаг 3 явно называет это не пробелом, а следствием
  границы маршрута: `consent_at IS NULL` для анонима означает ровно «согласие ещё не давалось».
- Новый конкурентный тест `auth-telegram-parallel.test.ts` покрывает случай, отличный от
  `account-delete-race.test.ts`/`erasure-job` (`AC-14`, `AC-16`): там гонка на переходе статуса под
  `SELECT … FOR UPDATE`, здесь — гонка на сверке `last_telegram_auth_hash` БЕЗ явной блокировки
  `device_session` до существования аккаунта плюс отдельно гонка на частичном уникальном индексе
  `telegram_user_id` — оба сценария названы порознь, не «заодно» (соответствует
  `shared-resource-verification.md`: разные разделяемые ресурсы проверяются раздельно).

## Ворота

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --report-revision --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Вывод — см. квитанцию попытки 2 (записан дословно); контур `scan-pipeline` правится параллельно
другим исполнителем и в этой попытке не трогался и не чинился.
