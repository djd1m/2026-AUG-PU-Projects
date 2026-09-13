# Фича `pro-interest-and-limits-ui` — псевдокод

Дополняет `docs/Pseudocode.md` `Algorithm: RecordProInterest` конкретным механизмом cadence и
классификации контакта — там объявлена ЦЕЛЬ («не чаще раза в сутки», «форма определяет вид»), здесь
объявлен СПОСОБ.

## Data Structures (расширение, без новых таблиц и колонок)

Никаких изменений схемы. Используются существующие поля `pro_interest` (`owner_key`, `contact`,
`contact_kind`, `source_screen`, `partner_code_id`, `created_at`) в форме, объявленной
`docs/Pseudocode.md` Data Structures.

```
ContactClassification = email | telegram | unrecognized

EMAIL_PATTERN    = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/   # локальная часть непустая, ≤ 254 символов суммарно
TELEGRAM_PATTERN = /^@?[A-Za-z0-9_]{5,32}$/                        # логин Telegram
TELEGRAM_ID_PATTERN = /^[1-9][0-9]{4,15}$/                         # числовой telegram_id, разумная длина
```

### Algorithm: ClassifyContact

REQUIREMENT: `FR-pro-interest-and-limits-ui-6`
REQUIREMENT: `AC-pro-interest-and-limits-ui-5`
REALISES: AC-pro-interest-and-limits-ui-5
INPUT: сырая строка `contact` из тела запроса.
OUTPUT: `{ kind: 'email' | 'telegram', normalized: string }` либо отказ `unrecognized`.
STEPS:
1. Обрезать пробелы по краям. IF результат пуст THEN `unrecognized` (пустая строка — опечатка, а не
   «контакта нет намеренно»; `fail-closed-defaults`).
2. IF длина > 254 THEN `unrecognized` — верхняя граница есть у обеих форм, отсутствие границы само по
   себе дефект (`shared-resource-verification`: неограниченный вход — разделяемый ресурс, здесь —
   место в колонке и внимание оператора).
3. IF значение соответствует `EMAIL_PATTERN` THEN RETURN `{ kind: 'email', normalized: lowercase(value) }`.
4. ELSE IF значение (после необязательного удаления ведущего `@`) соответствует `TELEGRAM_PATTERN` ИЛИ
   значение целиком соответствует `TELEGRAM_ID_PATTERN` THEN RETURN `{ kind: 'telegram', normalized: value }`.
5. ELSE RETURN `unrecognized`. Форма, не подошедшая ни под один шаблон, НЕ угадывается («похоже на
   email, но без точки в домене» не превращается в `telegram` и наоборот) — неопознанное значение
   отказывает, а не выбирает более удобный вариант.
COMPLEXITY: O(n) по длине строки, n ≤ 254.

### Algorithm: RecordProInterest

REQUIREMENT: `FR-pro-interest-and-limits-ui-7`
REQUIREMENT: `FR-pro-interest-and-limits-ui-8`
REQUIREMENT: `AC-pro-interest-and-limits-ui-6`
REQUIREMENT: `AC-pro-interest-and-limits-ui-7`
REQUIREMENT: `AC-pro-interest-and-limits-ui-8`
REQUIREMENT: `AC-pro-interest-and-limits-ui-9`
REQUIREMENT: `AC-pro-interest-and-limits-ui-10`
REALISES: SC-US-009-2, AC-pro-interest-and-limits-ui-6, AC-pro-interest-and-limits-ui-7, AC-pro-interest-and-limits-ui-8, AC-pro-interest-and-limits-ui-9, AC-pro-interest-and-limits-ui-10
INPUT: `owner_key`, сырой `contact`, `source` (`user_limit` | `global_limit`), атрибуция владельца
(если есть), текущее время.
OUTPUT: `{ recorded: true }` (`201`) либо отказ (`422` | `429`).
STEPS:
1. IF `source` НЕ РОВНО `user_limit` И НЕ РОВНО `global_limit` THEN RETURN `422` — закрытый набор из
   двух значений, третье не изобретается.
2. Вызвать `ClassifyContact(contact)` (см. выше). IF `unrecognized` THEN RETURN `422`; строка НЕ
   создаётся и cadence-проверка (шаг 3) не выполняется — мусорный запрос не имеет права занять место
   единственной разрешённой записи за сутки (`security-operation-order`: валидация ДО cadence,
   иначе один мусорный запрос сжигает право пользователя написать настоящий контакт сегодня же).
