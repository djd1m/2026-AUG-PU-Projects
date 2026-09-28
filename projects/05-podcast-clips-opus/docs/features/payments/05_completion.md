# Фича 30 `payments` — завершение

Оплата ЮKassa тарифа Pro: **990 ₽ за 30 дней**, разовая, потолок минут 270 (OWN-019, ADR-019). План `01_plan.md` (тир XL,
AC-1…AC-18) → чекпойнт владельца 28.09.2026 (ответы — OWN-019) → код Claude Opus 5.5 (`07_code_report.md`) → ревью Codex
`gpt-6-astra`/medium, три круга (`08_review.md`: B → B → B, blocker/high — ни одного; 4 + 2 + 1 medium исправлены).
Стенд `https://clipmkr.ru` **не тронут**: код не выложен, `N5_PAYMENTS_MODE` не задан (экран интереса, как раньше).

## Доказательства — дословно

| Проверка | Итог (дословно из вывода) | Файл |
|---|---|---|
| typecheck | код возврата 0 | `tests/artifacts/payments/typecheck.txt` |
| lint | `Статические правила: ошибок нет` | `tests/artifacts/payments/lint.txt` |
| Полный набор, Docker `-p n5-test-pay`, PostgreSQL 16 / Redis 7 / MinIO | `Test Files  113 passed (113)` · `Tests  1034 passed (1034)` | `tests/artifacts/payments/full-suite-final.txt` |
| Браузер, контейнер `mcr.microsoft.com/playwright:v1.60.0-noble` (Chromium + WebKit) | `Test Files  3 passed (3)` · `Tests  182 passed (182)` | `tests/artifacts/payments/browser-full-final.txt` |
| Мутации `tests/run-payments-mutations.mjs` | 22 × `killed` (`{"summary":[…]}` последней строкой) | `tests/artifacts/payments/mutations-final.txt` |
| `node ../../.claude/hooks/check-webhook-contract.cjs .` | `⚠️  проверка НЕ выполнена: повторная доставка НЕ ВОСПРОИЗВОДИЛАСЬ, причина: no-provider` · `code=2` | `tests/artifacts/payments/webhook-contract-check.txt` |
| `node ../../.claude/hooks/check-model-cost.cjs .` | `✅ 3 вызов(ов) названы…` · `code=0` | `tests/artifacts/payments/model-cost-check.txt` |
| `check-env-wiring.mjs` на compose стенда | `Потерь нет. Явные исключения: NEXT_RUNTIME, NEXT_PHASE` | `tests/artifacts/payments/env-wiring.txt` |
| `scripts/check-env-complete.sh .env.n5-demo` | `❌ не объявлены или пусты в …/.env.n5-demo: N5_LIMIT_PAID_USER_MINUTES` — ожидаемо, шаг выкладки | `tests/artifacts/payments/env-complete-stand.txt` |

Новые тесты: `billing.unit` 23 · `payments-guards` 11 · `billing.integration` 17 · `paid-plan.integration` 7 · браузерный
`billing` 48. Страж ADR-005 «маршрутов оплаты нет» удалён и заменён AC-16. Скриншоты экранов — `screens/`.

Код 2 контракта вебхуков **не** выдаётся за зелёный: у ЮKassa нет подписи, а повторную доставку настоящим магазином
воспроизвести нечем — магазина у N5 нет (OWN-019 п.4).

## Критерии приёмки

