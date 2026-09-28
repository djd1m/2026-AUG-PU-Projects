# План — f3-access-onboarding (подтверждение почты, восстановление пароля, Yandex ID, инструкции провайдеров)

Дата: 2026-09-28. Статус: **ПЛАН, ждёт утверждения владельца.** Код, миграции, стенды `n3-*` в
рамках этого плана не менялись, тесты не запускались.

Исходная ревизия, на которой составлен план: `4cddc607` (HEAD рабочей ветки на 2026-09-28).
Одобренная постановка: [../../plans/f3-access-and-provider-setup.md](../../plans/f3-access-and-provider-setup.md)
(одобрена 2026-09-09). Замороженные SPARC-документы фичи: [01_specification.md](01_specification.md)
(sha256 `cd341f86…75a8`), [02_pseudocode.md](02_pseudocode.md), [03_architecture.md](03_architecture.md),
[04_refinement.md](04_refinement.md), [validation-report.md](validation-report.md) (вердикт READY).

## 0. Главное, что нужно знать до чтения плана

**Утверждение «реализация не начиналась» не соответствует репозиторию.** Проверено по git:

| Факт | Доказательство |
|---|---|
| Реализация доведена до контрольной точки и закоммичена | `422db0fb` (адаптеры Resend/Yandex, 2026-09-09), `444d3123` (ядро, HTTP, UI, тесты, 45 файлов, +2895 строк) — оба предки HEAD |
| Прогон прерван по просьбе владельца перед занятием | [run.json](../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/run.json): `status: interrupted`, `required_gates_passed: false` |
| На контрольной точке зелёное | [class-checkpoint.md](../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/evidence/class-checkpoint.md): backend 154/154, публичные CJM 49/49, account+MCP/A2A 2/2, изолированный браузер access 2/2, build A–D |
| Частичное ревью ядра, две находки P2 исправлены | [core-review-receipt.md](../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/evidence/core-review-receipt.md) |
| Пять инструкций провайдеров написаны | [../../integrations/](../../integrations/resend.md) — `yookassa.md`, `yandex-kassa.md`, `cloudpayments.md`, `resend.md`, `yandex-id.md`; [docs-receipt.md](../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/evidence/docs-receipt.md) |
| **На стенде access НЕТ** | выкладка F4 `acf124e` собрана от `f8055e3` «excluding unfinished unrelated auth work» ([f4 completion](../f4-proofwall-integration/05_completion.md), п.6); `444d3123` не предок `acf124e` |
| **Но в HEAD access ЕСТЬ** | любая следующая сборка из HEAD (по любому поводу) выкатит незавершённый access и закроет публичную регистрацию, пока почта не настроена — см. риск R1 |

Поэтому этот план — не «с нуля», а **план доведения до приёмки**: карта переиспользования
показывает, что из N1 уже перенесено и как; единицы работы — только то, чего не хватает.
Две найденные при подготовке плана дыры (равное время ответа, ключ адреса в лимитах) в
контрольной точке не закрыты и не закрыты в доноре N1 — их закрытие пишется заново.

**Тир.** Задача названа тиром L. По [complexity-router](../../../../../.claude/rules/complexity-router.md)
нижняя граница — L (новые таблицы, новый публичный путь, новые внешние вызовы), но смена
границы доверия учётной записи и необратимая (sticky) политика верификации — признак XL;
одобренная постановка и телеметрия прогона уже классифицировали фичу как **XL**. План держит
XL (строже). Остановка на плане у владельца одинакова для L и XL.

## 1. Объём и критерии приёмки

Объём по одобренной постановке: подтверждение email при регистрации и для SSO-контакта,
восстановление пароля через Resend, вход и явная привязка Yandex ID, пять инструкций
провайдеров, общий UI A–D. CloudPayments — только инструкция, без адаптера; автовыплат нет.

Критерии — замороженные номера спецификации (текст — в [01_specification.md](01_specification.md)):

