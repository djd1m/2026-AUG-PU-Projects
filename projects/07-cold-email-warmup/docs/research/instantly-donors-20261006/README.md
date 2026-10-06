# Доноры Instantly для N7: зрелость и переиспользование

Дата: 2026-10-06. Результат запрошенного владельцем read-only анализа в рое.
Два агента проверили доноров, третий — совместимость с N7; координатор независимо
проверил ключевые находки и объединил рекомендации. Код продукта не менялся.

## Решение

Сохранить N7 основной системой. Донор `01` полезнее для небольших TypeScript-фрагментов
и UX, донор `00` — преимущественно для предметных сценариев и интерфейса.
Ни один не является готовым безопасным SMTP/IMAP-модулем. Замена backend N7,
его очереди, авторизации или криптографии донорскими реализациями не рекомендуется.

Источники зафиксированы по Git SHA, а не по изменяемому `main`:

| Проект | Ревизия | Стек | Итоговая зрелость по исходникам |
|---|---|---|---|
| [instantly-00](https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/tree/02689350083fa6961df07d47aca8ea9079b1f527) | `0268935` | Python/FastAPI/SQLAlchemy, React/Vite | Около 2/5: учебный функциональный прототип |
| [instanly-01](https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/tree/fdf565827880813c97535c9aa68ea7fa08ee4339) | `fdf5658` | TypeScript/Nest/Prisma/BullMQ, Next/React | 1/5: существенные разрывы интеграции |
| N7, baseline анализа | `243f0425` | TypeScript/native HTTP/pg, PostgreSQL | Локальный MVP принят; реальные почта, оплата и deployment не приняты |

Единая интерпретация: 0 — отсутствует, 1 — существенные разрывы, 2 — учебный прототип,
3 — проверенный ограниченный MVP, 4 — проверенный production-пилот, 5 — подтверждённая
устойчивая эксплуатация. Это экспертная оценка, не измеренный показатель качества.
У donor00 агент получил среднее 1,7/5 по семи осям; здесь оно округлено до уровня
«около 2». Donor01 ограничен уровнем 1 из-за критических разрывов, независимо от
числа модулей. Средние разных осей не заменяют проверку готовности доставки.

## Донор 00

Полезное: связные React-экраны кампаний, шагов, лидов, аккаунтов и аналитики;
компактное разделение router/service/model; SMTP/Resend примеры; 22 статически
найденные test-функции в двух модулях. Это не доказательство успешного запуска.

Критические ограничения:

