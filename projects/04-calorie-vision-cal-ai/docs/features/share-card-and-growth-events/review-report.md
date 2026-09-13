Reviewer family: codex
Spec revision: sha256:f1fc27417b54ba254d181ae672b464d83a45d78a8d5ccec6b78de4d91b12f9f6

# Review — share-card-and-growth-events

## Verdict

CHANGES_REQUIRED — несовместимость формата Snapshot, переполнение изображения и обход стража полей подтверждены; обязательное покрытие неполно.

Проверена ревизия `1ed26c7d362de9543d0a03ef062a9179d13315f3`, диф относительно `09cab1a`. Файлы не изменялись.

`npm test` завершился с кодом `1` до выполнения тестов: `EROFS` при записи временного конфига в `node_modules/.vite-temp`. Интеграционные и конкурентные тесты **не запускал: требует стенд PostgreSQL/MinIO**. Ниже `met` означает подтверждение по исходникам, а не успешный прогон стенда; непроверенные сквозные условия отмечены `unverifiable`.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-share-card-and-growth-events-1 | not met | Воспроизведение: `computeCardSnapshotFromItems` возвращает `null` для формы, сохраняемой `persistedItem`. `tests/integration/share-cards-route.test.ts`, тест «AC-1: завершённый скан со Snapshot…», проверяет статус и поля строки, но не четыре числа, размер и содержимое изображения. |
| AC-share-card-and-growth-events-2 | unverifiable | `tests/integration/share-cards-route.test.ts`, «AC-2 / DEC-A-034: анонимная сессия БЕЗ согласия…»: вместо настоящего `POST /consent` используется SQL `UPDATE consent_at`. |
| AC-share-card-and-growth-events-3 | met | `tests/integration/share-cards-route.test.ts`, «AC-3: recognition.status ∈ {queued, failed, refused} дают 409…»; исходник отвергает все три статуса до создания. |
| AC-share-card-and-growth-events-4 | met | `tests/unit/build-card-payload.test.ts`, «%s → badgeRendered = true» и «AC-4: клиентское tariff…»; код использует серверный тариф и строгое сравнение с `paid`. |
| AC-share-card-and-growth-events-5 | met | `tests/unit/build-card-payload.test.ts`, «AC-5: РОВНО paid снимает бейдж — страж умеет и не срабатывать»; `isBadgeRequired('paid')` возвращает `false` по исходнику. |
| AC-share-card-and-growth-events-6 | met | `tests/integration/share-cards-route.test.ts`, «AC-6: повторный вызов возвращает ТУ ЖЕ карточку…»; проверка владельца предшествует чтению существующей карточки. |
| AC-share-card-and-growth-events-7 | met | `tests/integration/public-card-page.test.ts`, «AC-7: удалённая (revoked_at), никогда не существовавшая и синтаксически невалидная карточки…»; три отказа сводятся к одному HTML и статусу. |
| AC-share-card-and-growth-events-8 | met | `tests/integration/public-card-page.test.ts`, «AC-8: Cache-Control: no-store присутствует на успехе И на всех вариантах 404»; общий `htmlResponse` устанавливает заголовок. |
| AC-share-card-and-growth-events-9 | unverifiable | `tests/integration/public-card-page.test.ts`, «AC-9: отзыв согласия МЕЖДУ двумя запросами…»: проверяется прямой `UPDATE revoked_at`, но не настоящий отзыв и не счётчик вызовов подписания/журнал. |
| AC-share-card-and-growth-events-10 | unverifiable | `tests/integration/public-card-page.test.ts`, «AC-10: успешный просмотр анонимным зрителем…»: нет партнёрской атрибуции в фикстуре, проверки `partner_code_id`, разных IP и содержимого журнала. |
| AC-share-card-and-growth-events-11 | met | `tests/integration/share-cards-route.test.ts`, «AC-11: share_click считает КЛИКИ, а не карточки…»; проверяются три события, одна карточка и отсутствие события после чужого запроса. |
| AC-share-card-and-growth-events-12 | unverifiable | `tests/concurrency/share-card-consent-race.test.ts`, «createShareCardGuarded возвращает refused…», и тест RV-03 в `tests/integration/account-delete.test.ts` используют настоящие блокировки, но каждый заменяет одну сторону ручной транзакцией; полного прогона обеих операций нет. |
| AC-share-card-and-growth-events-13 | not met | Воспроизведение с локальным `sharp`: 59 букв `Ш` и многоточие занимают 3154 px при доступных 1000 px. `tests/unit/sanitize-for-card-text.test.ts` проверяет помощники, а не итоговые поверхности. |
| AC-share-card-and-growth-events-14 | not met | Воспроизведение: добавление `dailyTotalKcal: number;` без `readonly` оставляет извлечённое стражем множество прежним. `tests/unit/share-card-field-set-guard.test.ts` пропускает девятое поле. |
| AC-share-card-and-growth-events-15 | not met | `tests/unit/build-card-payload.test.ts`, «AC-15, испытание стража на внедрённом дефекте…»: вызывается отдельный `buildWithSpreadMutant`; настоящая функция не мутируется, исходный assertion на мутанте не проверяется. |
| AC-share-card-and-growth-events-16 | unverifiable | `tests/integration/migrations.test.ts`, «AC-16: share_card_recognition_id_unique существует…» и «повторный прогон миграций применяет ноль файлов»; применение новой миграции поверх заполненной `share_card` не покрыто. |
| AC-share-card-and-growth-events-17 | unverifiable | `tests/concurrency/share-card-idempotency.test.ts`, «ровно одна строка share_card, все 20 результатов несут ОДИН card_id…»: 20 вызовов репозитория, а не требуемые 20 HTTP-запросов с рендером и загрузкой файла. |
| AC-share-card-and-growth-events-18 | unverifiable | `tests/integration/share-cards-route.test.ts`, «AC-18: создание карточки не вызывает ModelProvider…»: сравниваются пустые таблицы счётчиков только при успехе; нет трёх заполненных scopes, двух отказов и счётчика вызовов провайдера. |