| AC | Суть | Состояние на `444d3123` |
|---|---|---|
| AC-f3-access-onboarding-11 | Регистрация только после доказательства владения ящиком; пароль задаёт получатель; одна организация | реализовано, тест есть |
| AC-f3-access-onboarding-12 | Reset существующего аккаунта: ID/членства целы, version+1, отзыв cookie/agent/referral | реализовано, тест есть |
| AC-f3-access-onboarding-13 | Одноразовые purpose-bound токены; GET не гасит; токен во фрагменте | реализовано, тест есть |
| AC-f3-access-onboarding-14 | Честный ответ без перечисления; квоты; нет SQL во время IO | **частично**: содержимое ответа одинаково, **время — нет** (§4.1); квота «по адресу» считает адрес прокси (§4.2) |
| AC-f3-access-onboarding-21 | Yandex code+PKCE S256, одноразовый state, host-only cookie, 10 мин | реализовано, тест есть |
| AC-f3-access-onboarding-22 | Ключ — `(provider, external_id)`; автосвязывания по email нет | реализовано, тест есть |
| AC-f3-access-onboarding-23 | Явная привязка/отвязка со свежим паролем | реализовано, тест есть |
| AC-f3-access-onboarding-24 | SSO-контакт: сессия И токен; sticky-политика | реализовано, тест есть |
| AC-f3-access-onboarding-31 | Общий доступный UI A–D | реализовано, браузер 2/2 изолированно; ревью UI не было |
| AC-f3-access-onboarding-32 | Пять инструкций провайдеров | написаны; сверка с финальной конфигурацией не делалась |
| AC-f3-access-onboarding-41 | Гонки, мутации, полная регрессия | **мутаций access нет** (`scripts/mutation-check.mjs` — 22 мутации, ни одной access) |
| AC-f3-access-onboarding-42 | Совместимая выкладка, раздельные доказательства | **не выполнено**: не выложено |

Предлагаемые **дополнения** к спецификации (правка `01_specification.md` меняет замороженный
SHA, поэтому только после утверждения владельцем — вопрос В9):

- **AC-f3-access-onboarding-15 — равное время ответа.** Для известного, неизвестного и
  неподходящего адреса время ответа `register`/`forgot`/`contact-email` не зависит от того,
  выпущено ли письмо: отправка не ожидается внутри ответа. Проверка: при провайдере, который
  не отвечает никогда, запрос на известный адрес завершается за то же ограниченное время, что
  на неизвестный.
- **AC-f3-access-onboarding-16 — ключ адреса = адрес клиента, а не прокси.** Квоты `peer` и
  `pair` считаются по адресу конечного клиента, извлечённому только из заголовка, записанного
  доверенным прокси N3; от недоверенного источника заголовок игнорируется.

## 2. Карта переиспользования из N1 (и N2)

### 2.1. Почему «перенести как есть» почти ничего нельзя

| Свойство | N1 `01-testimonials-senja` | N3 `03-affiliate-rewardful` | Что мешает переносу кода |
|---|---|---|---|
| Язык/каркас | TypeScript, Next.js 15 route handlers | чистый Node 22 ES modules, собственный HTTP-роутер `apps/api/*.mjs` | ни импорт, ни `NextResponse`, ни типы не переносятся |
| Схема БД | нумерованные SQL-миграции `packages/db/migrations/NNN_*.sql`, `schema_migrations`, роли и RLS | одна идемпотентная DDL-строка, склеенная в [schema.mjs](../../../shared/infrastructure/schema.mjs); ролей/RLS нет | номера миграций к N3 неприменимы; гранты/RLS N1 не нужны |
| Конфигурация | `process.env.RESEND_API_KEY`, `MAIL_FROM`, `YANDEX_CLIENT_*` | Docker secret JSON `N3_ACCESS_CONFIG_FILE` → `.runtime/access.json` | имена переменных заменяются полями JSON |
| Отзыв доступа | удаление/отзыв `sessions` | `accounts.version` + `user_sessions`, `agent_credentials`, `referral_credentials` | reset N1 отзывает только сессии — для N3 мало |
| Origin | один `BASE_URL` | четыре точных HTTPS origin A–D ([deployment.mjs](../../../shared/contracts/deployment.mjs)) | ссылки и callback N1 однодоменные |
| Аккаунт | аккаунт = проект Proofwall | аккаунт + tenant + membership | создание аккаунта N1 не создаёт организацию |
| KDF | argon2 внутри транзакции reset | Argon2id вне SQL, max 2 одновременно ([password.mjs](../../../shared/identity/password.mjs)) | порядок операций N1 держит соединение пула на время KDF |

Итог: переносятся **константы, тексты, решения и сценарии тестов**; код — адаптацией.

### 2.2. Блок за блоком

