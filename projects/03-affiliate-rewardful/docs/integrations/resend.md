# Resend: почта активации, восстановления и подтверждения контакта

Дата сверки: **2026-09-09**. Resend в N3 доставляет транзакционные письма. Факт принятия письма API Resend не равен доставке в ящик, а доставка не равна подтверждению email в N3.

## Что меняется в сценариях N3

- Новая регистрация принимает только `email + name`. Пользователь выбирает пароль после перехода по одноразовой ссылке активации; пароль из исходной формы не существует.
- Запрос восстановления всегда отвечает одинаково для существующего, неизвестного и неподходящего адреса и не обещает доставку.
- Успешный reset сохраняет account/memberships, отмечает email проверенным, меняет пароль, увеличивает account version и отзывает старые cookie, agent и referral credentials.
- SSO-only пользователь сначала подтверждает контакт из своей текущей сессии. Только ранее подтверждённый контакт допускает анонимное восстановление.
- Email-токены одноразовые, purpose-bound и передаются в browser fragment. Открытие GET сканером письмо не погашает; изменение происходит только после явного POST пользователя.

## 1. Подготовьте sending domain

1. Создайте команду/аккаунт Resend, доступ к которому может восстановить владелец N3.
2. В **Domains → Add Domain** добавьте отдельный поддомен, например `access.example.ru`. Resend рекомендует subdomain для изоляции sending reputation.
3. В авторитетной DNS-зоне создайте **ровно те записи SPF, DKIM и MX**, которые показаны для этого domain/region в dashboard. Не копируйте значения из чужого проекта или этой инструкции: selectors, region и значения выдаются для вашего домена.
4. Если DNS-провайдер автоматически дописывает имя зоны, проверьте итоговый FQDN. Для MX может потребоваться завершающая точка; у Cloudflare provider-specific записи должны быть DNS-only, если dashboard так требует.
5. Дождитесь статуса Verified. Сверьте публичные значения командами `nslookup -type=TXT <dkim-name>`, `nslookup -type=TXT <spf-name>` и `nslookup -type=MX <mail-from-name>` либо эквивалентным DNS-инструментом.
6. Добавьте DMARC сначала в согласованном наблюдаемом режиме и настройте получателя отчётов. Политику ужесточайте после проверки SPF/DKIM alignment и всех законных отправителей домена.

DNS propagation может занимать до 72 часов. Статус «Pending» до фактического совпадения записей нельзя обходить включением N3.

После verification Resend разрешает отправлять с любого адреса на подтверждённом домене; отдельную sender identity создавать не требуется. Выберите адрес, способный получать ответы, например `Круг <access@access.example.ru>`.

## 2. Создайте минимальный API key

В **API Keys → Create API Key**:

1. Назовите ключ по deployment, например `n3-production-access`.
2. Выберите **Sending access**, а не Full access.
3. Ограничьте ключ подготовленным sending domain.
4. Скопируйте значение один раз в менеджер секретов. Не вставляйте его в браузер, CLI history, документацию, Git или Compose environment.

Resend keys не имеют автоматического срока жизни. Плановая ротация и удаление неактивных ключей — обязанность оператора.

## 3. Запишите канонический access-конфиг N3

N3 читает один ignored secret JSON `.runtime/access.json` с правами `0600`; путь задаётся `N3_ACCESS_CONFIG_FILE`. Безопасный начальный файл:

```json
{
  "mail": { "enabled": false },
  "yandex": { "enabled": false },
  "verificationRequired": false
}
```

После DNS verification и получения отдельного key mail-раздел имеет точную форму:

```json
{
  "mail": {
    "enabled": true,
    "apiKey": "<RESEND_KEY_ИЗ_SECRET_STORE>",
    "from": "Круг <access@access.example.ru>"
  },
  "yandex": { "enabled": false },
  "verificationRequired": false
}
```

Placeholder не является ключом. `from` должен использовать verified domain и формат допустимого sender address. Поля `mail`, `yandex` и `verificationRequired` принадлежат одной канонической схеме; не создавайте отдельный `RESEND_API_KEY` fallback.

После атомарной записи и проверки `0600` пересоздайте API штатным Compose. Не включайте обязательную verification в этом же изменении.

## 4. Проверьте конфигурацию без утечки

Откройте на одном из A–D:

```text
GET /api/account/access-status
```

Ожидаемое безопасное поле — `mailConfigured:true`; API не возвращает key или `from`. Это означает, что N3 принял конфигурацию, но ещё не подтверждает provider delivery.

Если mail disabled/невалиден, `mailConfigured:false`, а регистрация и mail-request должны показывать явную недоступность одинаково для любого синтаксически валидного адреса. Система не должна создавать токен, притворяться, что письмо ушло, или переключаться на donor/fake sender.

## 5. Изолированная проверка Resend

Resend публикует специальные адреса:

| Адрес | Ожидаемое событие |
|---|---|
| `delivered@resend.dev` | delivered |
| `bounced@resend.dev` | hard bounce |
| `complained@resend.dev` | spam complaint |
| `suppressed@resend.dev` | suppression |