## Findings

### RV-share-card-and-growth-events-01 — high

**`apps/api/src/share/read-recognition-snapshot.ts:77`.** Сборщик требует числовое поле `item.kcal`, но `persistedItem` в `apps/recognizer/src/recognize/recognize-scan.ts:171` сохраняет только название, массу, соответствие продукту, Snapshot и части блюда. Полей `kcal/protein/fat/carb` там нет.

Передача такой сопоставленной позиции в настоящую `computeCardSnapshotFromItems` воспроизвела `null`. Для завершённого скана сборщик затем выбрасывает ошибку, маршрут возвращает `503`. Тесты скрывают несовместимость вручную придуманными верхнеуровневыми числами. Дополнительно отсутствующие макронутриенты подменяются нулями.

**Исправление:** согласовать чтение с фактическим контрактом сохранённого Snapshot и считать числа из него; добавить контрактный тест на выходе настоящего производителя данных. Отсутствующие значения не превращать в нули.

### RV-share-card-and-growth-events-02 — high

**`apps/api/src/share/render-card-image.ts:75`.** Ограничение количества символов не ограничивает ширину текста. Название рисуется одной строкой шрифтом 48 px без переноса или подгонки. Локальное воспроизведение дало ширину 3154 px для допустимых 60 символов при доступных 1000 px.

На строке 76 базовая линия источника вычисляется как `1604 + 140 + 180 = 1924`, то есть ниже холста высотой 1920: нижняя часть текста обрезается. Тест создания изображения не проверяет ни геометрию текста, ни его видимость.

**Исправление:** разместить источник внутри холста с запасом на высоту шрифта; измерять текст, переносить или подбирать размер. Проверять итоговый рендер с длинным широким названием и полной строкой источника.

### RV-share-card-and-growth-events-03 — high