| # | Блок | Решение | Источник в N1 | Цель в N3 | Что именно / почему |
|---|---|---|---|---|---|
| 1 | Отправка через Resend | **адаптировать** (сделано в `422db0fb`) | [email.ts](../../../../01-testimonials-senja/apps/web/src/lib/email.ts) | [providers/resend.mjs](../../../shared/identity/providers/resend.mjs), [providers/http.mjs](../../../shared/identity/providers/http.mjs) | взяты: fetch без SDK, bearer, таймаут 8 с, отказ без конфигурации. Добавлено: предел тела 64 КиБ, запрет редиректов, max 4 одновременно, снимок конфигурации, JSON-секрет вместо env |
| 2 | Шаблон письма | **адаптировать** (сделано) | `resetEmail` в том же email.ts | [email-access.mjs](../../../shared/identity/email-access.mjs) | три назначения вместо одного; экранирование HTML; ссылка во фрагменте `#access=…&token=…`, а не в query (не попадает в журналы доступа и Referer) |
| 3 | Токен reset: 32 байта, SHA-256, TTL, гашение предыдущего | **перенести решение как есть, код адаптировать** (сделано) | [password-reset.ts](../../../../01-testimonials-senja/apps/web/src/lib/password-reset.ts), [014_password_reset.sql](../../../../01-testimonials-senja/packages/db/migrations/014_password_reset.sql) | [access-helpers.mjs](../../../shared/identity/access-helpers.mjs) `secret/tokenHash`, таблица `email_flows` в [access-schema.mjs](../../../shared/identity/access-schema.mjs) | одна строка на `(email, purpose)` — новая выдача замещает хэш атомарно, вместо `update … used_at` у N1 |
| 4 | Погашение reset | **адаптировать** (сделано) | `resetPassword` в password-reset.ts, [reset/route.ts](../../../../01-testimonials-senja/apps/web/src/app/api/auth/reset/route.ts) | `complete()` в email-access.mjs | N1 считает argon2 ВНУТРИ транзакции и отзывает только сессии. N3: предпроверка токена → KDF вне SQL → `accounts FOR UPDATE` → `email_flows FOR UPDATE` → перепроверка purpose/email/version/срока фактическим `now()` → хэш + version+1 + отзыв трёх семейств credentials + `used_at` одним коммитом |
| 5 | Маршрут «забыл пароль» | **адаптировать** (сделано) | [forgot/route.ts](../../../../01-testimonials-senja/apps/web/src/app/api/auth/forgot/route.ts) | `request()` в email-access.mjs, `apps/api/access.mjs` | взяты: 503 до выпуска токена при ненастроенной почте (одинаково для всех адресов), отправка после коммита, отказ провайдера не меняет ответ, ни адреса, ни токена в журнале |
| 6 | **Равное время ответа** | **написать заново** | в N1 отсутствует: `await sendEmail` только когда аккаунт есть (forgot/route.ts) | email-access.mjs | N1 закрыл оракул по СОДЕРЖИМОМУ, но не по ВРЕМЕНИ: известный адрес ждёт Resend (сотни мс … 8 с), неизвестный — нет. N3 повторил это. Донора нет |
| 7 | Лимит частоты по адресу | **адаптировать из N1 + N2** | [client-ip.ts](../../../../01-testimonials-senja/apps/web/src/lib/client-ip.ts) (последний элемент XFF от своего прокси); N2 guest-ip-forwarding, коммит `c70afb53` (доверие к XFF только от адреса прокси, очередь по ключу) — в этой ветке ещё не слит, ссылка появится после слияния | `apps/api/access.mjs` (извлечение адреса), `apps/frontend/server.mjs` (запись заголовка), `access-helpers.mjs` (ключ) | сейчас `peer = req.socket.remoteAddress` — это адрес контейнера frontend/хостового прокси: квота 30/час делится на ВСЕХ посетителей варианта (§4.2). Прокси N3 сейчас копирует клиентский `X-Forwarded-For` как есть (`headers: {...req.headers}`) — поэтому «последний элемент» без правки прокси был бы значением атакующего |
| 8 | Атомарная квота | **написать заново** (сделано) | limiter N1 сериализует пару, но общий IP-счётчик — нет (разбор [donor-challenge.md](../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/evidence/donor-challenge.md), п.6) | `createAccessAdmission` в access-helpers.mjs | один короткий advisory-лок на все три ключа, буквальные 5/30/5 в час и cooldown 60 с, потолок 10 000 строк |
| 9 | Подтверждение email | **адаптировать ближайший аналог** (сделано) | полного flow «подтверждение при регистрации» в N1 нет; ближайший аналог — привязанное к сессии доказательство [n3-proof.ts](../../../../01-testimonials-senja/apps/web/src/lib/n3-proof.ts), таблицы в [019_n3_bridge.sql](../../../../01-testimonials-senja/packages/db/migrations/019_n3_bridge.sql), тест [n3-proof.test.ts](../../../../01-testimonials-senja/apps/web/tests/n3-proof.test.ts) | `register/activate/contact/verifyContact` в email-access.mjs | из n3-proof взяты: перепроверка сессии после ожидания лока, гашение прежних токенов, 24 ч, 5/час на аккаунт, 30/час на IP, cooldown 60 с. Заново: регистрация без пароля атакующего — аккаунт и организация создаются только в POST активации |
| 10 | Yandex: авторизация, обмен кода, PKCE, профиль | **адаптировать** (сделано) | [sso.ts](../../../../01-testimonials-senja/apps/web/src/lib/sso.ts), [start/route.ts](../../../../01-testimonials-senja/apps/web/src/app/api/auth/yandex/start/route.ts), [callback/route.ts](../../../../01-testimonials-senja/apps/web/src/app/api/auth/yandex/callback/route.ts) | [providers/yandex.mjs](../../../shared/identity/providers/yandex.mjs), [oauth-access.mjs](../../../shared/identity/oauth-access.mjs) | взяты: эндпоинты, S256, валидация профиля, явный отказ без ключей. Заново: state в БД с погашением `DELETE … RETURNING` ДО сетевого вызова (N1 лишь чистит подписанную cookie — два параллельных коллбэка проходят), привязка к браузеру/origin/intent, общий дедлайн 8 с на обмен+профиль |
| 11 | Yandex: учётка по внешнему ID | **адаптировать с удалением опасной ветки** (сделано) | [sso-account.ts](../../../../01-testimonials-senja/apps/web/src/lib/sso-account.ts), [015_sso.sql](../../../../01-testimonials-senja/packages/db/migrations/015_sso.sql) | `sso_identities` в access-schema.mjs, oauth-access.mjs | N1 **автосвязывает** занятый email, если у аккаунта нет пароля — в N3 запрещено для всех состояний (AC-22). Взяты: ключ `(provider, external_id)`, защита от гонки первого входа |
| 12 | Тесты | **перенести сценарии, переписать код** (сделано частично) | [password-reset.test.ts](../../../../01-testimonials-senja/apps/web/tests/password-reset.test.ts) (31 тест по счёту `it(`), [sso.test.ts](../../../../01-testimonials-senja/apps/web/tests/sso.test.ts) (12) + [sso-transport.test.ts](../../../../01-testimonials-senja/apps/web/tests/sso-transport.test.ts) (39) | `tests/access-*.test.mjs` (7 файлов) | vitest+TS → `node:test`. Числа 31/31 и 51/51 в задаче в документах N1 **не записаны**: [fr-015 05_completion](../../../../01-testimonials-senja/docs/features/fr-015-password-reset/05_completion.md) — чек-лист пуст, колонка «Тест» пуста, в roadmap N1 FR-015 = `planned`; у [fr-016](../../../../01-testimonials-senja/docs/features/fr-016-yandex-id/05_completion.md) записано 13/13 мутаций. Тесты N1 в этом плане не запускались |
| 13 | Таблица мутаций | **адаптировать** | R1–R17 в fr-015, S1–S13 в fr-016 | новый `scripts/access-mutation-check.mjs` по образцу [referral-mutation-check.mjs](../../../scripts/referral-mutation-check.mjs) | список дефектов переносится, места внедрения — N3 |
| 14 | Инструкция ЮKassa | **адаптировать** (сделано) | [yookassa-setup.md](../../../../01-testimonials-senja/docs/yookassa-setup.md) | [integrations/yookassa.md](../../integrations/yookassa.md) | N3: secret JSON, свой webhook, только `payment.succeeded`/`refund.succeeded` |
| 15 | Инструкции Resend, Yandex ID, CloudPayments, Яндекс.Касса | **написать заново** (сделано) | в N1 нет | [resend.md](../../integrations/resend.md), [yandex-id.md](../../integrations/yandex-id.md), [cloudpayments.md](../../integrations/cloudpayments.md), [yandex-kassa.md](../../integrations/yandex-kassa.md) | нет донора; осталось сверить с финальной конфигурацией (U6) |
| 16 | Общий UI A–D | **написать заново** (сделано) | UI N1 — React/Next | [shared/ui/account/access.mjs](../../../shared/ui/account/access.mjs) | стек UI несовместим; переиспользованы собственные guard-ы N3 (`app.mjs`, `helpers.mjs`) |
| 17 | Секреты, магазины, пользователи N1 | **не переносить** | — | — | запрет постановки; у N3 свои ключи (вопросы В1–В3) |