3. В ОДНОЙ транзакции: `SELECT 1 FROM pro_interest WHERE owner_key = :owner_key AND created_at::date
   AT TIME ZONE 'Europe/Moscow' = CURRENT_DATE AT TIME ZONE 'Europe/Moscow' FOR UPDATE`, затем, если
   строка не найдена, `INSERT`. Проверка и вставка — в ОДНОЙ транзакции с блокировкой строки
   (`FOR UPDATE` на существующую строку дня либо advisory-lock по `(owner_key, day)` при её
   отсутствии, чтобы два одновременных первых запроса не создали по строке каждый — «прочитать, потом
   записать» здесь запрещено ТОЧНО так же, как в `CheckAndConsumeQuota`, разделяемый ресурс тот же
   класс, что и квота).
4. IF строка за сегодня уже существует THEN откатить транзакцию, RETURN `429` с телом, называющим
   «запись за сегодня уже есть» (не путать с общим `429` ограничителя частоты — это своя, бизнесовая
   причина, и текст её называет).
5. ELSE вставить `pro_interest` с `contact_kind` и нормализованным значением из шага 2,
   `source_screen = source`, `partner_code_id` из текущей атрибуции владельца или `NULL`,
   `created_at = now()`. RETURN `201 { recorded: true }`.
6. Запись — измерение спроса, не предзаказ и не обязательство (не меняет ничего в `account` или
   `attribution`).
COMPLEXITY: O(1).

### Algorithm: RenderLimitScreen

REQUIREMENT: `FR-pro-interest-and-limits-ui-1`
REQUIREMENT: `FR-pro-interest-and-limits-ui-2`
REQUIREMENT: `FR-pro-interest-and-limits-ui-3`
REQUIREMENT: `FR-pro-interest-and-limits-ui-4`
REQUIREMENT: `FR-pro-interest-and-limits-ui-5`
REQUIREMENT: `AC-pro-interest-and-limits-ui-1`
REQUIREMENT: `AC-pro-interest-and-limits-ui-2`
REQUIREMENT: `AC-pro-interest-and-limits-ui-3`
REQUIREMENT: `AC-pro-interest-and-limits-ui-4`
REALISES: AC-pro-interest-and-limits-ui-1, AC-pro-interest-and-limits-ui-2, AC-pro-interest-and-limits-ui-3, AC-pro-interest-and-limits-ui-4
INPUT: тело отказа по квоте `{ limit, reset_at, scope }`, состояние «запись на сегодня уже есть»
(получено из предыдущего успешного вызова `POST /api/v1/interest` в этой же клиентской сессии, если
он случался; при перезагрузке страницы клиент не помнит этого состояния и просто снова покажет форму
— повторная отправка всё равно отбивается сервером по шагу 3 выше, п. FR-7).
OUTPUT: рендер экрана.
STEPS:
1. IF `scope` РОВНО `'user'` THEN текст «у вас на сегодня закончились сканы».
   ELSE (`'global'` либо любое другое значение, включая отсутствие) THEN текст «на сегодня лимит
   платформы исчерпан, это не про вас лично» — неопознанное трактуется как ОБЩИЙ случай, самый
   строгий по объёму утверждения (не называет персональную причину, которая могла быть неверной).
   IF `scope` не входит в `{'user','global'}` THEN залогировать аномалию на клиенте (не блокирует
   рендер).
2. Разобрать `reset_at` как ISO-8601 дату. IF успешно THEN отформатировать время суток по
   `Europe/Moscow` (`HH:MM`) и, если календарная дата обнуления по Москве отличается от сегодняшней,
   добавить дату. IF разбор не удался или поле отсутствует THEN текст «лимит обновится ночью по
   московскому времени» без конкретного часа.
3. Отрисовать текст «оплаты сейчас нет» и форму листа ожидания (поле контакта, кнопка); НИ ОДНОГО
   элемента цены, тарифа или оплаты в разметке нет.
4. IF есть подтверждение, что запись за сегодня уже отправлена THEN вместо формы показать «уже
   записали, спасибо» без полей ввода.
5. При отправке формы: клиентская проверка формы контакта — подсказка (шаг «похоже на email»/«похоже
   на Telegram»/ничего), кнопка отправки остаётся активной независимо от результата подсказки; запрос
   уходит на сервер в любом случае, и решение принимает шаг 2 `RecordProInterest`.
COMPLEXITY: O(1).
