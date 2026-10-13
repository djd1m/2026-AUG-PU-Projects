# F03 — платежи ROOM20 и партнёрская атрибуция

## Решение для владельца

F03 реализует утверждённый пакет: 20 генераций за 900 ₽. Сервер задаёт цену и начисляет кредиты только после проверки платежа через API ЮKassa. Повторные уведомления не должны повторять начисление. Подтверждённый полный или частичный возврат устанавливает постоянный billing hold; приложение не выполняет денежный возврат и не пытается угадать, сколько кредитов следует отнять.

Работа разделена на два ограниченных пакета. F03a создаёт платежные намерения, адаптер провайдера, асинхронное создание checkout, проверку уведомлений и транзакции начисления/hold. F03b добавляет операторский реестр партнёров, отдельное согласие на tracking-cookie, ручной код без cookie и агрегаты первых конверсий. Интерфейс оплаты относится к F04.

Первый подтверждённый платеж навсегда фиксирует победивший intent, даже если партнёра нет. Последующие покупки дают положенный пакет, но не создают конверсию задним числом. Возврат первого платежа делает его конверсию недействительной, не назначая победителем вторую покупку.

Каждый пакет пишет отдельный Sol6.1 high в своей worktree. Затем свежий Astra проверяет результат; исправляются конкретные находки. Бюджет F03a — 25 минут на попытку, F03b — 20 минут. PostgreSQL, конкурентные тесты и проверочные мутации обязательны. Фактические модели и неизвестный расход сохраняются в telemetry.

Действует ранее данное разрешение владельца на автономную реализацию обоих проектов. Повторное согласование этапа не требуется. Внешний расход остаётся нулевым: реальные платежные запросы, списания, возвраты, отправка сообщений и deployment не выполняются. По умолчанию провайдер отключён; локальный fixture явно обозначается и запрещён в production. Ключи остаются только в серверном окружении.

## Точный контракт реализации и источники

Вход: F01/F02softwareприняты; /nextf03-payments → /gof03-payments → /featureAUTO. ROUTE2026-10-02: explicit4futurepathsмеханическийS/exit0; substantiveXLиз-заоплаты/вебхуков/начисленийсохранён. Полныйцикл,конкурентныеPGпроверкииguardmutationобязательны. VALIDATE: исходныеPAY01–05/ATTR01–03/PARTNER01–02изуже принятогоSPARCнеизменны; Architecture/Pseudocodeпрочитаныперекрёстно. Ownerfullautonomyвdecisions-owner.md покрываетэтотплан, новыйXLвопроснетребуется. Расход0, реальныхproviderвызовов/списаний/возвратов/публикации/деплоянезапускать.

## F03a: платежные транзакции