| AC | Чем доказано |
|---|---|
| AC-1 off: всё как раньше, маршруты оплаты 404 | `billing.unit` «AC-1…», `billing.integration` «AC-1…», браузерный «карточка: при выключенной оплате — прежняя кнопка», `limits.test.ts` (экран интереса режима off) |
| AC-2 намерение до провайдера, один платёж на ключ | `billing.integration` «AC-2…», «отказ у провайдера…» (ключ ЮKassa забыт через сутки) |
| AC-3 успех → paid, +30 сут, рендер без метки | `billing.integration` «AC-3…», `paid-plan.integration` «AC-3/AC-11 рендер» |
| AC-4 повтор, 20 одновременных → одно применение | `billing.integration` «AC-4…» |
| AC-5 подделка → 400 без записи; ключ не занят | `billing.integration` «AC-5…», `billing.unit` «AC-5/AC-6 вебхук» |
| AC-6 недоступность → 503, повтор полным путём | `billing.integration` «AC-6…», «исключение ВНУТРИ транзакции…» |
| AC-7 перестановка, возврат, блокировка платежа | `billing.integration` «AC-7 …» × 4 (две оплаты +60; возврат план не снимает; возврат раньше оплаты и 10+10; удержание блокировки) |
| AC-8 сумма ≠ цене → needs_review | `billing.integration` «AC-8…» |
| AC-9 оплата при erasing; гонка со стиранием | `billing.integration` «AC-9 …» × 2, `paid-plan.integration` «стирание аккаунта…» |
| AC-10 шесть состояний возврата, дедлайн по времени | `billing.unit` «экран возврата…», браузерный «шесть состояний различимы» |
| AC-11 истёкший оплаченный = free до сторожа | `paid-plan.integration` «AC-3/AC-11 рендер», «AC-11 чтения»; страж `payments-guards` (порядок/выражение); мутация `plan-ignores-expiry` |
| AC-12 сторож и ретенция от конца оплаты | `paid-plan.integration` «AC-12 …» × 2; мутация `retention-from-finish` |
| AC-13 оператор с журналом, снятие стирает остаток | `paid-plan.integration` «AC-13…», `billing.unit` (аргументы) |
| AC-14 конфигурация | `billing.unit` «режим оплаты…», `payments-guards` «конфигурация стенда» |
| AC-15 потолок минут paid (270 ≤ 600) | `paid-plan.integration` «AC-15…» (20 одновременных × 20 мин → ровно 13), `billing.unit` |
| AC-16 один вебхук, три пути смены плана | `payments-guards` «AC-16…»; мутация `fourth-plan-writer` |
| AC-17 мутации | 22/22 (`07_code_report.md`) |
| AC-18 полный набор + браузер | 1034/1034, 182/182 (выше) |
| Находка 1 ревью фич 25–29 | `billing.unit` «надпись призыва у клипа без метки» × 2; мутация `paid-cta-link-text` |

## Что НЕ доказано

- **Живой магазин ЮKassa не проверялся:** настоящая оплата, повторная доставка из кабинета, формат настоящих уведомлений.
  Всё проверено НАСТОЯЩИМ адаптером против подменного HTTP-сервера ЮKassa (форма объектов — по донору N6/N4).
- **Адрес источника за двумя прокси стенда** (`ai-hub-tls-proxy` → Caddy → web, `N5_TRUSTED_PROXY_HOPS=2`) для
  уведомлений ЮKassa не проверен: тест задаёт цепочку сам. Если общий прокси перепишет `X-Forwarded-For` иначе — все
  уведомления получат 400 (громко, деньги не теряются: ЮKassa повторяет, платёж виден в кабинете). Проверять по журналу web
  при первой тестовой оплате.
- **Браузерные тесты — статическая разметка** (`renderToStaticMarkup` + настоящий `globals.css`): клик «Оплатить», опрос
  экрана возврата в браузере и вход с возвратом на `/upgrade/return` не прогонялись в живом браузере (логика — unit).
- **Ветка перезапуска `stand-set-yookassa.sh`** проверена на подменном docker, не на стенде.
- **Исправление круга 3 ревью** (чтение окружения в скрипте стенда) повторно не ревьюировано — лимит кругов.
- **Отсутствие взаимоблокировок доказано для названных пар** (оплата/возврат ↔ стирание аккаунта, списание минут ↔
  удаление) — детерминированными тестами и чтением порядка блокировок; перебора всех пар путей нет.
- Уже отрендеренные клипы оплата не перерисовывает (FR-TARIFF-001) — это свойство, а не пробел; метка на старых клипах
  остаётся.
- Лендинг без раздела тарифов (FR-LOOK-014) — вне объёма, хвост владельцу (`02_validation.md` §3 п.5).

