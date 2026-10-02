# Test scenarios

Gherkin contract; execution evidence is recorded separately. Fixtures never prove real geometry quality.

@FR-GROWTH-001 @growth @happy-path
Scenario: Growth 001 happy-path
Given готовый результат владельца
When он нажимает Поделиться и подтверждает системный share
Then один share_completed за не более 2 действий

@FR-GROWTH-001 @growth @edge-case
Scenario: Growth 001 edge-case
Given открытый системный share
When пользователь отменяет
Then число share_completed равно 0

@FR-GROWTH-001 @growth @security
Scenario: Growth 001 security
Given результат другого аккаунта
When атакующий запрашивает композит по job_id
Then ответ 404 и число выданных байтов изображения равно 0

@FR-GROWTH-002 @growth @happy-path
Scenario: Growth 002 happy-path
Given валидный код партнёра до оплаты
When провайдер подтверждает первую покупку
Then ровно 1 paid_conversion связан с партнёром

@FR-GROWTH-002 @growth @edge-case
Scenario: Growth 002 edge-case
Given cookie заблокированы
When пользователь вводит персональный код в paywall
Then подтверждённая покупка сохраняет 1 атрибуцию

@FR-GROWTH-002 @growth @security
Scenario: Growth 002 security
Given код самого покупателя
When он пытается применить self-referral
Then атрибуция отклонена и начислений партнёру 0

@FR-GROWTH-003 @growth @happy-path
Scenario: Growth 003 happy-path
Given бесплатный результат
When владелец экспортирует композит
Then на 1 изображении есть видимый badge RoomKind

@FR-GROWTH-003 @growth @edge-case
Scenario: Growth 003 edge-case
Given подтверждённый платный пакет
When владелец повторно экспортирует прежний результат
Then badge RoomKind отсутствует и пометка AI сохранена

@FR-GROWTH-003 @growth @security
Scenario: Growth 003 security
Given бесплатный аккаунт
When запрос содержит removeBadge=true
Then экспорт сохраняет badge и entitlement не меняется

@FR-GROWTH-004 @growth @happy-path
Scenario: Growth 004 happy-path
Given два разных партнёра
When оператор создаёт коды
Then сохранены 2 уникальных кода и конверсии не смешиваются

@FR-GROWTH-004 @growth @edge-case
Scenario: Growth 004 edge-case
Given существующий код
When оператор повторяет создание того же кода
Then возвращается конфликт и сохранён 1 код

@FR-GROWTH-004 @growth @security
Scenario: Growth 004 security
Given оплата с одним provider_id
When 10 одинаковых событий приходят одновременно
Then в партнёрском агрегате ровно 1 конверсия

@FR-GROWTH-005 @growth @happy-path
Scenario: Growth 005 happy-path
Given real accepted результат и описание 40 символов
When владелец явно включает публикацию
Then 1 публичная страница содержит сравнение и стиль

@FR-GROWTH-005 @growth @edge-case
Scenario: Growth 005 edge-case
Given опубликованная работа
When владелец отзывает публикацию
Then прежний token и media URL возвращают 404

@FR-GROWTH-005 @growth @security
Scenario: Growth 005 security
Given fixture или unverified результат и HTML в описании
When пользователь пытается публиковать
Then публичных страниц 0 и скрипты не исполняются

@FR-payment-1 @security
Scenario: Return URL forgery
Given неоплаченный заказ
When пользователь открывает success URL
Then баланс не увеличивается

@FR-redesign-1 @security
Scenario: Late worker fence
Given lease попытки A истёк и взят B
When A сохраняет результат
Then обновлено 0 job rows и кредит не расходуется повторно

## Criterion scenarios

| Criterion | Scenario |
|---|---|
| FR-GROWTH-001 | Growth 001 happy-path; Growth 001 edge-case; Growth 001 security |
| FR-GROWTH-002 | Growth 002 happy-path; Growth 002 edge-case; Growth 002 security |
| FR-GROWTH-003 | Growth 003 happy-path; Growth 003 edge-case; Growth 003 security |
| FR-GROWTH-004 | Growth 004 happy-path; Growth 004 edge-case; Growth 004 security |
| FR-GROWTH-005 | Growth 005 happy-path; Growth 005 edge-case; Growth 005 security |
| FR-auth-1 | Session isolation |
| FR-upload-1 | Image boundary validation |
| FR-redesign-1 | Durable job concurrency |
| FR-geometry-1 | Real geometry corpus |
| FR-gallery-1 | Private comparison journey |
| FR-payment-1 | Verified payment replay |
| NFR-security-1 | Fail closed configuration |
| NFR-performance-1 | Bounded inference budget |

@FR-auth-1
Scenario: Session isolation
Given two accounts When B uses A resource id Then 404; invalid login and expired session grant no access

@FR-upload-1
Scenario: Image boundary validation
Given JPEG and malicious file When uploaded Then valid decoded image accepted without EXIF and invalid/oversize rejected

@FR-redesign-1
Scenario: Durable job concurrency
Given one credit When two different jobs race Then one reserve; same key returns same job; stale fence writes0

@FR-geometry-1
Scenario: Real geometry corpus
Given12 real rooms and3 styles When actual ControlNet runs Then0 added/missing openings and anchors within2%; fixture excluded

@FR-gallery-1
Scenario: Private comparison journey
Given owner result When gallery reopened at390px Then comparison is keyboard operable and B cannot fetch media

@FR-payment-1
Scenario: Verified payment replay
Given server90000RUB intent When10 verified duplicates race Then20 credits once; mismatch grants0

@NFR-security-1
Scenario: Fail closed configuration
Given missing session secret or production fixture When process starts Then nonzero and no serving socket

@NFR-performance-1
Scenario: Bounded inference budget
Given account20/day or platform200/day When next attempt requested Then refused; actualGPU p95 only n30+

