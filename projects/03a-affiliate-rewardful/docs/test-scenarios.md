# N3a — сценарии приёмки

Статус: план тестов, не выполненная приёмка. Каждый SC-ID является именованным критерием; отдельное семейство AC не вводится.

Spec revision: sha256:ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7

## Criterion scenarios

| Criterion | Scenario |
|---|---|
| SC-US-001-1 | SC-US-001-1 — happy |
| SC-US-001-2 | SC-US-001-2 — edge |
| SC-US-001-3 | SC-US-001-3 — security |
| SC-US-002-1 | SC-US-002-1 — happy |
| SC-US-002-2 | SC-US-002-2 — edge |
| SC-US-002-3 | SC-US-002-3 — security |
| SC-US-003-1 | SC-US-003-1 — happy |
| SC-US-003-2 | SC-US-003-2 — edge |
| SC-US-003-3 | SC-US-003-3 — security |
| SC-US-004-1 | SC-US-004-1 — happy |
| SC-US-004-2 | SC-US-004-2 — edge |
| SC-US-004-3 | SC-US-004-3 — security |
| SC-US-005-1 | SC-US-005-1 — happy |
| SC-US-005-2 | SC-US-005-2 — edge |
| SC-US-005-3 | SC-US-005-3 — security |
| SC-US-006-1 | SC-US-006-1 — happy |
| SC-US-006-2 | SC-US-006-2 — edge |
| SC-US-006-3 | SC-US-006-3 — security |
| SC-US-007-1 | SC-US-007-1 — happy |
| SC-US-007-2 | SC-US-007-2 — edge |
| SC-US-007-3 | SC-US-007-3 — security |
| SC-US-008-1 | SC-US-008-1 — happy |
| SC-US-008-2 | SC-US-008-2 — edge |
| SC-US-008-3 | SC-US-008-3 — security |
| SC-US-009-1 | SC-US-009-1 — happy |
| SC-US-009-2 | SC-US-009-2 — edge |
| SC-US-009-3 | SC-US-009-3 — security |
| SC-US-010-1 | SC-US-010-1 — happy |
| SC-US-010-2 | SC-US-010-2 — edge |
| SC-US-010-3 | SC-US-010-3 — security |
| SC-US-011-1 | SC-US-011-1 — happy |
| SC-US-011-2 | SC-US-011-2 — edge |
| SC-US-011-3 | SC-US-011-3 — security |
| SC-US-012-1 | SC-US-012-1 — happy |
| SC-US-012-2 | SC-US-012-2 — edge |
| SC-US-012-3 | SC-US-012-3 — security |
| SC-US-013-1 | SC-US-013-1 — happy |
| SC-US-013-2 | SC-US-013-2 — edge |
| SC-US-013-3 | SC-US-013-3 — security |
| SC-US-013-4 | SC-US-013-4 — security |
| SC-US-003-4 | SC-US-003-4 — historical eligibility |
| SC-US-005-4 | SC-US-005-4 — monthly permutation |
| SC-US-006-4 | SC-US-006-4 — immutable calendar |
| SC-US-007-4 | SC-US-007-4 — shared tax reservation |
| SC-US-007-5 | SC-US-007-5 — restore evidence |
| SC-US-006-5 | SC-US-006-5 — actual transfer year |
| SC-US-013-5 | SC-US-013-5 — consent membership |
| SC-US-013-6 | SC-US-013-6 — existing account and delegation |
| SC-US-006-6 | SC-US-006-6 — manual confirmation happy |
| SC-US-004-4 | SC-US-004-4 — forged intake |
| SC-US-009-4 | SC-US-009-4 — proposed platform leads |

## BDD сценарии

```gherkin
Scenario: SC-US-001-1 — happy
  Given owner заполнил ставку, recurring, attribution, RUB, timezone и версию условий
  When он активирует программу
  Then система сохраняет версию политики и разрешает приглашения.
```

```gherkin
Scenario: SC-US-001-2 — edge
  Given хотя бы одно обязательное поле пусто
  When owner пытается активировать программу
  Then активация отклонена с перечнем незаполненных решений.
```

```gherkin
Scenario: SC-US-001-3 — security
  Given пользователь не owner этой программы
  When он меняет политику
  Then запрос запрещён и записан в аудит без изменения версии.
```

