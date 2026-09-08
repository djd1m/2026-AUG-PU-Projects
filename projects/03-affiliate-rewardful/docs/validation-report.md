**Verdict:** 🟡 CAVEATS
Spec revision: sha256:e8d084d85aaf800626f201b5c417990b981945c81c78819688eb827d9b2f22da
# N3 F1 validation

All five feature specifications independently reviewed. Base means: shared93.17, A92.25, B90, C89, D90.8; loweststory80, no blocking floors. Exact rubric/AC/scenario evidence: [independent receipt](telemetry/p-replicator/20260908T204432Z-go-shared-core/evidence/f1-requirements-validation.md).

F1 business semantics only. UNCONFIRMED/deferred: real YooKassa/split outgoing payout, CloudPayments integration, production SSO/identity, external MCP/A2A interoperability and actual model usage. These capabilities do not enter F1 implementation; fixture adapters are explicit. Badge remains on pilot, no invented paid entitlement; promo/link cohort projection required. All4 UI desktop/mobile, B foreign-origin embed, browser E2E before owner handoff.

Machine checks: all5 feature/project traceability pass, docscomplete pass, look5/growth6/handoff22 traced. External-dependency checker exit2 is legitimate no external F1 service, not a passed provider check. Canon/source/ownership declarations pass; canon checker displays19units by counting ownership rows too, actual dispatch is2 scoped writing units (one child and coordinator).