## 3. Единицы работы

Писатель один на worktree. Порядок строгий: U0 → (U1 ‖ U2) → U3 → U4 → U5 → U6 → U7 → U8.
Параллелить можно только U1 и U2 (разные файлы-владельцы), в отдельных worktree.

| Ед. | Что | Файлы-владельцы | Выход | Оценка |
|---|---|---|---|---|
| U0 | Сверить HEAD с контрольной точкой: полный backend-набор в контейнере, build A–D, список расхождений: после `444d3123` в main вошли 22 коммита F4-bridge (`e23ab3ed` правил `apps/api/referrals.mjs` и платежи) | только отчёт в телеметрию | число тестов HEAD (было 154 на `444d312`, после F4 неизвестно) | 1 ч |
| U1 | AC-15: отправка письма не ожидается в ответе; ограниченная очередь отправки в процессе (max 4 уже есть в адаптере), при переполнении — отказ записывается в журнал без адреса/токена | `shared/identity/email-access.mjs`, `tests/access-email.test.mjs` | тест «провайдер не отвечает никогда → ответ на известный адрес за ≤1 с, как на неизвестный» | 1,5 ч |
| U2 | AC-16: frontend-прокси **перезаписывает** `X-Forwarded-For` адресом своего сокета (не копирует клиентский); API доверяет заголовку только от адреса, входящего в закрытый набор прокси N3 в коде (не из env — `honest-configuration` CFG-I8), иначе берёт адрес сокета | `apps/frontend/server.mjs`, `apps/api/access.mjs`, новый `shared/identity/client-address.mjs`, `tests/access-http.test.mjs` | тесты: подделанный XFF от клиента не меняет ключ; два разных клиента за одним прокси — разные ключи; прямой доступ к API не даёт выбрать ключ | 2 ч |
| U3 | Мутационный набор access | новый `scripts/access-mutation-check.mjs` | §5, каждая мутация красная, исходник восстановлен | 2,5 ч |
| U4 | Публичные E2E под регистрацию «сначала почта»: `tests/e2e/account.mjs`, `public-agent.mjs` сейчас регистрируют по-старому (п.5 class-checkpoint) | `tests/e2e/account.mjs`, `tests/e2e/public-agent.mjs`, `scripts/run-public-e2e.mjs` | внутренняя провизия тестового аккаунта только внутри контейнера backend, без HTTP-обхода | 2 ч |
| U5 | Независимое ревью всех 12(+2) AC другим семейством моделей, включая UI и фрагменты; исправления по находкам | только отчёт `review-report.md` + точечные правки | `check-review-contract.cjs` = 0 | 3 ч |
| U6 | Документы: AC→тест в `05_completion.md`, `docs/Architecture.md`, `docs/runtime-contract.md`, `docs/f2-operations.md`; сверка пяти инструкций с финальной конфигурацией; `docs/README.md` | перечисленные docs | ссылки проверены `ls` | 1,5 ч |
| U7 | Выкладка без живых ключей: `.runtime/access.json` (0600) с `enabled:false` у обоих провайдеров → только по решению В6; порты, сети, образы, миграция, A→D, смоук | compose/runtime — только координатор | стенд на коммите-кандидате, 49/49 CJM | 2 ч |
| U8 | Живая приёмка с ключами владельца: письмо в реальный ящик, переход по ссылке ИЗ письма, reset, вход Яндексом, привязка/коллизия | телеметрия | раздельные квитанции «провайдер ответил» / «письмо получено» / «согласие Яндекса пройдено» | 1,5 ч |