**`tests/unit/share-card-field-set-guard.test.ts:28`.** Страж видит только поля вида `readonly name:`. Законное TypeScript-поле `dailyTotalKcal: number;` игнорируется. Это воспроизведено на изменённой в памяти копии настоящего интерфейса: девятое поле добавлено, страж по-прежнему извлекает восемь разрешённых.

**Исправление:** извлекать все свойства интерфейса через TypeScript AST, включая необязательные и изменяемые, и отвергать неподдержанные конструкции. Мутировать настоящий исходник в памяти и проверять отказ тем же стражем.

### RV-share-card-and-growth-events-04 — medium

**`tests/unit/build-card-payload.test.ts:81`.** «Испытание мутацией» доказывает только поведение отдельной функции `{ ...input }`. Assertion ожидает наличие запрещённого поля и остаётся зелёным; это не доказательство, что защита настоящего `buildCardPayload` обнаружила внедрённый дефект.

**Исправление:** применить мутацию к реализации и выполнить прежнюю проверку отсутствия поля, подтвердив её падение и восстановление. Проверить также отсутствие поля на выходе настоящего рендера.

### RV-share-card-and-growth-events-05 — high

**`tests/concurrency/share-card-idempotency.test.ts:35`; `tests/integration/share-cards-route.test.ts:101`; `tests/integration/public-card-page.test.ts:140`.** Несколько обязательных сценариев заменены более узкими: репозиторий вместо HTTP, SQL-согласие вместо маршрута, просмотр без партнёрской атрибуции вместо полного события. Проверка неизменности квот на строке 174 не создаёт ни одного счётчика и не наблюдает провайдера.

Такие тесты не подтверждают заявленные критерии даже при зелёном прогоне. Отсутствие стенда в текущем обзоре — отдельное ограничение; оно не объясняет пропущенные assertions.

**Исправление:** добавить недостающие проверки на соответствующих границах, включая оба порядка конкурентного создания/отзыва, реальный grant, атрибуцию и журнал, три заполненных счётчика и все три исхода сборки.

### RV-share-card-and-growth-events-06 — medium

**`docs/features/share-card-and-growth-events/05_completion.md:121`.** Таблица покрытия осталась плановой. Отсутствуют указанные в ней `share-cards-consent-gate.test.ts`, `growth-events.test.ts`, `tests/guard/share-card-field-set.test.ts` и `share-cards-quota-untouched.test.ts`; фактические заголовки отличаются. Запрошенный `validation-report.md` также отсутствует.

**Исправление:** заменить таблицу фактическими путями и дословными заголовками, явно отметить непокрытые условия. Отсутствие валидации объяснить отдельной записью либо предоставить реальный отчёт; не создавать задним числом фиктивную квитанцию.

## Что проверено без замечаний

- Бейдж определяется точным серверным значением `paid`; клиентское `tariff` не используется.
- `buildCardPayload` явно возвращает восемь разрешённых полей; текущая реализация не распространяет лишние поля входа.
- HTML и SVG экранируют специальные символы; растровый payload удаляет заявленные bidi-символы.
- Запись карточки использует общую границу согласия внутри транзакции; уникальность закреплена SQL-ограничением и обработкой `ON CONFLICT`.
- Публичные HTML- и image-маршруты заново проверяют отзыв; подписанная ссылка на MinIO не передаётся браузеру.
- Ограничитель частоты зарегистрирован на `onRequest` до разбора тела. Новых вызовов модели в дифе нет; конфигурация трёх потолков требует положительных значений.
- Исходники конкурентных тестов квоты и аренды используют параллельные вызовы, а не последовательные циклы. Страж схемы модели содержит мутацию настоящего исходника в памяти; его запуск здесь не подтверждён.
- В проверенном compose у `db` и `storage` нет публикации портов. В просмотренном дифе секретов не обнаружено; среди отслеживаемых `.env`-файлов найден только `.env.example`.
- Тесты фичи обращаются к локальным PostgreSQL/MinIO/API; обращений к интернет-провайдерам в них не обнаружено.
