# Квитанция: третья реализация ModelProvider — OpenRouter (DEC-A-045/046)

Ревизия: HEAD на момент работы `affdec4` (main, дерево было чистым при старте, каталог —
единственный писатель).

## Что сделано

1. **Перечисление поставщиков.** `packages/shared/src/config/types.ts`: `MODEL_PROVIDERS =
   ['fake', 'live', 'openrouter']`, закрытый набор в коде. `RecognizerConfig` получил поле
   `openrouterApiKey: string | undefined`.
2. **Конфигурация.** `apps/recognizer/src/env.ts`: при `N4_MODEL_PROVIDER=openrouter`
   `OPENROUTER_API_KEY` обязателен (та же форма отказа, что у `ANTHROPIC_API_KEY`/`live`); при
   `fake`/`live` пустой ключ законен. `.env.example` дополнен переменной с комментарием.
   `docker-compose.yml`: `OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}` у `recognizer`, той же
   формы, что у `ANTHROPIC_API_KEY`. `apps/recognizer/src/bootstrap.ts`: `openrouterApiKey`
   добавлен в список редактируемых секретов логгера.
3. **Адаптер** `apps/recognizer/src/provider/openrouter.ts` (новый файл):
   - протокол OpenAI-совместимый, `POST https://openrouter.ai/api/v1/chat/completions`,
     `Authorization: Bearer <ключ>`; встроенный `fetch`, без новых зависимостей;
   - дедлайн (`request.deadlineMs`) и сигнал (`request.signal`) объединены комбинатором
     `combineDeadlineWithSignal` — `AbortSignal.any`, если доступен (есть в Node 22.22.0, на
     котором собран образ), иначе ручной комбинатор с таймером, снимаемым в `finally`; оба
     реально прерывают `fetch` — проверено тестом на СРАБОТАВШЕМ сигнале, полученном моком;
   - одна попытка на вызов, скрытых повторов нет (FR-scan-pipeline-6);
   - отображение ролей канона на модели — ЗАКРЫТЫЙ словарь в коде (DEC-A-045):
     `haiku-4.5 → openai/gpt-5-nano`, `sonnet-5 → openai/gpt-5-mini`; сверено с `MODEL_IDS`
     при загрузке модуля (расхождение валит загрузку);
   - строгая JSON-схема (`response_format.json_schema`, `strict: true`), производная от
     `MODEL_RESPONSE_SCHEMA` — сверка ключей при загрузке модуля, той же формы, что у `live.ts`;
   - изображение — `image_url` с `data:` URI через `ImageFetcher` (порт `live.ts`, переиспользован);
   - разбор ответа из `unknown` явными проверками (не приведением типом); нарушение схемы →
     `ModelSchemaViolationError` с именем поля; сеть/транспорт → `ProviderUnavailableError` —
     классы различаются (RV-scan-pipeline-08);
   - тело `200 OK` с `error` вместо `choices` — трактуется как недоступность, НЕ успех;
     `429`/`5xx` — недоступность; `400` — нарушение схемы;
   - шапка файла называет ограничение DEC-A-046: фото уходит стороннему обработчику, текст
     согласия `2026-09-v1` его не называет, включение на живых пользователях требует новой
     версии согласия ЛИБО фиксации одного обработчика.
4. **Селектор** `apps/recognizer/src/provider/select.ts`: ветка `openrouter` с теми же честными
   отказами, что у `live` (нет ключа → `Error` с именем переменной; нет `ImageFetcher` → `Error`).
5. **Наблюдаемость.** `ModelProvider.kind` (`types.ts`) и `mode` в
   `observability/model-call-log.ts` расширены до `'fake' | 'live' | 'openrouter'` — оба места
   были типизированы закрытым списком БЕЗ третьего варианта, обнаружено `tsc`.
