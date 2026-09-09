# Yandex ID: вход и явная привязка к N3

Дата сверки: **2026-09-09**. Инструкция описывает OAuth authorization-code flow N3 для четырёх HTTPS origins. Без реальных `clientId`/`clientSecret` и согласия тестового пользователя нельзя утверждать, что внешняя приёмка выполнена.

## Модель доверия N3

Yandex ID подтверждает внешний identity `(provider, external_id)`, но не доказывает владение уже существующим N3 account с тем же email. Поэтому N3:

- использует authorization code + PKCE S256, случайный одноразовый `state` и host-only browser cookie;
- принимает callback только для сохранённого точного origin/Host и попытки не старше 10 минут;
- запрашивает `login:info` и `login:email`, требует внешний ID и email;
- никогда не сохраняет provider access token и не отдаёт его браузеру;
- повторный вход по уже привязанному external ID возвращает тот же account даже при изменившемся provider email;
- отказывает первому входу нового external ID, если его email уже занят **любым** N3 account, включая passwordless;
- создаёт новый SSO account с непроверенным локальным contact email;
- привязывает Yandex к существующему account только после отдельного свежего password proof и отдельного OAuth flow;
- не даёт удалить последний способ входа: SSO-only account должен подтвердить contact, задать password через recovery и лишь затем отвязать Yandex со свежим password proof.

## 1. Зарегистрируйте правильный тип приложения