- Чужой `campaign_step_id` выбирается без проверки принадлежности кампании/tenant:
  [email_sender.py:208](https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/blob/02689350083fa6961df07d47aca8ea9079b1f527/services/email_sender.py#L208).
- Публичный callback ответа не проверяет подпись или авторизацию:
  [emails.py:214](https://github.com/djd1m/2026-PU-APR-LESSON-05-instantly-00/blob/02689350083fa6961df07d47aca8ea9079b1f527/routers/emails.py#L214).
- SMTP использует произвольный host; TLS включается только для 465/587, retry
  захватывает неоднозначные ошибки. Send до общего commit и отсутствие durable
  claim допускают повторную отправку после сбоя.
- `BackgroundTasks` запускает разовую отправку; `delay_days` не реализует расписание
  follow-up. После первого письма `contacted` исключается из дальнейшего отбора.
- Credentials хранятся обычными строками; нет N7 final stop fence, общей безопасной
  квоты и подтверждённой обработки жалоб.
- Compose публикует БД и включает dev/debug; нет versioned migrations, tracked
  lockfiles или CI workflow. Healthcheck не подтверждает доступность БД.

Полные доказательства и границы выводов: [donor00-review.md](donor00-review.md).

## Донор 01

Полезное: более близкий к N7 язык, CSV aliases EN/RU, BOM/статистика/дедупликация,
формы кампаний и отдельные таблицы/status-компоненты; небольшие примеры Nodemailer.
Присутствие Nest/Prisma/BullMQ само по себе не подтверждает согласованность модулей.

Критические ограничения:

- Workers используют camelCase, схема — snake_case; нет соответствующих Prisma aliases.
- Аккаунт сохраняет пароль через AES-GCM, send worker читает его через AES-CBC:
  [encryption.service.ts:7](https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/common/encryption.service.ts#L7)
  и [email-send.processor.ts:110](https://github.com/djd1m/2026-PU-APR-LESSON-05-instanly-01/blob/fdf565827880813c97535c9aa68ea7fa08ee4339/src/workers/email-send.processor.ts#L110).
- SMTP send идёт перед DB update; последующая ошибка вызывает retry без
  `unknown_delivery`. Worker не повторяет consent/pause/suppression/quota проверку.
- IMAP отключает проверку TLS-сертификата; нет подходящего UIDVALIDITY/cursor/dedup
  контракта. Фиксированное ожидание async-парсинга не доказывает завершение чтения.
- Общий warmup выбирает connected peers без отдельного согласия; consumer
  WARMUP_SEND отсутствует в проверенной регистрации workers.
- Часть интерфейса использует mock-данные. Connection diagnostics возвращает
  IMAP «ok» после проверки только SMTP.
- В полном Git tree нет исполняемых test/spec файлов, lockfiles и CI workflows.
  Dockerfile вызывает `npm ci`, worker entrypoints и health route расходятся с кодом.

Полные доказательства и границы выводов: [donor01-review.md](donor01-review.md).

## Матрица заимствования

«Адаптировать» означает новую ограниченную реализацию с проверками N7, а не
прямое подключение донорского класса. Сложность порядковая; срок не прогнозировался.

| Кандидат | Донор | Решение | Сложность / необходимая адаптация |
|---|---|---|---|
| CSV aliases, BOM, нормализация и статистика | 01, `src/leads/csv-import.service.ts` | Лучший небольшой кандидат | Низкая–средняя: выделить чистые функции, ограничить строки/размер, сохранить tenant и allowlisted поля; DB dedup/insert counts отдельно |
| Формы и структура экранов кампаний/шагов/лидов | Оба | Заимствовать UX и небольшие фрагменты | Средняя: React/Next не совпадают с текущей server/TS оболочкой N7; сохранить реальное API, мобильность и доступность |
| Table/EmptyState/StatusBadge | 01 | Идея или точечная адаптация | Низкая–средняя; заменить mock-данные, проверить актуальные состояния |
| SMTP transport construction | 01, `src/email/email.service.ts` | Reference для будущего live-адаптера | Высокая: pinning/TLS/abort, стабильный Message-ID, outcome classification; сохранить N7 state machine |
| Диагностика SMTP/IMAP | 01 | Заимствовать UX, реализацию переработать | Средняя: два реальных независимых результата, без фиктивного «ok» и отправки DATA |
| IMAP correlation/parsing | 01 | Только алгоритмическая подсказка | Высокая: bounded UID header reader, UIDVALIDITY, coveredThrough, atomic cursor и semantic dedup |
| Reply/transport негативные сценарии | Оба | Перевести находки в будущие тесты N7 | Средняя: реальные PG и protocol fixtures; донорские mocks не приёмка |
| Mailivery API shape | 00 | Возможный будущий research/reference | Не нужен для текущего N7 MVP; контракт провайдера и реальные наблюдения здесь не проверялись |
| Auth, crypto, send/retry workers, scheduler и warmup policy | Оба | Не переносить целиком | Ослабляют принятые N7 consent/tenant/quota/stop/unknown-delivery защиты |
| Nest/Prisma/BullMQ/Redis инфраструктура | 01 | Не добавлять ради reuse | У N7 уже есть PostgreSQL queue и транзакционная граница; новая инфраструктура не закрывает выявленные дефекты |
| AI-персонализация, CRM/OAuth, искусственные открытия/mark-not-spam | Оба | Не включать в этот перенос | Не требуется принятым планом N7; наличие донорского кода не меняет scope |
| Оплата | Оба | Готового донора нет | Сохранять существующий TEST billing N7; реальный provider — отдельная задача |

Для малого улучшения первый кандидат — CSV импорт. Для выхода к живому почтовому
пилоту приоритет другой: новая live capability и проверка соединения, затем тонкий
SMTP-адаптер и bounded IMAP reader. Чинить оба донорских backend целиком для этого
нецелесообразно. Это рекомендации, не автоматически добавленные задачи roadmap.

## Неприкосновенные границы N7

N7 `SubmissionAdapter.submit(TestMessage)` не принимает SMTP credentials/endpoint;
literal mode и poll worker сейчас local-only. Замена одного класса не включает live.
Новая доверенная capability должна сохранить:

- отдельные pool/campaign consent и повторную eligibility проверку;
- общий advisory lock stop writers / final submitting commit;
- общую UTC-квоту pool+campaign и существующий recovery;
- `unknown_delivery` вместо слепого retry после возможного SMTP DATA;
- UIDVALIDITY/cursor, доказанное покрытие чтения и semantic reply dedup;
- versioned AES-GCM с tenant/mailbox AAD, keyring вне Git;
- стабильные Message-ID и обязательные unsubscribe headers/body;
- операторский gate реальной почты, без использования тестового «verified» как live.

Точные интерфейсы и 31 ссылка на исходники: [n7-compatibility.md](n7-compatibility.md).

## Что проверено и что не проверено

Проверены актуальные Git HEAD, полный список tracked файлов, содержимое ключевых
модулей, связь схемы/crypto/очередей, наличие тестов/lockfiles/CI и соответствие N7.
Не выполнялись установка зависимостей, сборки, тесты, контейнеры, UI/E2E, SMTP/IMAP,
Mailivery/платные API или эксплуатационные проверки. Найденные ошибки — выводы
статического анализа; наблюдённый build failure или доказанный exploit не заявляются.

Лицензионная метадата: у 00 README badge MIT, но tracked LICENSE не найден;
у 01 README содержит Private/Proprietary, отдельного LICENSE также нет. Здесь
зафиксированы артефакты, а не сделан вывод о правах владельца этих репозиториев.
Комментарии агентов о лицензировании не требуют повторного подтверждения уже
данного владельцем разрешения на сам анализ.

Профиль: bounded read-only swarm. Код не писался, фактические модели native агентов
не раскрыты; переключения моделей не заявляются. Usage/cost неизвестны. Измеренная
длительность compatibility review — 292 с; начало всей задачи отдельно не измерено.
Телеметрия и SHA отчётов: [run.json](run.json). Производство роликов остаётся на паузе.