```gherkin
Scenario: SC-US-002-1 — happy
  Given валидное приглашение и текущая версия условий
  When партнёр явно принимает условия
  Then фиксируются actor/time/version и выдаются уникальные link и promo.
```

```gherkin
Scenario: SC-US-002-2 — edge
  Given условия изменились до принятия
  When партнёр подтверждает старую версию
  Then активация не происходит и показывается новая версия.
```

```gherkin
Scenario: SC-US-002-3 — security
  Given партнёр вошёл в свой кабинет
  When он запрашивает asset/ledger другого партнёра
  Then доступ запрещён без раскрытия существования чужой записи.
```

```gherkin
Scenario: SC-US-003-1 — happy
  Given клиент пришёл по персональной ссылке, зарегистрировался в N1 и позже оплатил
  When N1 подтверждает уникальную применимую оплату
  Then attribution связывает payment с партнёром и создаёт одну комиссию.
```

```gherkin
Scenario: SC-US-003-2 — edge
  Given cookie и явный promo конфликтуют либо окно истекло
  When signup/оплата обрабатываются
  Then применяется версия conflict/window rule, а выбранный исход и причина видимы.
```

```gherkin
Scenario: SC-US-003-3 — security
  Given код невалиден, self-referral или payment не подтверждён
  When событие поступает
  Then комиссия не создаётся, а rejection безопасно аудируется.
```

```gherkin
Scenario: SC-US-004-1 — happy
  Given клиент вручную оплатил первое или следующее 30-дневное продление N1
  When N1 передал новый подтверждённый payment ID
  Then создаётся отдельная комиссия по применимой policy version.
```

```gherkin
Scenario: SC-US-004-2 — edge
  Given в событии нет надёжных subscription/period facts
  When строится dashboard
  Then комиссия видна, а MRR показан как `unknown`.
```

```gherkin
Scenario: SC-US-004-3 — security
  Given один payment доставлен повторно или конкурентно с разными transport event IDs
  When N3a обрабатывает доставки
  Then денежный эффект возникает ровно один раз.
```

```gherkin
Scenario: SC-US-005-1 — happy
  Given подтверждён частичный/полный refund исходной оплаты
  When N3a получает его
  Then создаётся одна связанная отрицательная корректировка на применимую сумму.
```

```gherkin
Scenario: SC-US-005-2 — edge
  Given refund пришёл после snapshot или `sent`
  When он подтверждён
  Then закрытая история неизменна, а correction попадает в следующий период/exception.
```

```gherkin
Scenario: SC-US-005-3 — security
  Given refund неизвестной оплаты, неверной суммы/валюты или повтор
  When событие обрабатывается
  Then повтор даёт прежний результат без второго эффекта, а mismatch блокируется для сверки.
```

```gherkin
Scenario: SC-US-006-1 — happy
  Given наступило 5 октября по настроенному timezone
  When owner готовит реестр
  Then snapshot включает применимые сентябрьские delta и не включает октябрьские.
```

```gherkin
Scenario: SC-US-006-2 — edge
  Given реестр уже создан или 5-е — выходной
  When owner повторяет подготовку
  Then новый долг не создаётся, а дата не переносится автоматически.
```

```gherkin
Scenario: SC-US-006-3 — security
  Given export выполнен либо пользователь без payout scope нажал `sent`
  When действие обработано
  Then export не меняет статус, а неавторизованная отметка запрещена и аудируется.
```

```gherkin
Scenario: SC-US-007-1 — happy
  Given договорная модель, статус, rule version и YTD плательщика подтверждены
  When рассчитывается строка физлица с обязанностью удержания
  Then marginal brackets применяются к частям базы и сохраняются gross/tax/net/evidence.
```

```gherkin
Scenario: SC-US-007-2 — edge
  Given НПД eligibility неизвестна, утрачена или выплата пересекает лимит
  When строка готовится
  Then она уходит в review без автоматического удержания 6% и без придуманного split.
```

```gherkin
Scenario: SC-US-007-3 — security
  Given rule version, YTD source, договор или accountant approval отсутствуют
  When оператор отмечает `sent`
  Then действие fail closed и причина остаётся в exception/audit.
```

```gherkin
Scenario: SC-US-008-1 — happy
  Given есть clicks, signup, payments, corrections и payout snapshot
  When owner/partner открывает разрешённый dashboard
  Then метрики согласованы с ledger и каждая сумма имеет provenance.
```