## Новые переменные окружения

| Переменная | Кому | Значение | Отсутствие |
|---|---|---|---|
| `N5_LIMIT_PAID_USER_MINUTES` | web, worker-stt, worker-llm (compose `${…:?}`) | **270** (≤ `N5_LIMIT_GLOBAL_MINUTES`) | compose не поднимает стенд; процесс — отказ старта |
| `N5_PAYMENTS_MODE` | web (compose `${N5_PAYMENTS_MODE-off}`) | `off` (не задан) · `fake` (не production) · `live` | не задан → `off`; пусто/неизвестно → отказ старта |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` / `YOOKASSA_TEST_MODE` | только web | shopId цифрами · ключ `test_…`/`live_…` · `true`/`false` | при `live` — отказ старта с именем переменной |

## Команды оператора

```bash
# из каталога проекта, на стенде
docker compose --project-directory . --env-file .env.n5-demo exec web \
  npm run ops:set-plan -- <почта> free|paid --by <кто> --reason "<зачем>"      # план + журнал operator_action
# платежи на разбор (возврат, сумма ≠ цене, чужой платёж, стирающийся аккаунт):
docker compose --project-directory . --env-file .env.n5-demo exec -T db psql -U n5 -d n5 -c \
  "SELECT provider_payment_id, amount_minor, status, review_reason, created_at FROM payment WHERE needs_review ORDER BY created_at DESC"
bash scripts/stand-set-yookassa.sh    # включить live: shopId, ключ (без эха), тестовый ли магазин; откат с подтверждением
```

## Порядок включения на стенде (владелец)

1. Добавить в `.env.n5-demo` строку `N5_LIMIT_PAID_USER_MINUTES=270` (без неё — `scripts/check-env-complete.sh` код 1 и
   compose откажет), выложить код (`docker compose --project-directory . --env-file .env.n5-demo up -d --build`). Оплата
   остаётся `off` — поведение как сейчас; миграция 021 только добавляющая.
2. Завести тестовый магазин ЮKassa N5 → `bash scripts/stand-set-yookassa.sh`.
3. В кабинете магазина: адрес уведомлений **`https://clipmkr.ru/api/webhooks/yookassa`**, события `payment.succeeded`,
   `refund.succeeded`.
4. Тестовая оплата картой ЮKassa → повторная доставка из кабинета → журнал web (адрес источника) → строка «Проверка
   повторной доставкой» в `docs/webhook-contract.md` переводится в проверенную.

## Модели и телеметрия

Профиль `compact-quality-first-v2`, один исполнитель (Claude Opus 5.5) + независимый ревьюер Codex `gpt-6-astra` (medium,
подтверждено строками `model:`/`reasoning effort:` журналов). Запись — `docs/telemetry/p-replicator/20260928T-payments/run.json`.
Токены и стоимость исполнителя и ревьюера — `null`: хост счётчиков не выдаёт.

## Выкладка на стенд (координатор, 28.09.2026, после слияния `d7b92a47`)

Стенд `https://clipmkr.ru`: в `.env.n5-demo` добавлена `N5_LIMIT_PAID_USER_MINUTES=270`; образы web / worker-stt / worker-llm /
worker-video пересобраны; миграция `021_payments.sql` применена новым образом ДО перезапуска (`run --rm --no-deps web
node packages/db/dist/migrate.js`); `up -d` четырёх сервисов; `/health` 200, лендинг 200 в Chromium и WebKit на 360 и 1280 без
горизонтальной прокрутки; `POST /api/checkout` → 404 и `/upgrade` → 404 (оплата `off`, как задумано, AC-1).

Попутно найден и исправлен дефект стенда, не связанный с фичей: `S3_PUBLIC_ENDPOINT` в env указывал на хост прежнего сервера
(`s3-n5.212.192.0.33.sslip.io`, TLS-ошибка) — миниатюра витринного клипа на лендинге не загружалась; переведён на
`s3-n5.194.85.249.105.sslip.io`, после перезапуска web у лендинга 0 неудачных запросов. Живая оплата на стенде не включалась
(магазина нет).