1. Войдите в [Yandex OAuth](https://oauth.yandex.ru/) под устойчивым operator account с рабочим восстановлением.
2. Создайте приложение типа **для авторизации пользователей**, не «для доступа к API или отладки». API-only приложения не могут получать разрешения группы `login`.
3. Заполните понятные пользователю название, иконку и актуальную контактную почту владельца.
4. Добавьте платформу **Веб-сервисы**.
5. Запросите только два необходимых доступа:
   - `login:info` — логин, имя/фамилия и базовая информация;
   - `login:email` — адрес электронной почты.
6. Не добавляйте телефон, дату рождения, Диск, Директ или другие scopes: N3 их не читает.

Названия scopes можно проверить в информации приложения и в authorization URL. Страница согласия должна показывать только ожидаемые данные.

## 2. Внесите четыре Redirect URI

Добавьте **каждый адрес отдельной строкой**:

```text
https://n3-a.212.192.0.33.sslip.io/api/account/yandex/callback
https://n3-b.212.192.0.33.sslip.io/api/account/yandex/callback
https://n3-c.212.192.0.33.sslip.io/api/account/yandex/callback
https://n3-d.212.192.0.33.sslip.io/api/account/yandex/callback
```

Не используйте wildcard, HTTP, общий callback другого проекта, IP вместо hostname, лишний slash или callback только варианта A. Yandex сопоставляет scheme, host, port и path. N3 дополнительно сохраняет origin, сравнивает callback Host и возвращает пользователя только на allowlisted saved origin `/account`; Host не становится произвольным redirect destination.

Проверьте доступность всех четырёх HTTPS URL через существующий frontend proxy после deployment. Callback без валидного сохранённого flow должен безопасно отказать; 404 означает, что версия N3 ещё не готова к включению приложения.

## 3. Запишите канонический access-конфиг

Используется ignored `.runtime/access.json`, права `0600`, путь в API задаётся только `N3_ACCESS_CONFIG_FILE`. Безопасное отключённое состояние:

```json
{
  "mail": { "enabled": false },
  "yandex": { "enabled": false },
  "verificationRequired": false
}
```

Для включённого Yandex раздел имеет точную форму:

```json
{
  "mail": { "enabled": false },
  "yandex": {
    "enabled": true,
    "clientId": "<CLIENT_ID_ПРИЛОЖЕНИЯ>",
    "clientSecret": "<CLIENT_SECRET_ИЗ_SECRET_STORE>"
  },
  "verificationRequired": false
}
```

Placeholders не являются credentials. Если Resend тоже включён, сохраните его canonical `mail:{enabled,apiKey,from}` в том же JSON; не создавайте второй access-файл. Secret никогда не попадает в browser, URL, logs, screenshot или Git.

После атомарной замены файла и проверки режима доступа пересоздайте API. На `GET /api/account/access-status` ожидается `yandexConfigured:true` без client ID/secret. Этот статус означает только успешную локальную валидацию конфигурации.

## 4. Что делает browser flow

UI вызывает с текущего origin:

```text
POST /api/account/yandex/start
```

с intent `login` либо `link`. N3 создаёт random state, PKCE verifier/challenge S256, сохраняет exact origin/redirect URI и ставит `n3_oauth` cookie `HttpOnly; Secure; SameSite=Lax`, host-only, TTL 600 секунд. Browser переходит top-level на `https://oauth.yandex.ru/authorize`; code возвращается на один из четырёх callback.

Callback:

```text
GET /api/account/yandex/callback?code=...&state=...
```

N3 атомарно погашает допустимую попытку до provider IO, меняет code на token с исходным `code_verifier` и тем же exact `redirect_uri`, затем получает профиль через `https://login.yandex.ru/info`. Один общий bounded deadline покрывает token и profile responses. Denial, повтор callback, wrong cookie/state/Host, просрочка или malformed/no-email profile не создают login session.

Не переносите `code`, `state` или access token между A–D. Host-only cookie варианта A не является browser proof для B.

## 5. Проверка входа

Используйте отдельный контролируемый Yandex account, чей email ещё не существует в N3:

1. При `verificationRequired:false` откройте `/account` на A и выберите «Войти с Яндекс ID».
2. На consent page проверьте имя приложения и только нужные права. Откажите один раз: N3 не должен создать account/session, повтор использует новый flow.
3. Разрешите доступ. После callback ожидается новый passwordless N3 account, одна пустая организация/membership и `emailVerified:false`.
4. Выйдите и повторите вход: должен открыться тот же account, без второй организации.
5. Одновременно отправленные копии callback не должны создать второй account или session; повтор погашенного state отказывает.
6. Повторите позитивный вход на B, C и D с отдельными чистыми browser sessions или после logout. Для каждого origin provider redirect URI должен совпасть с соответствующей строкой из списка.
7. Изменение email на стороне Яндекса для уже связанного external ID не должно переносить identity в другой N3 account.

Отдельно создайте N3 password account с тем же email, который видит новый, ещё не связанный Yandex identity. OAuth login должен показать безопасный collision/refusal и **не** входить, не создавать второй account и не привязывать автоматически.

## 6. Явная привязка и отвязка

Для link:

1. Войдите в существующий N3 account с подтверждённым email и рабочим password.
2. В security UI запустите привязку, введя текущий password. Это свежий proof; старая cookie одна недостаточна.
3. Завершите отдельный Yandex consent flow. External identity должна быть свободна или уже принадлежать тому же account.
4. Проверьте `yandexLinked:true` в account state. Повторная привязка того же identity к тому же account идемпотентна.

N3 откажет при неверном password, отозванной/просроченной исходной сессии, изменившейся account version, identity другого account или email collision. Identity никогда не «переезжает» между accounts.

Для unlink:

1. Убедитесь, что у account есть действующий password.
2. Введите текущий password ещё раз.
3. После успешного unlink N3 увеличивает account version и отзывает все старые cookie/agent/referral credentials; войдите заново обычным password.

SSO-only account сначала подтверждает contact email одновременно mail-token и своей текущей сессией, затем через reset задаёт password. Анонимный recovery до contact verification запрещён. Если сессия SSO-only потеряна до подтверждения contact, один provider email не даёт право установить пароль; оператор не должен обходить это auto-link или ручной пометкой verified.

## 7. Verification policy

Yandex profile email остаётся **непроверенным контактом N3**, даже если провайдер использует его в своём аккаунте. Для локального `emailVerified:true` SSO-пользователь проходит отдельный Resend contact flow из текущей session.

При `verificationRequired:true` новый непроверенный SSO account получает только security/recovery surface. Business cookie, agent и referral/connector authority запрещены, пока contact не подтверждён. Mail outage не снижает эту policy. Включайте её только после фактической готовности Resend по [инструкции](resend.md).

## Test/live и доказательства

Yandex OAuth не следует описывать как отдельную банковскую sandbox. Для приёмки создайте реальное OAuth application, используйте контролируемые accounts и фиксируйте:

- app type/scopes и четыре сохранённых redirect URI;
- consent grant и denial;
- callback по A–D;
- wrong state/cookie/Host, expiry и replay;
- occupied-email refusal;
- explicit link/unlink с credential revocation;
- SSO contact confirmation и recovery constraints.

Локальный stub проверяет контракт N3, но не доказывает доступность Yandex OAuth. Consent одного operator account не доказывает готовность для всех пользователей или завершение модерации приложения.

## Диагностика

| Признак | Что проверить |
|---|---|
| `yandexConfigured:false` | mount/path, JSON, `enabled`, непустые clientId/clientSecret; API пересоздан |
| `redirect_uri_mismatch` | exact scheme/host/path и одна из четырёх строк; не перепутаны A–D |
| `unauthorized_client` | выбран тип приложения для авторизации, приложение не ожидает/не провалило модерацию и не заблокировано |
| Callback отказывает state/cookie | тот же browser и host, cookies разрешены, прошло меньше 10 минут, flow не использован |
| Профиль без email | scopes `login:email` + `login:info`, новое согласие; N3 обязан отказать, а не выдумать адрес |
| Email уже есть в N3 | ожидаемый refusal; войти старым способом и выполнить явный link со свежим password proof |
| SSO account не видит business UI | подтвердить contact через Resend; policy не отключать |
| Yandex вход есть, recovery недоступен | contact ещё не подтверждён N3 или потеряна обязательная текущая SSO session |

## Ротация и аварийное отключение

При штатной ротации создайте/перевыпустите secret доступным в Yandex dashboard способом, атомарно замените `yandex.clientSecret`, пересоздайте API и выполните новый login+profile flow. Не предполагайте overlap старого и нового secrets без явного подтверждения Yandex; при отсутствии overlap назначьте окно обслуживания.

При компрометации отключите/отзовите приложение или secret в Yandex, установите `yandex.enabled:false`, пересоздайте API и проверьте OAuth/session audit. Password login и mail recovery должны оставаться независимыми. Для SSO-only пользователей outage означает отсутствие нового provider login; это нельзя лечить email auto-link.

Откат backend допускается только на access-совместимую версию, которая понимает external identities, nullable password, account version и verification policy. Существующие bindings не удаляйте. При ошибке callback отключите новые starts и исправляйте вперёд, сохраняя revocations и collision rules.

## Официальные источники

- [Регистрация приложения для авторизации](https://yandex.ru/dev/id/doc/ru/register-auth)
- [Типы OAuth-приложений и ограничения login scopes](https://yandex.ru/dev/id/doc/ru/register-client)
- [Authorization code, state, PKCE и token exchange](https://yandex.ru/dev/id/doc/ru/codes/code-url)
- [Получение информации о пользователе и email](https://yandex.ru/dev/id/doc/ru/user-information)
- [Обзор OAuth для Yandex ID](https://yandex.ru/dev/id/doc/ru/)