```gherkin
Scenario: SC-US-008-2 — edge
  Given сверка не завершена или данных MRR недостаточно
  When dashboard строится
  Then видны exception и `MRR unknown`, а не ноль/оценка.
```

```gherkin
Scenario: SC-US-008-3 — security
  Given URL/object ID принадлежит другой роли/программе
  When пользователь открывает его
  Then сервер запрещает доступ и не включает чужие данные в агрегат/export.
```

```gherkin
Scenario: SC-US-009-1 — happy
  Given owner увидел первую комиссию, подтверждённую реальной оплатой
  When он открывает её
  Then N3a готовит текст; owner явно копирует его/открывает native share, а N3a не отправляет сообщение.
```

```gherkin
Scenario: SC-US-009-2 — edge
  Given комиссия demo/test, повторная либо затем скорректирована refund
  When экран открыт
  Then новый first-value offer не возникает, а предыдущий факт не переписывается.
```

```gherkin
Scenario: SC-US-009-3 — security
  Given offer показан, но пользователь не подтвердил канал/получателя
  When сессия завершается
  Then сообщение не отправлено; offer/open не записаны как intentional share.
```

```gherkin
Scenario: SC-US-010-1 — happy
  Given public program page относится к free plan
  When посетитель открывает её
  Then виден badge N3a и отдельно считаются impression/click.
```

```gherkin
Scenario: SC-US-010-2 — edge
  Given цена paid plan ещё не определена
  When owner просит снять badge
  Then система не обещает покупку/цену и сохраняет badge до валидного entitlement.
```

```gherkin
Scenario: SC-US-010-3 — security
  Given клиент скрывает badge в UI/CSS без server entitlement
  When страница отдаётся повторно
  Then серверное правило free восстанавливает badge; N1 widgets не изменяются.
```

```gherkin
Scenario: SC-US-011-1 — happy
  Given активный партнёр получил уникальный код
  When клиент применяет его и совершает confirmed payment
  Then conversion учитывается в cohort кода и personal ledger.
```

```gherkin
Scenario: SC-US-011-2 — edge
  Given код истёк, отозван или конфликтует с link/cookie
  When он введён
  Then versioned lifecycle/conflict rule даёт один видимый исход без двойной комиссии.
```

```gherkin
Scenario: SC-US-011-3 — security
  Given приглашённый клиент не принят как партнёр либо угадывает чужой token
  When он просит новый partner code/данные cohort
  Then выдача и доступ запрещены.
```

```gherkin
Scenario: SC-US-012-1 — happy
  Given desktop viewport и выбран CJM A
  When пользователь проходит путь
  Then Rubik/slate/white/blue CTA и двухколоночный hero поддерживают последовательность A.
```

```gherkin
Scenario: SC-US-012-2 — edge
  Given viewport320/390/768/1440px
  When hero и финансовые состояния отображаются
  Then на320/390px контент становится одной колонкой; на всех ширинах document.scrollWidth≤viewport, действия достижимы клавиатурой, focus виден, поля имеют labels и статусы текстовые.
```

```gherkin
Scenario: SC-US-012-3 — security
  Given партнёр открывает финансовый экран
  When UI строит роли и действия
  Then owner controls отсутствуют, начисление не названо выплатой, demo ясно маркировано.
```

```gherkin
Scenario: SC-US-013-1 — happy
  Given действующий одноразовый grant с доверенной ролью и валидные данные регистрации
  When пользователь регистрируется и затем входит с верным паролем
  Then создана одна учётная запись с назначенной grant ролью и сессия; пароль и token хранятся только как hash.
```

```gherkin
Scenario: SC-US-013-2 — edge
  Given действовавшая сессия истекла, отозвана или пользователь вышел
  When он повторяет запрос защищённого кабинета или payout
  Then сервер отклоняет запрос без финансовой записи и предлагает вход.
```

```gherkin
Scenario: SC-US-013-3 — security
  Given клиент передаёт роль owner без соответствующего grant либо повторяет использованный grant
  When выполняется регистрация
  Then повышение роли и повторное создание доступа запрещены атомарно.
```

```gherkin
Scenario: SC-US-013-4 — security
  Given неуспешные попытки входа превышают настроенный лимит либо передан injection payload
  When обрабатывается следующая попытка
  Then rate limit действует до валидации, ответ не раскрывает наличие пользователя, SQL/HTML не исполняется и сессия не создаётся.
```

