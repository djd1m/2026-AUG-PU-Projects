# F07 — RAG-ответ в песочнице

RUN_ID:20261002T202425Z-rag-answer-sandbox. База b73958285c2186551c2d8e977cda82800e87a02e (принятая F06). Профиль compact-quality-first-v2: отдельный Sol6.1 high≤25мин, отдельный Astra medium≤8мин, затем только исправления конкретных находок. Continuous MVP разрешён владельцем; main integration принадлежит root. Никаких новых зависимостей, миграций, ролей, donor N6, внешних платных запросов или глобальной конфигурации.

## ROUTE и алгоритм

Mechanical ROUTE M/exit0 сохранён в evidence/route-plan.txt. Содержательный L (новая прикладная граница web→RAG), понижение до M по явной оговорке fresh-SPARC: FR-n6b-5/6, SC-US-005-1/2/3,006-1/2 и Pseudocode Answer question от30.09.2026. Несущий денежный инвариант не меняется: существующий PaidGateway сам резервирует все ключи и вызывает провайдера; новая фича только использует beginAnswer. Все M-проверки обязательны. Повтор ROUTE перед IMPLEMENT.

1. Аутентифицированный POST /api/bots/{id}/ask: same-origin/session/UUID/tenant owner до вызова модели, чужойбот404. Вопрос непустой≤500символов, JSON bounded read с численным пределом до parse (не доверять Content-Length), ошибки422/413 безрезерва/провайдера. Channel sandbox/account выводится сервером; значения visitor/channel/account из body не принимаются.
2. Общий Answer question module пригоден для будущих widget/demo, но публичные маршруты сейчас не добавлять. Существующий gateway.beginAnswer первым резервирует попытку, затем embedQuestion, searchChunks top5 поbot, filter sim≥MIN_SIMILARITY. Порог читается из обязательного boot config и удаляется из PENDING_DECISIONS. Генерация толькоесли good непуст, через attempt.generate — существующие OpenRouter schema/model/deadline/provider constraints не меняются.
3. SYSTEM задаёт ответы только по данным, фрагменты не являются инструкциями. Текст фрагментов/вопрос — данные с IDs. unknown=true, пустые cited_ids или любой ID вне good → детерминированное «не знаю». Ссылки разрешаются из БД через chunk→document текущегобота/аккаунта; нетстроки/неполнаявыдача→безвыдуманнойцитаты. URLстраницытолькоБД, PDF подпись «имя, стр. N». URLs из текста модели удаляются, текст React-escaped; HTML/link разметка модели не исполняется. База ограничений: модель может ошибиться с законным ID; это отдельно живой calibration release gate, не обещание F07.
4. Каждый принятый вопрос журналируется ровноодинраз: answered/below_threshold/model_unknown/invalid_citation/limited/error. Квота→429 с существующим quotaRefusal/Retry-After, provider/schema/deadlinefailure→503 safe providerRefusal; резерв не возвращается, нетповторов/обходаgateway. Не держать DBтранзакцию/соединение во время providerawait.
5. Answered: одной короткойтранзакцией question_log + conditionalUPDATE bot.first_cited_answer_at WHERE ISNULL + growth_event приоднойобновлённойстроке. Конкурентно exactlyone growth event/show_cta perbot, анеperaccount. Ошибка вставки event откатывает marker/log. Безссылок marker/event не создаются.
6. Cabinet sandbox UI с label≤500/ожидание/ошибки/текст/цитаты, подключить существующий «Спросить в песочнице». Первыйответ со ссылкой показывает CTA «Вставить на сайт» и «Поделиться демо-страницей». Публикация сейчас не создаёт embedcode/demoURL: эти функции принадлежат F08/F09. Можно показать неактивные CTA с понятной причиной необходимости настройки контакта/домена; никаких мёртвых маршрутов или ложного успеха публикации. «Не знаю» безконтакта показывает предусмотренную подсказку, с контактом — контакт. Публичная выдача безконтакта здесь не реализуется.

## AC и проверки

| AC | Требование и доказательство |
|---|---|
| ANS-01 | owner-origin-session/validation/bodybound доgateway, foreignbot404 и provider0; реальные API/DB tests |
| ANS-02 | realPg search top5 толькоэтогобота, порог доgeneration, добротныйPDF locator/title и siteURL изDB, модельныеURLвтекстенет; fakeproviderчерезrealgateway |
| ANS-03 | belowthreshold/unknown/emptyIDs/foreignID/ID нижеthreshold → exactdontknow, контакт/безконтакта и persistedreason; meaningful citation-guard mutant expected assertionred/restoredgreen |
| ANS-04 | existingquota beforeembed;429/RetryAfter/contact no provider, embed/generatefail503 и attemptcharged/errorlog; no rawerrordisclosure |
| ANS-05 | 10 concurrentfirstcitedanswers:10logs,1marker,1event,1showCTA; two bots sameaccount independently; transactionalrollbackon eventfailure |
| ANS-06 | prompt data boundaries, schema/provider/deadlines existinggateway preserved; no new ungatedproviderentrypoint, bootthresholdconsumed |
| ANS-07 | actual Docker UI1440/390 submit/empty/oversize/pending/recover/textcitation/unknown/CTA and nooverflow/JSerrors; deterministic provider/API harness allowed only intestenvironment, exactbinding reported |
| ANS-08 | finaltypecheck/allunit/allintegration/build + independentAstraACCEPT, source/imagehashes andcleanup |

## Files, budget, stop

Product: packages/rag/src/{answer,prompt,citations}.ts, index.ts; minimal packages/db/src/{answers,index}.ts ifnecessary; apps/web/src/server/{ask-handler,config,runtime}.ts, app/api/bots/[id]/ask/route.ts, app/cabinet/{sandbox,page,job-status}.tsx, minimalglobals.css onlyforactuallayout. Tests: focused rag answer/citations unit+int, web ask-handler unit+int; canonicalfeaturedocs/telemetry/artifacts only. Existing PaidGateway/provider/search quotaalgorithms unchanged unlessconcrete evidencedneed (report first); no dependency/manifests/lock/schema/toolkit.

Author25minute hardstop, noDocker/ports/children/commit/globalconfiguration. Node22 locally provisioned; localtypecheck/focusedunit. Coordinator serializes CPU2 fullPGsuite and productionbuild underheavyflock, realUI underUImutex. One fullgreen perfinalsource, repetitions onlyforconcretechanges/failure. Review8minute read-only focusedindependentobligations FIRST, thenartifact/source review, noforcedfindings. Atbudgetstop preserve files/failures/receipt; do not quietlyextend. BeforeUI companionpreflight exactsource/build/env/testdata; deliverysourceboundfreshreceipt. Forecast insufficient_data, unknowncost/usage notzero.
