# FR-014 · Псевдокод

## Дельта разделяемых ресурсов — заполнена ДО написания кода

Проект шесть раз подряд наблюдал одно: правка проверяется на своём сценарии, а ресурс,
который она задела или создала, не проверяет никто. Таблица заполняется здесь, а не после
ревью.

| Ресурс | Было | Стало | Кто ещё в очереди | Кого наказывает насыщение |
|---|---|---|---|---|
| соединение пула (30 на всё) | — | одно на запись импорта; разбор CSV **вне** транзакции | вход, дашборд, витрина, виджет, приём отзывов, кабинет партнёра | всех, поэтому число строк ограничено числом |
| память процесса | — | файл целиком в памяти на время разбора | всё приложение | всех — поэтому предел тела общий, а не свой |
| строки `testimonials` проекта | пишет форма | пишет ещё и импорт | витрина и виджет читают их же | никого: запись разовая, конкуренции за строку нет |
| уникальный индекс отпечатка | — | новый | только импорт | никого |

Отдельно про **число строк**. Один импорт пишет N строк в одной транзакции. Соединение
удерживается на время N вставок, и это единственное место, где длительность зависит от
входных данных. Поэтому N ограничено (`MAX_IMPORT_ROWS`), и предел назван числом, а не
«разумным значением».

## Константы

```
MAX_IMPORT_ROWS = 500      # один импорт; выше — просить разбить файл
IMPORT_SOURCE   = 'import' # значение колонки source
```

500 вставок в одной транзакции — доли секунды на любой машине, и это на порядок меньше того,
где удержание соединения становится заметным. Больше — уже пакетная задача, а не форма.

## Отпечаток строки — идемпотентность ограничением БД

```
function importFingerprint(authorName, text) -> hex:
    # Нормализация ОБЯЗАТЕЛЬНА: строки, отличающиеся только пробелами по краям, — это одна
    # и та же строка, и повторный импорт того же файла из другой выгрузки не должен
    # создавать дубль (AC-014.9).
    return sha256(trim(authorName) + '\x00' + trim(text))
```

Разделитель `\x00` обязателен: без него `name="ab", text="c"` и `name="a", text="bc"` дали бы
один отпечаток. Тот же довод, что у `hashKey` в `login.ts`.

Идемпотентность обеспечивает **уникальный индекс** `(project_id, import_fingerprint)` и
`on conflict do nothing` — не проверка «нет ли уже такой строки» перед вставкой. Проверка
оставляет окно между чтением и записью; в проекте это решено так уже дважды —
`on conflict (code) do nothing` у партнёрских кодов и `unique(payment_event_id)` у начислений.

Отзывы из формы отпечатка **не имеют** (`NULL`), поэтому импорт их не видит и дублями не
считает (AC-014.10). NULL в уникальном индексе Postgres сам с собой не конфликтует.

## Разбор

```
# ВНЕ транзакции: длительностью разбора управляет размер файла, то есть клиент.
function parseCsv(raw, mapping) -> { rows, rejected }:
    if not isValidUtf8(raw):  return error('файл не в UTF-8')      # AC-014.13

    records = parseRfc4180(raw)        # кавычки, переводы строк внутри поля, ; и , как разделители
    if records is empty:               return error('файл пуст')   # AC-014.12
    header = records[0]
    if records.length == 1:            return error('в файле только заголовок')

    if records.length - 1 > MAX_IMPORT_ROWS:
        return error('строк больше ' + MAX_IMPORT_ROWS + ' — разбейте файл')   # AC-014.7

    rows = [], rejected = []
    for i, record in records[1:]:
        candidate = {
            name: record[mapping.name],
            text: record[mapping.text],
            role: mapping.role ? record[mapping.role] : null,
            type: 'text',
        }
        # ТА ЖЕ функция, что у формы. Не «аналогичная», не «своя для импорта» — та же.
        # Своя валидация здесь означала бы вторую дверь на путь, ведущий на ЧУЖИЕ сайты.
        errors = validateTextSubmission(candidate)
        if errors:  rejected.push({ line: i + 2, errors })     # +2: заголовок и счёт с единицы
        else:       rows.push(candidate)

    return { rows, rejected }
```

## Предпросмотр и запись — разные действия

```
# POST /api/import  { mode: 'preview' | 'commit', mapping, csv }
function POST(request):
    raw = readBodyAtMost(request, MAX_IMPORT_BODY)  or  413      # AC-014.8

    # ЕДИНСТВЕННЫЙ источник проекта — проверенная сессия. project_id в теле, если он там
    # есть, не читается никем (NFR-014.4). Класс, закрытый в FR-010 и FR-011.
    accountId = await currentAccountId()  or  401
    project   = projectOfAccount(accountId, body.slug)  or  404

    parsed = parseCsv(body.csv, body.mapping)        # вне транзакции
    if parsed is error:  return 400 { error }

    if mode == 'preview':
        # НИЧЕГО не пишет: ни отзывов, ни счётчиков, ни файлов (NFR-014.5).
        return 200 { accepted: parsed.rows.length, rejected: parsed.rejected,
                     sample: parsed.rows[0..5] }

    inserted = withAccount(accountId, client ->
        importRows(client, project.id, parsed.rows))

    return 200 { inserted, skipped: parsed.rows.length - inserted, rejected: parsed.rejected }
```

```
function importRows(client, projectId, rows) -> inserted:
    n = 0
    for row in rows:
        # Статус pending: импортированное проходит ту же модерацию, что и присланное.
        # on conflict do nothing — идемпотентность ограничением, а не проверкой.
        result = INSERT INTO testimonials
                   (project_id, author_name, author_role, text, status, source, import_fingerprint)
                 VALUES ($projectId, $name, $role, $text, 'pending', 'import', $fingerprint)
                 ON CONFLICT (project_id, import_fingerprint) DO NOTHING
                 RETURNING id
        if result: n += 1
    return n
```

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `validateTextSubmission` | `lib/testimonial.ts:53` | да — **обязательно**, см. NFR-014.1 |
| `readBodyAtMost`, `MAX_JSON_BODY` | `lib/request-body.ts` | да, единственной реализацией |
| `currentAccountId` | `lib/current-session.ts` | да — единственный источник |
| `withAccount` | `@proofwall/db` | да; RLS на `testimonials` работает, но фильтр по `project_id` всё равно явный |

## Чего НЕ делаем

**Не пишем в предпросмотре.** Иначе это запись с другим названием.

**Не заводим свою валидацию.** Ровно та же функция, что у формы. Класс `L-2` — «закрытой
осталась одна дверь из двух» — здесь стоил бы чужого контента на чужих сайтах.

**Не разбираем CSV своим `split(',')`.** Кавычки, экранирование и переводы строк внутри поля
— это формат, а не строка с запятыми. Наивный разбор молча съест половину отзывов и не
скажет об этом.

**Не ставим импортированному `approved`.** Владелец видит их в той же очереди модерации.