## Criterion scenarios
| Criterion | Scenario |
|---|---|
| AC-shared-core-11 | SC-US-001-1 — Given пользователь tenantX, When запрашивает resource tenantY через UI/MCP/A2A, Then отказ до чтения/изменения, отсутствие чужих полей в ответе. |
| AC-shared-core-12 | SC-US-001-2 — Given партнёрX, When запрашивает общий реестр или запись партнёраY, Then отказ; знание ID и выбор варианта не дают доступа. |
| AC-shared-core-13 | SC-US-001-3 — Given пользователь имеет две роли, When переключает рабочий контекст, Then сервер проверяет членство и роль заново; UI отображает действующего субъекта. |
| AC-shared-core-21 | SC-US-002-1 — Given подтверждённый платёж, When событие доставлено дважды/параллельно, Then одно эффективное начисление на business payment id и reward policy, а не на delivery attempt. |
| AC-shared-core-22 | SC-US-002-2 — Given тот же клиент оплатил следующий период, When пришёл новый подтверждённый payment id, Then отдельное начисление, если версия политики предусматривает recurring; converted referral не блокирует renewal. |
| AC-shared-core-23 | SC-US-002-3 — Given событие не проверено у провайдера или проверка недоступна, When поступило уведомление, Then оно не становится подтверждённым доходом, доступен повтор/сверка. |
| AC-shared-core-24 | SC-US-002-4 — Given одновременно ссылка и промокод, When атрибуция разрешается, Then применяется одна версия правила. Предложение пилота: явный промокод приоритетен, неверный явный код не даёт скрытого cookie fallback; это требует утверждения до F2. |
| AC-shared-core-31 | SC-US-003-1 — Given оплата/возврат/пересчёт, When изменяется экономический итог, Then сохраняются исходная запись и коррекция с причиной/ссылкой на событие; история не переписывается под текущую ставку. |
| AC-shared-core-32 | SC-US-003-2 — Given cash и subscription credit, When строится баланс, Then разные типы обязательств и доступности; credit нельзя выгрузить как денежную выплату или автоматически конвертировать в cash. |
| AC-shared-core-33 | SC-US-003-3 — Given возврат уже оплаченной комиссии, When он обработан, Then видна корректировка/задолженность и необходимость сверки; физический перевод не объявляется автоматически отменённым. |
| AC-shared-core-41 | SC-US-004-1 — Given выбранный период и допустимые к выплате начисления, When подготовлен реестр, Then видны период, получатели, сумма, валюта, версия, исключения; не включены уже отправленные позиции и credits. |
| AC-shared-core-42 | SC-US-004-2 — Given утверждена версияV1, When состав/сумма меняется, Then появляется новая версия и старое утверждение неприменимо; экспорт требует действующего утверждения этой версии. |
| AC-shared-core-43 | SC-US-004-3 — Given CSV выгружен, When его скачивание завершилось, Then статуса «отправлено» нет. Отдельная отметка владельца содержит дату/оператора/основание, не гарантирует зачисление. |
| AC-shared-core-44 | SC-US-004-4 — Given повторная подготовка периода, When одинаковый запрос повторён, Then не возникает второй набор подлежащих оплате обязательств; экспорт сам по себе не резервирует новую выплату. |
| AC-shared-core-45 | SC-US-004-5 — Given одно cash-обязательство доступно двум одновременно подготовленным реестрам, When утверждаются оба, Then оно атомарно закрепляется только за одним действующим settlement; второй получает конфликт и пересчёт. Разные idempotency keys не создают право платить его дважды. |
| AC-shared-core-46 | SC-US-004-6 — Given обязательство уже помечено отправленным, When другой оператор/агент повторяет отметку с другим ключом, Then второй факт отправки не увеличивает выплаченную сумму; исправление ошибочной отметки — отдельная аудируемая процедура. |
| AC-shared-core-47 | SC-US-004-7 — Given утверждённый, но не отправленный реестр с allocations, When новый подтверждённый refund меняет source snapshot, Then в одной транзакции старое утверждение/экспорт становятся недействительными, только неотправленные allocations освобождаются либо переносятся в новую явно неутверждённую версию. Отправленные строки не освобождаются. |
| AC-shared-core-48 | SC-US-004-8 — Given оператор фактически перевёл деньги по ранее скачанному устаревшему CSV, When фиксирует это после refund, Then факт не скрывается и не отбрасывается как будто перевода не было: создаётся reconciliation exception с исходной версией/суммой и отдельной коррекцией; запись не означает разрешение нового перевода. |
| AC-shared-core-51 | SC-US-005-1 — Given действующий grant чтения/черновика, When агент выполняет разрешённую задачу, Then нет лишнего подтверждения каждого чтения; approve/pay/send из этого grant не следуют. |
| AC-shared-core-52 | SC-US-005-2 — Given grant отозван/истёк, When начинается следующий защищённый шаг либо отдаётся новый защищённый результат, Then он отвергается; сохранённый результат доступен владельцу по его собственным правам. |
| AC-shared-core-53 | SC-US-005-3 — Given агентный артефакт id/version/hash, When владелец продолжает в UI, Then использует тот же артефакт, суммы и правила; переключение канала не создаёт новый расчёт. |
| AC-shared-core-54 | SC-US-005-4 — Given задача отменена, When приходит поздний ответ, Then он не продвигает отменённую задачу и не записывается как результат новой задачи; cancel не объявляется отменой внешнего перевода. |
| AC-shared-core-61 | SC-US-006-1 — Given один тестовый dataset, When запускаются варианты, Then каждому сеансу выделен изолированный sandbox/tenant; не объединяются fake balances разных испытаний. |
| AC-shared-core-62 | SC-US-006-2 — Given переход UI↔agent внутри одной задачи, When передан artifact reference, Then сохраняются tenant/subject и версия; изоляция экспериментальных сеансов не разрывает этот переход. |
| AC-shared-core-63 | SC-US-006-3 — Given реальный пилот, When один платёж виден в нескольких интерфейсах, Then он обрабатывается общим backend ровно один раз, а варианты читают один ledger. |
| AC-a-merchant-1011 | SC-US-101-1 — Given есть права владельца и fixture project; When сохраняет валидные ставку/окно/тип вознаграждения; Then создана версия политики, видимая в preview; будущие начисления ссылаются на неё. |
| AC-a-merchant-1012 | SC-US-101-2 — Given ставка отсутствует или значение вне разрешённого диапазона; When пытается опубликовать; Then публикация запрещена с исправляемой ошибкой; скрытого default нет. |
| AC-a-merchant-1021 | SC-US-102-1 — Given есть confirmed fixture payment и атрибуция; When запускает пример начисления; Then видит событие/правило/сумму/hold; общий SC-US-002 применяется. |
| AC-a-merchant-1022 | SC-US-102-2 — Given после оплаты зарегистрирован возврат; When повторно получает старое событие оплаты; Then коррекция остаётся; комиссия не восстанавливается из-за delivery replay. |
| AC-a-merchant-1031 | SC-US-103-1 — Given есть eligible cash entries за месяц; When готовит/проверяет/утверждает реестр; Then выгружает именно эту версию и видит исключённые строки. |
| AC-a-merchant-1032 | SC-US-103-2 — Given уже выгрузил CSV; When ещё не делал перевод; Then интерфейс не показывает отправку; отдельная отметка хранит оператора и дату. |
| AC-a-merchant-1041 | SC-US-104-1 — Given создана программа; When копирует приглашение; Then получает enrollment link, а не customer referral link; отображается действующая ставка. |
| AC-a-merchant-1042 | SC-US-104-2 — Given агент подготовил исправленную версию реестра; When открывает её в A; Then тот же id/version/hash/суммы доступны по правам владельца; не подставляется старый demo dataset. |
| AC-b-customer-2011 | SC-US-201-1 — Given клиент опубликовал виджет, событие value moment известно; When открывает предложение; Then видит условия и возможность отказаться, не теряя функции основного продукта. |
| AC-b-customer-2012 | SC-US-201-2 — Given согласие не получено; When открывает страницу или его агент читает условия; Then не создаётся enrollment; чтение не считается согласием. |
| AC-b-customer-2021 | SC-US-202-1 — Given друг подтвердил оплату и policy разрешает credit; When обрабатывается событие; Then credit отражён на проверке с источником и условием доступности. |
| AC-b-customer-2022 | SC-US-202-2 — Given есть только регистрация/клик либо self-referral; When система рассматривает награду; Then доступный бонус не появляется; причина отказа/ожидания объяснима. |
| AC-b-customer-2031 | SC-US-203-1 — Given есть доступный credit300 и fixture invoice1500; When применяет300 к счету; Then счёт1200, credit зарезервирован/применён однократно; отдельный статус при незавершённом счёте. |
| AC-b-customer-2032 | SC-US-203-2 — Given два запроса одновременно пытаются применить один credit; When выполняется общий use case; Then не тратится больше доступного остатка; проигравший получает актуальный баланс. |
| AC-b-customer-2033 | SC-US-203-3 — Given credit зарезервирован, а результат биллинга неизвестен после timeout; When повторяется применение; Then сохраняется исходная операция для сверки, нет второго расходования/фиктивного release. После подтверждённого отказа резерв освобождается ровно один раз; после успеха становится применённым. |
| AC-b-customer-2041 | SC-US-204-1 — Given участие добровольно оформлено; When запрашивает share kit в UI/MCP; Then получает ту же персональную ссылку и disclosure; отправка не производится автоматически. |
| AC-b-customer-2042 | SC-US-204-2 — Given личный агент имеет только read-balance grant; When пытается вступить/применить credit; Then отказ до изменения; тариф владельца не доступен клиенту как его собственная покупка. |
| AC-c-partner-3011 | SC-US-301-1 — Given есть опубликованная версия программы; When открывает public terms; Then видит тип/ставку/окно/удержание/порядок выплат, дату версии и статус участия. |
| AC-c-partner-3012 | SC-US-301-2 — Given условия изменились; When просматривает старое начисление; Then видит применённую историческую версию, не только текущую ставку. |
| AC-c-partner-3021 | SC-US-302-1 — Given подтвердил участие в программе; When enrollment принят по fixture policy; Then получает personal referral link/share kit, отличный от enrollment URL. |
| AC-c-partner-3022 | SC-US-302-2 — Given тот же запрос повторён; When вступает второй раз; Then не создаются второй партнёр/дублирующая атрибуция; возвращается существующее участие. |
| AC-c-partner-3031 | SC-US-303-1 — Given есть собственный начисленный доход; When открывает history/payout; Then видит только свои записи и причины hold/коррекции, ориентир до5-го следующего месяца. |
| AC-c-partner-3032 | SC-US-303-2 — Given владелец пометил перевод отправленным; When обновляет статус; Then видит отправку с датой; зачисление не утверждается без отдельного подтверждения. |
| AC-c-partner-3041 | SC-US-304-1 — Given личный grant разрешает own payout read; When UI или MCP/A2A запрашивает статус; Then возвращается один и тот же actor-scoped результат с источником/временем. |
| AC-c-partner-3042 | SC-US-304-2 — Given в запросе указан другой partner id; When агент вызывает tool/task; Then доступ отвергается даже при известном ID; общий реестр не раскрывается. |
| AC-d-agent-4011 | SC-US-401-1 — Given идентифицирован пользователь/tenant и цель; When подтверждает read+draft grant; Then показаны срок, субъект и scope; платёж/approve/send не входят в grant. |
| AC-d-agent-4012 | SC-US-401-2 — Given grant истёк/отозван; When агент начинает новый защищённый шаг; Then операция запрещена; UI владельца остаётся доступен по независимым правам. |
| AC-d-agent-4021 | SC-US-402-1 — Given есть один logical task и fixture payments; When повторяет запрос подготовки; Then получает тот же logical artifact или явно новую версию, без второго payable registry. |
| AC-d-agent-4022 | SC-US-402-2 — Given появился refund; When запускает пересчёт; Then меняются и строки/сумма, и объяснение; прошлое утверждение недействительно. |
| AC-d-agent-4031 | SC-US-403-1 — Given видит artifact id/version/hash; When утверждает и выгружает; Then получает только утверждённое содержимое; экспорт не запускает перевод. |
| AC-d-agent-4032 | SC-US-403-2 — Given доступ агента отозван после пересчёта; When владелец открывает ручное продолжение; Then получает тот же исправленный реестр; новое owner approval разрешено без оживления grant агента. |
| AC-d-agent-4041 | SC-US-404-1 — Given есть own-status grant и taskT1; When создаёт запрос, затем повторяет его; Then видит тот же task и статус, без повторного начисления/отправки. |
| AC-d-agent-4042 | SC-US-404-2 — Given T1 отменён, затем создан T2; When приходит поздний ответ с taskT1; Then ответ не завершает T2; отмена не объявляется rollback внешних действий. |
| AC-d-agent-4051 | SC-US-405-1 — Given клиент имеет own-credit-read grant и fixture credit balance; When запрашивает доступную сумму и условие применения; Then ответ совпадает с B по балансу/резерву/доступности и не показывает cash-комиссии других ролей. |
| AC-d-agent-4052 | SC-US-405-2 — Given read-only grant; When агент пытается зарезервировать или применить бонус; Then изменения запрещены до отдельного разрешённого действия; чтение не тратит баланс. |