```gherkin
Scenario: SC-US-003-4 — historical eligibility
  Given клиент зарегистрировался с действующими кодом и статусом партнёра, затем код отозван/партнёр приостановлен
  When регистрация и оплата доставлены после задержки
  Then используется проверяемая история на registered_at; retry сохраняет решение; Attribution.status/first_paid_at согласованы с проводкой.
```

```gherkin
Scenario: SC-US-005-4 — monthly permutation
  Given payment100коп, комиссия1коп и два refund30коп от30сентября/1октября
  When обе перестановки доставлены2октября до freeze сентября
  Then месячные итоги одинаковы: сентябрь0коп, октябрь−1коп проводок отмены; freeze не зависит от доставки, оплаченная история не переписывается.
```

```gherkin
Scenario: SC-US-006-4 — immutable calendar
  Given программа активирована с Europe/Moscow и есть атрибуция
  When owner меняет timezone либо приходит payment30сентября22:30UTC
  Then смена запрещена; payment относится к октябрю; условия старой политики не меняются.
```

```gherkin
Scenario: SC-US-007-4 — shared tax reservation
  Given две программы одного payer/person/year с разными базами/НПД
  When две подготовки выполняются одновременно либо вторая после commit первой
  Then не более одного активного резерва по payer/person/year; другой получатель продолжает работу; проверяется подтверждённый совокупный НПД-лимит.
```

```gherkin
Scenario: SC-US-007-5 — restore evidence
  Given перевод состоялся после backup и RecoveryGate закрывает финансовые записи
  When оператор вносит evidence о переводе
  Then наблюдение сохранено даже без preparation; payment/refund posting и обычный confirm запрещены до сверки; повтор/конкурентная сверка и сбой до commit дают ровно оракулы fixtures R1–R4 из Refinement.md без частичного sent/YTD.
```

```gherkin
Scenario: SC-US-006-5 — actual transfer year
  Given декабрьская подготовка устарела, перевод состоялся в январе
  When оператор сообщает дату и evidence
  Then факт сохраняется как exception; сверка учитывает верный год без окна повторной выплаты и без молчаливого удаления резерва.
```

```gherkin
Scenario: SC-US-013-5 — consent membership
  Given приглашённый зарегистрировался, но ещё не принял условия
  When он читает кабинет, затем дважды конкурентно принимает собственное приглашение
  Then до согласия кабинет закрыт, собственный acceptance доступен session-only; после согласия одна partner membership с минимальными scopes и один набор assets.
```

```gherkin
Scenario: SC-US-013-6 — existing account and delegation
  Given существует User и owner владеет целевой программой
  When User принимает связанное приглашение, owner выдаёт оператору ограниченный scope
  Then membership создаются только доверенными переходами; чужие данные не раскрываются, клиентское role не повышает права.
```

```gherkin
Scenario: SC-US-006-6 — manual confirmation happy
  Given сентябрьская замороженная строка с due_date5октября, действующая tax preparation, payout scope, evidence перевода actual_date5октября
  When уполномоченный оператор дважды отмечает тот же перевод, затем проверяются отдельные примеры actual_date4/6октября
  Then для5октября одна append-only отметка и одно изменение YTD; для4/6октября обычный confirm запрещён, observation сохраняет факт, после сверки виден early/late без смены due_date; snapshot неизменен, sent — заявление оператора, N3a не переводит деньги.
```

```gherkin
Scenario: SC-US-004-4 — forged intake
  Given нет подписи, подпись неверна/просрочена либо merchant/environment не совпадают
  When поступает payment/refund event
  Then нулевой эффект ledger и отсутствие захваченного receipt; безопасный аудит без секретов, billing N1 не затронут; корректный повтор проходит заново.
```

```gherkin
Scenario: SC-US-009-4 — proposed platform leads
  Given тестовый контур предложения D7 (не принятая MVP-обязанность до решения владельца), участник принял явные условия
  When owner платформенной программы дважды подтверждает квалификацию лида с evidence, stable subject_id, timestamp и принадлежащим программе asset
  Then одна запись unique(program,subject,qualified_lead), retry возвращает её ID, конфликт asset отклонён; click/signup не квалифицируют лид автоматически; ledger платформы неизменен, оплата N1 даёт нулевой денежный эффект в platform контексте.
```