**Миграции.** Нумерованных миграций в N3 нет, «следующего свободного номера» не существует:
схема — идемпотентная строка `accessMigration` в
[access-schema.mjs](../../../shared/identity/access-schema.mjs), уже подключённая в
[schema.mjs](../../../shared/infrastructure/schema.mjs) последней. U1–U2 новых таблиц не требуют.
Если ревью (U5) потребует DDL — только дописывать в `accessMigration` операторами
`IF NOT EXISTS`, без DOWN (откат — только совместимым кодом, 03_architecture). Для справки:
в N1 последний номер `020_agent_payments_host.sql`, следующий свободный — `021`, к N3 не относится.

**Конфигурация без значений по умолчанию** (секрет Docker `n3_access_config` → файл
`.runtime/access.json`, 0600, в Git не попадает; значения в примерах отсутствуют):

| Поле JSON | Аналог в N1 | Обязательность |
|---|---|---|
| `mail.enabled` | — | явное `true`/`false`; `true` без двух полей ниже — отказ старта (`CONFIG_INVALID` адаптера) |
| `mail.apiKey` | `RESEND_API_KEY` | обязателен при `enabled:true`; **свой ключ N3**, sending-only |
| `mail.from` | `MAIL_FROM` | обязателен при `enabled:true`; адрес на проверенном в Resend домене N3 |
| `yandex.enabled` | — | явное `true`/`false` |
| `yandex.clientId` / `yandex.clientSecret` | `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` | обязательны при `enabled:true`; **своё приложение N3** |
| `verificationRequired` | — | `true` необратимо (sticky в `access_policy`); без настроенной почты — отказ старта |

