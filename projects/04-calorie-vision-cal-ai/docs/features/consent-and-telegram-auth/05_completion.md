# Фича `consent-and-telegram-auth` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Это ПЛАН выпуска фичи (Phase 1), а не отчёт о нём. Ни одного файла кода, миграции и теста ещё не
существует. Команды и `## Criterion coverage` ниже — целевые; Phase 3 заполняет их фактическими
путями, заголовками тестов и кодами возврата в своей квитанции.

## Порядок выполнения Phase 3

1. **Проверка подписи Telegram.** `apps/api/src/auth/verify-init-data.ts` — эталонный вектор из
   официальной документации Telegram, затем подделанные и просроченные варианты. Критерий
   готовности: единственная точка возврата `401` подтверждена статическим тестом.
2. **Токен бота.** `src/auth/token-format.ts`, подключение к `bootstrap.ts` (расширение
   `ValidateRuntimeConfig` из `foundation`, не новый файл валидатора).
3. **`POST /api/v1/auth/telegram`.** Маршрут, транзакция входа/связывания/переноса. Тесты: перенос
   дневника, вход с другого устройства, повторный вход, вход после `erased`.
4. **Согласие.** `src/consent/known-versions.ts`, `grant-or-decline.ts`,
   `routes/consent.ts`. Тесты: grant, decline, неизвестная версия/хэш.
5. **Граница записи дневника.** `src/consent/enforce-before-diary-write.ts` — реализуется здесь,
   импортируется `scan-pipeline`. Порядок ВАЖЕН: `scan-pipeline`, если её код уже существует на
   момент этой фичи, обязана быть переключена на импорт, а не оставлена с собственной проверкой
   (сверяется по `git grep` на дублирующую логику в Phase 3 квитанции).
6. **Удаление.** `routes/account-delete.ts` (`withdraw_consent`, `erase_all`, `409`, `422`), затем
   `apps/recognizer/src/consent/erasure-job.ts` и миграция `002_erasure_index.sql`. Тесты:
   последовательные для отзыва/erase_all/`409`/`422`, конкурентные для гонки `erase_all` и для
   `erasure-job` с активным сканом.
7. **Аудит.** `packages/shared/src/audit/consent-denied.ts`.
8. **Экраны.** `apps/web` — кнопка входа, экран согласия (после результата, до записи дневника),
   экран удаления с двумя раздельными действиями.
9. **Редактор журнала.** Расширение списка запрещённых полей `foundation`
   `packages/shared/src/log/redact.ts`.

Коммиты — по логическим группам (`feat(consent-and-telegram-auth): …`), с трейлером
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; push делает координатор.

## Команды

```bash
# 1. Сборка и проверки монорепо (из каталога проекта)
npm ci
npm run build
npm run lint
npm test                      # unit + integration + конкурентные, vitest 3

# 2. Миграция индекса эразуры и тесты, которым нужна настоящая база
docker compose --profile test run --rm test npm run migrate
docker compose --profile test run --rm test npm test

# 3. Порты — ДО любого up
node ../../.claude/hooks/check-ports.cjs .
bash ../../scripts/check-port-conflicts.sh .

# 4. Стек
docker compose build
docker compose --profile app up -d
docker compose ps
docker compose --profile edge up -d

# 5. Стражи фичи
node ../../.claude/hooks/check-job-contract.cjs .        # RunErasureJob — три состояния, идентификатор до начала работы
node ../../.claude/hooks/check-model-cost.cjs .           # эта фича не вызывает модель, но ворота обязаны пройти на проекте целиком

# 6. Ворота трассировки фичи
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Чеклист готовности

- [ ] `npm ci`, `npm run build`, `npm run lint`, `npm test` — код `0` каждая, вывод в квитанции.
- [ ] `verify-init-data.ts` проходит эталонный вектор Telegram И подделанные/просроченные варианты;
      единственная точка возврата `401` подтверждена статическим тестом (не тайминг-тестом).
- [ ] `TELEGRAM_BOT_TOKEN` неверного формата валит старт `api` с названной причиной, ДО открытия
      сокета; отсутствие/пустота уже ловится compose (`foundation`) — оба прогона в квитанции.
- [ ] Перенос дневника атомарен: конкурентный/injected-failure тест доказывает откат ВСЕХ строк при
      сбое посередине, а не частичный перенос.
- [ ] Вход с другого устройства и повторный вход после `erased` дают корректные `account_id`
      (тот же / новый соответственно) — оба прогона в квитанции.
- [ ] `POST /consent` отклоняет неизвестную версию И несовпавший хэш одним и тем же кодом `422`.
- [ ] `EnforceConsentBeforeDiaryWrite` — единственное место проверки согласия; `scan-pipeline`
      импортирует эту функцию (проверено `git grep`, не декларацией).
- [ ] Конкурентный тест `erase_all`: два одновременных запроса дают ровно один переход в `erasing`,
      второй — `409`, `deletion_requested_at` не сдвигается.
- [ ] `RunErasureJob`: конкурентный/интеграционный тест доказывает, что активный `recognition`
      откладывает удаление ОДНОГО аккаунта, не блокируя батч остальных.
- [ ] `RunErasureJob` идемпотентна: повторный прогон на `erased`-аккаунте не изменяет ничего и не
      падает.
- [ ] Ни в одном журнале нет `TELEGRAM_BOT_TOKEN`, производного секрета, сырой строки `init_data`.
- [ ] Все три пункта DEC-A-016 реализованы, а не только задекларированы: `initdata-replay.test.ts`
      доказывает отказ `401 initdata_replayed` на повторе И проход на новой `initData`; конкурентный
      тест доказывает атомарность сверки/записи `last_telegram_auth_hash` под гонкой; `withdraw`
      обнуляет `consent_at` и последующая запись/карточка получает `403 consent_required`
      (проверено отдельным тестом, не только чтением кода).
- [ ] `## Criterion coverage` ниже заполнен ФАКТИЧЕСКИМИ заголовками тестов, и ворота
      `--completion` возвращают `0`.