У большинства адресов можно добавить label: `delivered+activation@resend.dev`. Они проверяют provider event и не предоставляют почтовый ящик, где можно открыть ссылку. Поэтому отдельно используйте контролируемый настоящий адрес на другом домене для полного N3-сценария.

Порядок:

1. При `verificationRequired:false` запросите регистрацию нового контролируемого адреса через форму N3 с `email + name`.
2. Ожидайте общий ответ `{accepted:true,...}` без обещания доставки и без раскрытия наличия account.
3. В Resend dashboard проверьте accepted/delivered статус и sender domain. Затем проверьте Inbox/Spam настоящего ящика.
4. Откройте ссылку. Убедитесь, что browser быстро удалил token fragment из адресной строки и GET сам ничего не изменил.
5. Явно задайте новый пароль (не менее действующего минимума N3). Ожидайте `completed:true, loginRequired:true`; автоматической cookie-сессии после mail token нет.
6. Войдите новым паролем. Повтор той же activation link должен отказаться без второго account/organization.
7. Запросите forgot для известного и случайного адреса: статус и текст должны совпасть. Для известного завершите reset и убедитесь, что все старые cookie/agent/referral credentials отказаны.
8. Для SSO-only account запросите contact-email из текущей сессии, подтвердите контакт и только потом проверяйте recovery. Один email без current session не даёт такого подтверждения.

Provider `id` в ответе send — лишь приём запроса Resend. Нужны dashboard delivery, фактический ящик и успешный одноразовый POST N3, чтобы подтвердить весь путь.

## 6. Включите обязательную verification отдельно

`verificationRequired` — security policy, а не флаг Resend. Делайте `false → true` только после того, как:

- DNS verified, SPF/DKIM проходят и `from` совпадает;
- activation, reset и contact письма реально пришли минимум на контролируемые адреса разных mailbox providers;
- bounce/suppression и provider outage дают понятный безопасный результат;
- у операторов есть рабочая recovery-сессия и ключ ротации;
- A–D отображают security-only UI для unverified account;
- существующим пользователям сообщён путь подтверждения.

После включения политика sticky: сохранённое `true` нельзя отменить файлом `false`, outage Resend или рестартом. Непроверенный account сохраняет доступ к me/logout/reset/contact security surface, но business cookie, agent и referral/connector authority остаются запрещены.

Если доставка сломалась после включения, восстановите mail provider; не обходите проверку и не помечайте email verified вручную.

## Диагностика

| Признак | Что проверить |
|---|---|
| `mailConfigured:false` | mount/path `N3_ACCESS_CONFIG_FILE`, `enabled`, непустые `apiKey`/`from`, JSON и права файла |
| 401/403 Resend | ключ удалён/неверен, Sending access/domain restriction, verified domain и адрес `from` |
| Разрешена отправка только себе | domain ещё не verified или используется тестовое ограничение аккаунта |
| Domain долго Pending | authoritative nameserver, полные DKIM/SPF/MX значения, FQDN auto-append, region mismatch, DNS propagation |
| API accepted, письма нет | dashboard status, bounce/complaint/suppression, Inbox/Spam; не объявлять delivery |
| Ссылка открылась, account не изменился | это ожидаемо до явного POST с password/token; проверить expiry/replacement/purpose, не логировать token |
| Forgot «успешен» для неизвестного адреса | ожидаемая защита от enumeration; такой ответ не обещает письмо |
| После reset старый agent ещё работает | security incident/дефект: остановить rollout и проверить account-version revocation во всех authority paths |

## Ротация и аварийное отключение

Плановая ротация Resend:

1. Создайте новый Sending access key с тем же domain scope.
2. Атомарно замените `mail.apiKey`, пересоздайте API.
3. Проверьте новый запрос и отфильтруйте свежие logs по новому key.
4. Убедитесь, что все replicas используют новый файл.
5. Удалите старый key в Resend. Оба могут работать во время перехода; не удаляйте старый до проверки нового.

При компрометации удалите старый key сразу, установите `mail.enabled:false`, пересоздайте API и проверьте Resend logs. Уже выпущенные email tokens остаются authority N3 и должны следовать expiry/revoke правилам; при подозрении на утечку погасите их через совместимую административную процедуру. Если verification policy уже включена, mail outage её не выключает.

Откат возможен только на access-совместимый backend, который понимает nullable password, email flows, account version и sticky policy. Не удаляйте новые таблицы/verification state и не возвращайте старую регистрацию с паролем до владения почтой.

## Официальные источники

- [Domains: SPF, DKIM и рекомендуемый subdomain](https://resend.com/docs/dashboard/domains/introduction)
- [Диагностика DNS verification](https://resend.com/docs/knowledge-base/what-if-my-domain-is-not-verifying)
- [API Keys и Sending access](https://resend.com/docs/dashboard/api-keys/introduction)
- [Безопасная ротация API keys](https://resend.com/docs/knowledge-base/how-to-handle-api-keys)
- [Send Email API и sender format](https://resend.com/docs/api-reference/emails/send-email)
- [Специальные test addresses](https://resend.com/docs/dashboard/emails/send-test-emails)
- [Suppressions](https://resend.com/docs/dashboard/emails/email-suppressions)
- [DMARC](https://resend.com/docs/dashboard/domains/dmarc)