Найденный пробел `honest-configuration` CFG-S1: [access-config.mjs](../../../shared/identity/access-config.mjs)
при **отсутствующем** `N3_ACCESS_CONFIG_FILE` молча возвращает «всё выключено». Выключение
не подделывает здоровье, но в новой версии оно **закрывает публичную регистрацию**. Входит в
U7: в режимах `hybrid`/`real` отсутствие файла — отказ старта с названием последствия;
`scripts/check-deployment.mjs` проверяет наличие секрета и печатает, какие провайдеры включены.

## 4. Порядок операций как защита

| Защита | Что уже закрыто и где | Что закрывает донор N1 | Остаток |
|---|---|---|---|
| Одинаковый ответ для несуществующей почты — **содержимое** | `accepted()` одна константа; тест «mail responses are uniform…» в `tests/access-email.test.mjs` | forgot/route.ts, тип `IssueResult` | — |
| Одинаковый ответ — **время** | нет | нет | **U1** (§4.1) |
| Ненастроенная почта → 503 одинаково для всех, ДО поиска аккаунта | `assert(mail.configured…)` в начале `request()` | forgot/route.ts | — |
| Токен: 32 случайных байта, в БД только SHA-256, одноразовый, TTL 24 ч / 1 ч | email_flows, `secret/tokenHash` | password-reset.ts | — |
| Погашение атомарно | `accounts FOR UPDATE` → `email_flows FOR UPDATE` → перепроверка фактическим `now()` → изменение + `used_at` одним коммитом; тест «reset token expiring while waiting for account lock…» | частично: N1 гасит `update … where used_at is null returning`, но KDF внутри транзакции | — |
| GET-сканер не гасит | токен во фрагменте, погашение только явным POST; тест UI «email proof is captured from the fragment…» | нет (у N1 query) | — |
| Ссылка не выдаёт сессию | `activate/reset` → `{completed, loginRequired}` без Set-Cookie | password-reset.ts, п.2 шапки (149-ФЗ) | — |
| Сеть и KDF вне транзакции | адаптеры не импортируют SQL; тест «stalled mail releases SQL pool…» | email.ts (отправитель — параметр) | — |
| Лимит ДО дорогой работы, квота ПОСЛЕ валидации | `originInput → safeTree → object → configured → admit → транзакция` | частично | ключ адреса — **U2** (§4.2) |
| OAuth state гасится ДО сетевого вызова | `DELETE … RETURNING` в oauth-access.mjs; тест «Yandex state is bound…» | нет (подписанная cookie) | — |
| Внешний ID перечитывается после лока аккаунта | тест «OAuth login rechecks external binding…» | нет | — |

### 4.1. Равное время (AC-15)

Сейчас `request()` после коммита делает `await mail.send(...)` только если токен выпущен.
Выпуск зависит от существования аккаунта (`register`: только для свободного адреса; `forgot`:
только для существующего), значит время ответа отличает адреса. Решение U1: ответ
формируется сразу после коммита; отправка уходит в фоновую задачу процесса, ограниченную
существующим пределом адаптера (4 одновременно, 8 с). Это допустимо, потому что ответ уже
не обещает доставку («ожидайте письмо… доставка может задержаться»). Остаточная разница —
одна вставка в `email_flows` против её отсутствия; это миллисекунды внутри SQL, отмечается
как слой 3–4 и не выдаётся за закрытое.

### 4.2. Ключ адреса (AC-16)