6. **Тесты:**
   - `tests/unit/provider-openrouter.test.ts` (новый, 13 тестов, сеть перехвачена
     `vi.stubGlobal('fetch', …)`): успешный разбор + эхо роли; носитель эскалации ≠ носитель
     основного вызова; `error` в теле 200 → `ProviderUnavailableError`; отсутствующее и
     нечисловое поле схемы → `ModelSchemaViolationError` с именем поля (в т.ч. вложенный путь
     `items[0].mass_g`); `429`/`500`/`503` → `ProviderUnavailableError`; `400` →
     `ModelSchemaViolationError`; сетевой сбой (не abort) → `ProviderUnavailableError`; уже
     отменённая/просроченная операция не начинается (fetch не вызван); дедлайн и внешняя отмена
     реально прерывают `fetch` — проверено, что мок ПОЛУЧИЛ сработавший `signal`
     (`sentSignal.aborted === true`); страж сверки схемы с `MODEL_RESPONSE_SCHEMA` — РЕАЛЬНЫЙ
     динамический импорт мутированной копии модуля (временный файл рядом, случайное имя,
     удаляется в `finally`): расхождение валит загрузку (красный), исходный файл грузится без
     ошибки (зелёный) — обе стороны в одном тесте.
   - `tests/unit/source-guards.test.ts`: добавлен страж «JSON-схема `openrouter.ts` не несёт
     `calories`/`kcal`/`protein`/`fat`/`carbs` как КЛЮЧ», испытан мутацией (внедрение `protein`
     красит, восстановление — зеленит), той же формы, что существующий страж для `live.ts`.
   - `tests/integration/provider-adapter.test.ts`: `OPENROUTER_CONFIG` + три теста, зеркальных
     существующим `live`-тестам (отказ без ключа, конструирование с ключом, отказ без
     `ImageFetcher`); `LIVE_CONFIG` дополнен полем `openrouterApiKey: undefined` (стало
     обязательным полем типа).
   - `tests/unit/config.test.ts`: два новых теста (`openrouter` без ключа валит старт;
     `openrouter` с ключом принимается, `anthropicApiKey` при этом `undefined`).
   - `tests/integration/check-env-wiring.test.ts`: `RECOGNIZER_VARIABLES` дополнен
     `OPENROUTER_API_KEY` — иначе фикстура разошлась бы с реальным `env.ts`, читающим новую
     переменную, и «полная конфигурация» ложно репортила бы потерю.
7. **Документы:** `docs/operations/model-provider-options.md` — раздел «Статус на 2026-09-13
   (после реализации)» + «Как включить» (переменные, команда перезапуска `recognizer`, три
   проверки, обязательный шаг согласия ДО живых пользователей, откат). `docs/canon.md` §6 —
   строка о том, что роли канона (основной вызов, эскалация) неизменны, носитель выбирается
   поставщиком, отображение для `openrouter` — кодом.

## Прогоны и коды возврата

| Команда | Код |
|---|---|
| `npx vitest run` (весь unit-набор, 43 файла, 310 тестов) | 0 |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` (67 файлов, 263 теста, включая конкурентные) | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm run build` (shared → db → api/recognizer/web, включая `next build`) | 0 |
| `node ../../.claude/hooks/check-ports.cjs .` | 0 |
| `bash scripts/check-env-wiring.sh .` (реальный `docker compose config`, не фикстура) | 0 |
| `node ../../.claude/hooks/check-model-cost.cjs .` | 0 (2 вызова названы, оба с пределом на пользователя и в сутки — роли канона не изменились, третьей строки не потребовалось) |
| `docker compose config` | 0 (синтаксис не нарушен) |

**`bash ../../scripts/check-port-conflicts.sh .` — код 1, и это НЕ регрессия этой фичи.**
Причина: на машине уже поднят стенд `--profile edge` этого же проекта (владелец показывает его
по публичному адресу — трогать запрещено прямым указанием), и его собственный `proxy` держит
`127.0.0.1:4180`. Проверка конфликтует с самой собой, потому что второй `docker compose up` того
же compose-файла не выполнялся: я НЕ публиковал новых портов и НЕ трогал `docker-compose.yml` в
части `ports:` — единственная правка сервиса `recognizer` в этом файле добавляет
`OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}` в `environment:`, портов не касается.

## Что НЕ проверено и почему

- **Реального вызова OpenRouter не было.** Ключа на машине нет и в тестах он не использовался —
  вся сетевая часть перехвачена моком `fetch` (`testing.md`: «тесты не ходят в интернет»). Это
  тот же честный пробел, что у `live.ts` (DEC-A-009): собираемость и логика разбора доказаны,
  форма реального ответа OpenRouter — нет.
- **`N4_MODEL_PROVIDER` в `.env` этой машины не трогался** (значение `fake`, переключает
  владелец) и стенд `--profile edge` не перезапускался — прямой запрет задачи.
- **Профиль `--profile edge` не трогался ни разу** ни командой, ни правкой `ports:`.

## Ограничение DEC-A-046 — исполнено

Переключатель `N4_MODEL_PROVIDER=openrouter` НЕ активирован нигде: `.env.example` и
`docker-compose.yml` по-прежнему дефолтят в `fake`. Включение на живых пользователях требует
решения владельца о тексте согласия — записано в шапке `openrouter.ts` и в разделе «Как
включить» `docs/operations/model-provider-options.md`.

Status: completed