## Что эта фича НЕ доказывает

- Реального Telegram-бота и живого `initData` от настоящего клиента — нет: тест использует эталонный
  вектор ИЗ ДОКУМЕНТАЦИИ и синтетические подписи, вычисленные тем же кодом на тестовом токене;
  сквозной прогон из настоящего Telegram Mini App — на РАЗВЁРНУТОМ стенде, следующая фаза проекта.
- Защиты от повтора `initData`, перехваченной и использованной АТАКУЮЩИМ РАНЬШЕ законного владельца
  (гонка «кто первый») — DEC-A-016 блокирует ВТОРОЕ использование уже использованной строки, а не
  первое; это ограничение самой схемы (без PKI на стороне клиента не устранимо), не пробел этой
  фичи.
- Что данные ФИЗИЧЕСКИ недоступны после `erased` НА УРОВНЕ ХРАНИЛИЩА (бэкапы БД, журналы репликации,
  снапшоты MinIO) — эразура удаляет строки и объекты через штатный API; политика хранения бэкапов не
  входит в объём этой фичи и не покрывается никаким её тестом.
- Наблюдаемости эразуры для оператора (сколько аккаунтов сейчас `erasing`, сколько просрочило
  72-часовой дедлайн) — канон не резервирует под это ни маршрута, ни расширения NFR-OPS-001; это
  осознанный пробел, а не забытый.

## Criterion coverage

**Таблица ПЛАНОВАЯ.** Пути файлов и заголовки — ожидаемые; Phase 3 заменяет их фактическими и
только после этого ворота `--completion` имеют смысл: они открывают файл и ищут заголовок дословно.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-consent-and-telegram-auth-1 | tests/integration/auth-telegram.test.ts | успешный вход переносит все записи анонимного дневника в аккаунт |
| AC-consent-and-telegram-auth-2 | tests/unit/verify-init-data.test.ts | подделанная подпись отклоняется без создания аккаунта |
| AC-consent-and-telegram-auth-3 | tests/unit/verify-init-data.test.ts | верная подпись с auth_date старше 24 часов отклоняется |
| AC-consent-and-telegram-auth-4 | tests/unit/verify-init-data.test.ts | ответ 401 для подписи и свежести возвращается из одной точки исходника |
| AC-consent-and-telegram-auth-5 | tests/integration/initdata-replay.test.ts | повторное использование той же initData в пределах 24 часов отклоняется как initdata_replayed |
| AC-consent-and-telegram-auth-6 | tests/integration/auth-telegram.test.ts | вход с другого устройства связывается с существующим аккаунтом без потери или задвоения дневника |
| AC-consent-and-telegram-auth-7 | tests/unit/verify-init-data.test.ts | пустой init_data отклоняется как ошибка ввода без вычисления подписи |
| AC-consent-and-telegram-auth-8 | tests/integration/consent.test.ts | согласие с известной версией сохраняет версию хэш и время |
| AC-consent-and-telegram-auth-9 | tests/integration/consent.test.ts | отказ от согласия оставляет съёмку и результат доступными |
| AC-consent-and-telegram-auth-10 | tests/unit/consent.test.ts | неизвестная версия и несовпавший хэш отклоняются одним кодом |
| AC-consent-and-telegram-auth-11 | tests/unit/enforce-before-diary-write.test.ts | запись дневника без согласия отклоняется на границе фичи |
| AC-consent-and-telegram-auth-12 | tests/integration/account-delete.test.ts | отзыв согласия закрывает карточки и блокирует новую запись дневника consent_required |
| AC-consent-and-telegram-auth-13 | tests/integration/account-delete.test.ts | запрос erase_all переводит аккаунт в erasing и отвечает синхронно с дедлайном |
| AC-consent-and-telegram-auth-14 | tests/concurrency/account-delete-race.test.ts | повторный erase_all во время erasing получает 409 без сдвига дедлайна |
| AC-consent-and-telegram-auth-15 | tests/integration/erasure-job.test.ts | фоновая задача завершает удаление в срок и повторный прогон идемпотентен |
| AC-consent-and-telegram-auth-16 | tests/concurrency/erasure-job.test.ts | активный скан откладывает удаление одного аккаунта не блокируя остальные |
| AC-consent-and-telegram-auth-17 | tests/unit/account-delete.test.ts | запрос без confirm отклоняется без изменения статуса |
| AC-consent-and-telegram-auth-18 | tests/unit/consent-denied-audit.test.ts | передача дневника наружу без согласия отклоняется и попадает в аудит |
| AC-consent-and-telegram-auth-19 | tests/unit/token-format.test.ts | токен бота неверного формата валит старт с названной причиной |
| AC-consent-and-telegram-auth-20 | tests/integration/auth-telegram.test.ts | вход после удаления аккаунта создаёт новый аккаунт без восстановления старых данных |