API видит адрес сокета frontend-контейнера (или хостового TLS-прокси для `api.*`), а не
посетителя. Значит квота «30 в час на адрес» — общая на вариант: 30 запросов с
произвольными адресами почты блокируют восстановление всем на час. Это ровно класс
`shared-resource-verification` вопрос 4 («кого наказывает механизм»). Лечение U2 копирует
принцип N1 `client-ip.ts` (доверять только элементу, записанному своим прокси) и N2
guest-ip-forwarding (доверие только от адреса прокси). Условие несущее: API не должен быть
доступен снаружи в обход прокси — сейчас опубликован только на `127.0.0.1` (compose,
`N3_BIND:-127.0.0.1`), U7 проверяет это `check-port-conflicts.sh`.

## 5. Стражи с внедряемым дефектом и конкурентные тесты

Новый `scripts/access-mutation-check.mjs` (образец — `referral-mutation-check.mjs`: временная
копия, одно однозначное место замены, прогон набора, ожидаемо красный, восстановление):

| # | Внедряемый дефект | Файл | Ловит тест |
|---|---|---|---|
| A1 | повторное погашение: убрать `used_at IS NULL` из перепроверки | email-access.mjs | «email proofs reject … replay …» |
| A2 | срок проверяется до лока, а не после | email-access.mjs | «reset token expiring while waiting for account lock…» |
| A3 | не сверять `purpose` | email-access.mjs | «email proofs reject wrong purpose…» |
| A4 | reset не увеличивает `version` | email-access.mjs | «legacy reset … revokes cookie agent connector…» |
| A5 | не отзывать `referral_credentials` | access-helpers.mjs `revoke` | тот же |
| A6 | автосвязывание по email для аккаунта без пароля (дефект донора N1) | oauth-access.mjs | «external identity first-login race … never autolinks…» |
| A7 | state не гасится до сетевого вызова | oauth-access.mjs | «Yandex state is bound … one-use claim before provider IO» |
| A8 | PKCE `plain` вместо S256 | providers/yandex.mjs | «Yandex authorize uses S256…» (у адаптеров есть отдельная квитанция воркера — перенести в общий набор) |
| A9 | `verificationRequired` снижается конфигурацией `false` | access.mjs / identity | «sticky verification policy…» |
| A10 | `acceptInvite` без `assertVerified` (находка P2 ревью) | service.mjs | «unverified invite acceptance…» |
| A11 | вернуть `await` отправки в ответ | email-access.mjs | новый тест U1 |
| A12 | прокси снова копирует клиентский XFF / API доверяет XFF от любого адреса | frontend/server.mjs, client-address.mjs | новые тесты U2 |

Нечитаемый вход мутационного скрипта (место замены не найдено или найдено дважды) — код 2 и
сообщение, не «0 мутаций».

Конкурентные тесты (уже есть, прогнать на HEAD в U0): двойное погашение одного токена,
reset против входа/смены пароля, регистрация против первого входа Яндексом на тот же адрес,
параллельный первый вход одной внешней личности, коллбэк-дубль, отзыв сессии во время ожидания
провайдера, зависший Resend не держит пул. **Новые:** (а) N разных клиентов за одним прокси не
делят квоту (U2 — добросовестный параллельный сценарий); (б) 20 одновременных `forgot` с
зависшим провайдером: соединений пула занято не больше, чем без отправки, ответы не ждут
провайдера (U1).

## 6. Что нужно от владельца ДО реализации — закрытый список

| # | Вопрос | Без ответа |
|---|---|---|
| В1 | Аккаунт Resend для N3 и **отдельный** sending-only API-ключ (не ключ N1) | почта `enabled:false`; регистрация недоступна (В6) |
| В2 | Отправляющий домен N3, адрес `from`, доступ к DNS для записей SPF/DKIM (и DMARC), которые выдаст Resend | ключ бесполезен: Resend без проверенного домена шлёт только тестовому получателю |
| В3 | Приложение Yandex OAuth для N3 (не N1): Client ID и secret, права `login:email`, `login:info`, согласие зарегистрировать четыре callback `https://<origin>/api/account/yandex/callback` | вход Яндексом `enabled:false`, кнопка показывает «не настроено» |
| В4 | Постоянный домен вместо `*.212.192.0.33.sslip.io`: регистрировать Yandex и Resend на sslip.io сейчас или ждать домена. Callback и ссылки в письмах привязаны к origin — смена домена = перенастройка приложения Яндекса и недействительность выданных ссылок | делаем на sslip.io, смена домена — отдельная работа |
| В5 | Юрлицо/оператор персональных данных: чьё имя в письмах и на экране согласия Яндекса, ссылка на политику обработки ПДн | письма без реквизитов оператора; публичный запуск не рекомендую |
| В6 | Режим до готовности почты: (а) выкатить access, публичная регистрация закрыта `MAIL_UNCONFIGURED`, старые аккаунты входят; (б) не выкатывать, пока нет В1–В2 | (б): U7 откладывается, HEAD нельзя выкатывать и по другим поводам (риск R1) |
| В7 | Условие включения `verificationRequired=true` (необратимо): дата или «после успешной живой приёмки U8» | остаётся `false` |
| В8 | Контрольный почтовый ящик и Yandex-аккаунт для живой приёмки; присутствие владельца на экране согласия | U8 = НЕ ВЫПОЛНЕНО с причиной |
| В9 | Утвердить тир XL и дополнения AC-15, AC-16 (правка замороженной спецификации) | U1/U2 делаются как исправления без новых AC |
| В10 | Утвердить буквальные пределы: 5/час на почту, 30/час на адрес клиента, 5/час на пару, cooldown 60 с, TTL 24 ч (регистрация, контакт) и 1 ч (reset), OAuth 10 мин | действуют эти значения из 02_pseudocode |