Sol6.1high≤25мин, свежийAstra≤12мин, затемконкретныеисправления. Owneddb/004-payments.sql,web/payments.js/provider.js/payment-fixture.js, минимальныеapp/config/server/jobsintegration,scripts/payment-worker.js/payment-fixture.js/migrate.js/maintenance.js/mutation.js,tests/payments*,docs/features/f03a/**,.env.exampleиcomposeпри необходимости. Безновыхnpmзависимостейеслиготовыйfetchдостаточен.

ROOM20строго90000minorRUB/20credits. Intentowner+key+requesthashimmutable; samebodyreuse, changed409. API202передproviderработой, durableintentобрабатываетсяboundedbackgroundrunner; stableprovideridempotencyключ иrequestнеизменны. Возвратнасайтничегоненачисляет. Defaultdisabled, отсутствующиеliveключи503безfixturefallback. ProviderHTTPendpointфиксированhttps://api.yookassa.ru/v3,timeout5с/response64KiB,noredirect,JSONбезсекретоввлогах. Серверныеcredentialsнепередаютсябраузеру.

Webhook16KiBпринимаеттолькотип/idкаксигнал; authenticatedGETпроверяетmerchant/id/order/account/90000RUB/paid/statusдоledger/event. Непроверенныйpayloadнеисточникденег. Поддержатьpayment.succeeded/payment.canceled/refund.succeeded, неизвестныеотвергать. Account→intentlock,uniqueprovider/payment/event/purchaseledger. Reviewмонotonic; canceledнепонижаетsucceeded;валидныйповторныйпакетможетдать20ещёодинраз, но first_paid markerнепереписывается. Heldaccountостаётсяheld;reviewintentнеполучаетновыйgrant.

RefundGET+boundpaymentGETстрогопроверяютIDs/status/positiveamount≤90000/RUB/merchant/metadata; verifiedpartial/fullrefundpermanenthold+review,winningconversioninvalid,noledgerguess/noactualmoneyrefund/noholdclear. Сериализоватьholdсqueueadmission/start/retry;queuedreleaseonce,preholdactivefinishprivateallowed. APIreturnsbillinghold/effectiveentitlementforF04,неизобретатьpublicexportдоF04.

Schemaдляpartner/attribution/first_conversion/eventможносоздатьвF03a, посколькуsettlementдолженсразусохранитьaccount-scopedfirstwinningpaymentдажебезpartner. ВF03aвнешнийpartner_idнеможетзадаватьсяпроизвольно: толькоявныйservervalidatedactivecodeилисуществующаяserverattribution. Полнаяcookieconsent/operatorregistry/aggregate—F03b. Winningeligibleintentсоздаётоднуconversion; no-partnerwinnerнавсегдаисключаетbackfill,refundнепродвигаетвторуюпокупку.

Fixtureproviderявнолокальный,неproduction, используетсвоиverifiedobjectsчерезтотжеверификатор/settlement;непревращатьwebhookpayloadвfakeGET. ТестыинъецируютлокальныйadapterилиHTTPmock,реальныхсетевыхплатежейнет. ДлялокальногооператораможносделатьfixtureCLI,необычныйproductiongrantendpoint. F04показываетdisabled/fixtureотдельно.

Источниклимитаidempotency: [YooKassa interactionformat](https://yookassa.ru/developers/using-api/interaction-format),проверен2026-10-02, гарантия24ч. Поэтомунеизвестныйcreateисходповторяетсятемжеключомтольковнутриконсервативногоокна<24чотпервогозапроса;послеокнаmanualreview/noautomaticnewPOST. Этоограничиваетповторсетевыхэффектов,невводитвозвратденег. [Webhookguide](https://yookassa.ru/developers/using-api/webhooks) и[refundlifecycle](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds)повторнопроверены;нетpayment.status=refundedи нетвымышленнойHMACподписи.

Reuse: N5apps/web/src/server/payments/yookassa.tsSHAeeaaef4bcd60f011b21fb20831c7f4f412cd9bbcd7ab8d6ca19914aa5cbaf4e5подтверждёнповторно;адаптироватьточныйamountparse/timeout/cappedbody/merchantvalidation. НепереноситьN5планы/комиссии/wholeoriginproxyзависимости. КанонN8authGET+immutablebindingимеетсвойконтракт,неblindcopy.

Checks: каждомуPAY01–05соответствуетnamedscenario; realPG10concurrentsuccess,refundbefore/afterrace/holdwithqueue,unrelatedpurchaseheld,reviewmonotonic,verifiedmismatchmatrix+timeout/malformed/oversize/noeventclaim,firstwinnernopartner/repeat/refundpermanent. Provider-binding mutationизgreenbaselineдолжнасломатьточныйassertion;fulloldregressionприизменённыхapp/jobs/schema. HeavyCPU2общийmutexпослеочереди;browserF04/not_applicableнаэтойстадии.

## F03b: partner preference and aggregate

ПослеF03aacceptedотдельныйSol≤20мин+freshAstra: operatorCLIimmutableowneruniqueopaque code,defaultunchecked30dtrackingconsentиотказ/expirycleanup,manualcodeбезcookie,preferenceдоintentсimmutableintentcopy,serveraggregatefirstconversionsбезself/refund/hold/repeats. Никакихcommission/reward/payoutwrites. UIcheckbox/checkoutвF04. ВсеproductрешенияMarkdownвdocs,телеметриядоdispatch,rawpromptsoutsidegit.
