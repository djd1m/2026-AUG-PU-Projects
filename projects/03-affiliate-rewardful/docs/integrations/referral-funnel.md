# Подключение реферальной воронки N3

Эта интеграция связывает реферальный переход с подтверждённой регистрацией в вашем SaaS и с оплатой, которую создаёт ваш backend. Коннекторный ключ существует только на сервере мерчанта. Браузер получает лишь непривилегированный случайный receipt; N3 повторно проверяет его срок и принадлежность tenant.

## 1. Настройте программу в N3

В рабочем кабинете владельца сначала опубликуйте денежные условия программы, затем укажите два HTTPS-адреса одного публичного origin:

- `landingUrl` — страница регистрации вашего SaaS;
- `returnUrl` — страница, куда платёжный провайдер вернёт пользователя.

Выдайте ключ интеграции и сразу сохраните его в секретах backend. N3 показывает ключ один раз, хранит только хэш и ограничивает срок 90 днями. Повторная выдача заменяет прежний ключ, отзыв прекращает его действие. Не помещайте ключ в HTML, JavaScript, URL, журнал, аналитику или клиентское хранилище.

В кабинете появится готовый тег трекера вида:

```html
<script src="https://N3_ORIGIN/api/referrals/TENANT_ID/tracker.js" defer></script>
```

Добавьте его на `landingUrl`. Скрипт работает только на настроенном merchant origin, принимает `n3_ref_expires` только как канонический ISO timestamp от N3, удаляет оба referral-параметра из адреса и не отправляет сетевых запросов. Он сохраняет host-only cookie со значением `token.expiryMilliseconds`, `SameSite=Lax; Path=/` (`Secure` на HTTPS). Первый непросроченный receipt остаётся неизменным: повторный переход и изменение текущего окна программы не продлевают его. Серверная запись N3 всё равно является источником истины.

## 2. Подключите backend

Установки пакета не требуется: импортируйте серверный модуль из поставки N3. Для production `baseUrl` обязан быть HTTPS origin. HTTP разрешён библиотекой только для изолированного теста на literal loopback IP. Следующие блоки составляют один исполняемый серверный модуль; `merchantDb` — ваш существующий репозиторий, который уже применяет аутентификацию и проверяет владение записью.

```js
import {
  createReferralMerchantClient,
  referralTokenFromCookie,
} from './shared/integrations/merchant-client.mjs';
import { merchantDb } from './merchant-db.mjs';

const referrals = createReferralMerchantClient({
  baseUrl: process.env.N3_BASE_URL,
  secret: process.env.N3_REFERRAL_KEY,
});
```

Клиент вызывает только фиксированные маршруты `/api/integration/customers`, `/api/integration/checkout` и `/api/integration/order`, запрещает redirect, ограничивает ожидание восемью секундами и ответ одним MiB. Не принимайте `baseUrl` из HTTP-запроса пользователя.

## 3. Зафиксируйте подтверждённую регистрацию

Создайте стабильный `customerId` в своей БД. Сначала завершите проверку почты своим доверенным backend-процессом. Затем прочитайте referral cookie из серверного заголовка запроса и вызовите N3:

```js
async function afterVerifiedSignup({ request, customer }) {
  if (customer.emailVerified !== true) throw new Error('Email verification is required');

  const visitToken = referralTokenFromCookie(
    request.headers.get('cookie') ?? '',
    process.env.N3_TENANT_ID,
  );

  return referrals.bindCustomer({
    customerId: customer.id,       // стабильный ID из вашей БД
    email: customer.verifiedEmail, // результат вашей проверки почты
    emailVerified: true,
    ...(visitToken ? { visitToken } : {}),
  });
}
```

Cookie — лишь неподтверждённое evidence. Helper возвращает только token и отбрасывает очевидно просроченное или неоднозначное значение; срок, tenant, участника, программу и self-referral проверяет N3. Не передавайте из браузера `beneficiaryId`, tenant, ставку, policy, timestamp или флаг подтверждения почты.

Если пользователь ввёл промокод, передайте его как `promoCode`. Явный действующий промокод имеет приоритет над cookie. Явный недействительный промокод завершает запрос ошибкой и не включает скрытый cookie fallback. Отсутствующий или истёкший receipt создаёт органическую привязку без получателя; `attribution.reason: "attribution_expired"` объясняет истёкший случай. Успешную привязку нельзя переназначить следующим вызовом.

## 4. Создайте оплату из доверенного счёта

Сумму и `customerId` загрузите из своей БД после аутентификации пользователя. Никогда не пересылайте `amountMinor`, `customerId` или идентификатор счёта вслепую из browser body. Один ваш invoice должен иметь стабильный idempotency key.

```js
async function beginInvoicePayment({ authenticatedAccountId, invoiceId }) {
  const invoice = await merchantDb.invoiceOwnedBy(authenticatedAccountId, invoiceId);
  if (!invoice || invoice.state !== 'payable') throw new Error('Invoice is not payable');

  const order = await referrals.createCheckout({
    customerId: invoice.customerId,
    amountMinor: invoice.amountMinor, // integer minor units из вашего каталога/счёта
    idempotencyKey: `invoice:${invoice.id}`,
  });
  await merchantDb.saveN3Order(invoice.id, order.orderId);
  return order.confirmationUrl;
}
```

Повтор с тем же ключом и теми же данными возвращает тот же заказ; изменённая сумма или customer конфликтует. `confirmationUrl` и возврат пользователя на `returnUrl` не подтверждают оплату.

## 5. Проверяйте исполнение заказа

Показывайте оплаченный доступ только после серверного чтения сохранённого заказа. N3 считает подтверждением лишь persisted authenticated provider event.

```js
async function refreshFulfillment(invoice) {
  const order = await referrals.getOrder({ orderId: invoice.n3OrderId });
  const fullyFunded = order.verified === true
    && order.status === 'succeeded'
    && order.netAmountMinor > 0;
  await merchantDb.setFulfillment(invoice.id, fullyFunded ? 'paid' : 'pending_or_refunded');
  return { state: fullyFunded ? 'paid' : 'pending', testMode: order.testMode };
}
```

Всегда учитывайте `refundedAmountMinor` и `netAmountMinor`: полностью возвращённый заказ остаётся исторически `succeeded`, но имеет `netAmountMinor: 0` и больше не даёт оплаченный доступ. Ваш обработчик может безопасно повторять status read. Ответ `503 PROVIDER_NOT_CONFIGURED` означает, что магазин N3 не подключён; покажите недоступность и повторите позже, не создавайте локальный «успех».

## Проверка перед пилотом

В изолированной среде проверьте: первый и повторный переход, регистрацию на границах окна, неверный промокод, органическую регистрацию без cookie, повтор signup, один и тот же invoice, конфликт изменённой суммы, ожидание provider event, частичный и полный refund. Отдельно убедитесь, что смена пользователя или организации в кабинете очищает показанный ключ и что поздний ответ не возвращает его на экран.

Текущий rollout поддерживает один настроенный магазин на tenant. Он не импортирует существующий billing, не обнаруживает подписки и не вычисляет MRR; `mrr` остаётся недоступным. Повторные оплаты нужно создавать отдельными авторитетными invoice-вызовами. Provider stub доказывает только изолированный тестовый путь и не считается живой оплатой или production-приёмкой. Автоматических выплат партнёрам эта интеграция не выполняет.