## 7. Оценка

| Что | Часы |
|---|---|
| U0–U7 (доведение до выкладки без живых ключей) | ≈ 15,5 |
| U8 (живая приёмка с ключами владельца) | ≈ 1,5 |
| **Итого активной работы** | **≈ 17 ч, диапазон 13–21 ч** |

Не включено: ожидание ответов владельца, распространение DNS, модерация приложения Яндекса.
Оценка опирается на то, что ядро уже есть (`444d3123`); прежняя 3–5 ч отозвана 2026-09-09 и
сюда не переносится. Тир: **XL** (нижняя граница по роутеру — L).

Риски:

| # | Риск | Мера |
|---|---|---|
| R1 | HEAD содержит невыложенный access: любая сборка из HEAD (исправление N3 по другому поводу) выкатит его и закроет публичную регистрацию без почты | до решения В6 выкладки N3 делать только от ветки выпуска без access, как `acf124e`; записать это в f2-operations (U6) |
| R2 | `verificationRequired=true` необратим; при неработающей почте неподтверждённые владельцы теряют бизнес-доступ | включать только после U8; путь восстановления — reset, проверен тестом sticky-политики |
| R3 | Откат на образ до access после появления аккаунтов без пароля / sticky-политики ломает вход и обходит политику | только совместимый forward-fix (03_architecture) |
| R4 | После `444d3123` в main вошли коммиты F4-bridge (платежи, `apps/api/referrals.mjs`); полный набор на их совмещении с access в документах не записан (выпуск `acf124e` собран без access) | U0 |
| R5 | Лимиты по адресу прокси (§4.2) — отказ в обслуживании восстановления для всех | U2 до выкладки |
| R6 | Ревью ядра было частичным, UI не ревьюировался | U5 другим семейством моделей |
| R7 | Resend/Яндекс на sslip.io могут быть отклонены или потребовать перенастройки при смене домена | В4 |

## 8. Чего план НЕ покрывает

- Адаптер CloudPayments, автовыплаты, сплитование ЮKassa — только инструкции.
- Налоговый контур, подписочный биллинг, пробелы трекинга из [аудита](../../audits/template-gap-audit-2026-09-09.md).
- Перевод специализированных CJM A–D в real mode; фикстурные страницы `/` остаются синтетическими.
- Другие провайдеры входа (VK ID, Госуслуги) и 2FA.
- Юридическое заключение о 149-ФЗ / 152-ФЗ — только вопрос В5 владельцу.
- Живую доставку и живое согласие Яндекса без ключей В1–В3 — они остаются НЕ ВЫПОЛНЕНО с причиной.
- Изменения в N1/N2 (включая исправление той же дыры «время ответа» в N1 forgot/route.ts) — отдельная задача.
- Запуск тестов N1 для подтверждения чисел 31/31 и 51/51.

## 9. Процесс после утверждения

`/go f3-access-onboarding` → `/feature` продолжает прерванный RUN_ID
`20260909T135340Z-f3-access-8b71` или открывает новый со ссылкой на него (решение координатора,
фиксируется в телеметрии). Стадии PLAN/VALIDATE не повторяются, если В9 не меняет
спецификацию; при утверждении AC-15/16 — повторная валидация только изменённых критериев.
Коммиты по единицам: `fix(03)` для U1/U2, `test(03)` для U3/U4, `docs(03)` для U5/U6.
