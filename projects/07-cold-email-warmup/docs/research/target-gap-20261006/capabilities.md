# N7 сейчас против целевого обещания

2026-10-06, read-only source audit. Запрос: «Аналоги Instantly.ai/Smartlead; неограниченные ящики, авто-прогрев, AI-ответ быстрее пяти минут».

**Сейчас N7 не выполняет это обещание как live-продукт.** Есть проверенная локальная основа кабинета, почтового пула, цепочек и безопасной остановки; неограниченные ящики и AI-ответы отсутствуют. Реальные SMTP/IMAP отсутствуют в реализации. Это оценка именно N7, без сравнения с текущими тарифами/функциями сторонних сервисов.

Baseline кода: `243f04250d428e28e6869a1aef95bc5dbdab2f91`. Прочитанный HEAD документов: `aa92db5eb7791ba7df2605d367b898dc0f748029`. `git diff --name-only` между ними для `src/`, `package.json`, `docker-compose.yml` пуст; source-выводы применимы к текущему HEAD. Корень: `.claude/worktrees/n7-replicate/projects/07-cold-email-warmup`.

Шкала: **0** — требование не реализовано; **1** — подтверждено лишь local/test; **2** — подтверждён live pilot; **3** — подтверждено production. Это категории доказательств, не проценты готовности; общий средний балл не вычисляется.

| Цель владельца | Уровень | Что имеется / чего нет |
|---|---:|---|
| Аналог Instantly/Smartlead по указанному рабочему сценарию | **1** | Локальные mailbox settings, opt-in pool, персонализированные цепочки, quota/stop-on-reply, кабинет, TEST billing. Реальные кампании, live warmup, AI и production не подтверждены. [Completion:8–26][completion]. |
| **Неограниченные ящики** | **0** | Жёстко free3/team10 ящиков **на tenant**, не unlimited; подключение нового сверх лимита →409. [plans:3–13][plans], [mailbox save:30–36][mailbox]. |
| **Автоматический прогрев реальных ящиков** | **1** | Есть алгоритм local pool/tick и шаблонного обмена, но отправитель local sink и IMAP fixture. Доказанного live pilot/репутационного эффекта нет. [pool:12–29][pool], [adapter:3–5][adapter], [config:44–47][config]. |
| **AI-ответ быстрее5мин** | **0** | Нет AI generation/draft/send pipeline, модели/лимитов/таймаутов AI и end-to-end SLA. Incoming reply detector делает stop, не пишет ответ. Это исходно исключённая из MVP функция. [PRD:22–24][prd], [reply store:77–90][reply]. |

## Ящики и фактические ограничения

`src/billing/plans.ts:3` задаёт free `{mailboxes:3,activeCampaigns:3}` и team `{mailboxes:10,activeCampaigns:10}`. `checkCapacity` считает **все** mailbox rows tenant, без исключения paused/quarantined, и бросает `plan_limit_reached` при достижении cap. Check вызывается при создании в `src/mailboxes/store.ts:36`. Team действует только при активном entitlement, связанном с succeeded записью **local_provider_payment**; TEST price100 minor RUB, duration30days. Обычный live платный тариф здесь не доказан. [Точные значения][plans].

Число ящиков отличается от пропускной способности: dailyLimit1…30, default10 (`src/mailboxes/input.ts:13–20`); provider allowlist cap1…30 (`src/config.ts:33–42`). Эффективная общая квота warmup+campaign — `min(user,provider,30)` **на mailbox за UTC день**, учитывает claimed/submitting/submitted/unknown, а не только успешные отправки. Увеличение тарифа не снимает эту квоту. Allowlist≤100 hosts — число разрешённых provider hosts, не разрешение100 ящиков. [Input][input], [quota:7–25][claim].

Дополнительные пределы, препятствующие представлению о массовом unrestricted сервисе: ≤100 получателей в campaign,1…5 шагов, заданный delay каждого шага24…8760ч. Персонализация — подстановка firstName/lastName/company, **не AI**. [campaign input:4–45][campaign].

## Что именно автоматизировано в прогреве

`PoolStore.tick()` отбирает consented/fresh eligible ящики разных tenants; при отсутствии пары возвращает waiting/0 jobs. За bounded tick создаётся одна детерминированная pair/day initial job; ответ создаётся только для submitted parent, единственный через unique(parent), с **фиксированным шаблоном**. Это не свободная AI-переписка. [pool:5–29][pool].

**Дополнительный source gap пула:** `src/pool/store.ts:14–23` берёт первые≤1000 eligible по id, затем `available[0]` и первый чужой tenant. Если эти два ящика остаются eligible и имеют квоту, следующий tick выбирает ту же пару/UTC day; `ON CONFLICT(pair_key) DO NOTHING` не переходит к следующей паре. После initial+single reply при default10 квота обычно ещё свободна. Следовательно, равномерное покрытие остальных участников не реализовано этим циклом и не доказано; fairness очереди dispatch не исправляет отсутствие jobs для других пар. Это вывод из ветвей кода, не выполненный нагрузочный тест. LIMIT1000 — граница одного обхода pool, **не общий лимит числа аккаунтов продукта**. [Точный выбор пары][pool].

`dispatch:tick` запускает `src/dispatch/worker.ts`: recoverAbandoned → pool.tick → **один claim** → submit → завершение процесса. В проверенном `docker-compose.yml` нет dispatch daemon/cron; есть только opt-in `local-poll` service с `replies/worker.js loop`. Поэтому даже локальный автоматический send loop требует внешнего повторного запуска tick; существование алгоритма scheduler не доказывает постоянно работающий сервис. Фактические процессы сервера в этом аудите не проверялись. [dispatch worker:6–16][dispatch], [package:15–20][package], [compose:50–56][compose].

Dispatch/poll по умолчанию disabled, поддерживаемая альтернатива только local_test; `localSinkAdapter.submit` возвращает accepted без SMTP, `FixtureAdapter` читает DB local_reply_fixture. Verifier также no-op local connect, не реальная проверка credentials. Включить live одним env flag нельзя: config отвергнет неизвестный mode. [config][config], [sink][adapter], [fixture:11–31][fixture], [verify:6–29][verify].

Число30 opt-in mailbox через7дней — **целевая метрика будущего разрешённого pilot**, не нынешний размер живого seed pool. Без внешних наблюдений reputation unknown; отправлено/SMTP accepted не доказывает inbox placement. [PRD:26–30][prd], [Completion:15–17][completion].

## Ответы, пять минут и ошибочное чтение performance evidence

N7 читает ограниченные header pages, сопоставляет From+References с собственным campaign recipient, атомарно записывает уникальный reply effect и останавливает enrollment. Ни LLM вызова, ни draft, ни approval/autosend ветки после этого нет (`src/replies/store.ts:77–90`). Исходный PRD прямо исключает AI-ответы, а `Specification.md:278` отклоняет AI-first entry по prompt07. В `src` и `package.json` нет OpenAI/Anthropic/LLM/gpt/generateReply token matches; direct runtime dependencies — только Argon2 и pg. Это дополнительная проверка к прочитанному потоку, не самостоятельное доказательство отсутствия любой функции. [reply][reply], [PRD][prd], [package:24–26][package], [scope][scope]. Наличие AI worker в donor01 **не означает его наличие или интеграцию в N7**.

Poll loop имеет минимальный интервал30с между началами tick, но один tick берёт **максимум один mailbox**; polling не гарантирован каждые30с каждому ящику при множестве due mailboxes. Freshness требует complete poll моложе60с. Scan ограничен20pages×100headers/120с; operation≤30с. UIDVALIDITY reset требует rescan/tail; неполнота/ошибка оставляет paused или rescan_incomplete, для незавершённого scan нужен explicit operator retry. Эти ограничения защищают stop-on-reply; они не образуют AI response SLA. [worker:14–74][poll], [safety:229–248][safety].

Отправка тоже не имеет безусловного дедлайна5мин: claim lease45с; доказанный pre-DATA transient — максимум3 попытки в120с, delays5/30с; ambiguity/crash после submitting →unknown_delivery без автоматического retry. Квота/отзыв consent/устаревший poll блокируют отправку. Для неизвестного исхода безопасность важнее обещания скорости. Эти retry значения относятся к transport attempt, **не к AI**. [submission:71–94][submit], [adapter:6–8][adapter].

Измеренные p95 **109.1/85.2/78.5мс** —100 authenticated `GET /api/mailboxes` на серию,10concurrent, CPU2, browser fetch+body parse; **KDF/provider I/O исключены**. Это скорость локального API кабинета, не время от получения письма до генерации/доставки ответа. Нет mail-ingress timestamps→AI queue/model→send acceptance серии и нет пяти-минутного percentile/доли deadline misses. Старое `Specification.md:214` «not currently achieved» устарело относительно последующего локального benchmark, но даже исправленная интерпретация не даёт AI SLA. [Измерение:23–34][perf], [итог:26][completion].

## Что можно честно заявлять сейчас

«Локально проверенный прототип управления несколькими ящиками, добровольным почтовым пулом и цепочками с квотами и stop-on-reply». Нельзя заявлять unlimited mailboxes, живой автоматический прогрев или AI-ответ≤5мин. Для исходного нового обещания нужны **отдельно согласованные изменения scope**: mailbox entitlement/scale model, реальные SMTP/IMAP и круглосуточный dispatcher, затем самостоятельная AI-reply фича с разрешениями/бюджетом и измеряемым end-to-end дедлайном. Этот анализ ничего из этого не активирует и не разрешает.

Read-only профиль; без LLM-субагентов, build/tests/install, provider calls, расходов и публикаций. Actual model, tokens, cost неизвестны (`null`), не оценивались. Исторические tests/latency приведены как существующие source-bound evidence, не как повторно выполненные проверки.

[completion]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/aa92db5eb7791ba7df2605d367b898dc0f748029/projects/07-cold-email-warmup/docs/Completion.md#L8
[plans]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/billing/plans.ts#L3
[mailbox]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/store.ts#L30
[pool]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/pool/store.ts#L5
[adapter]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/adapter.ts#L3
[config]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/config.ts#L33
[prd]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/aa92db5eb7791ba7df2605d367b898dc0f748029/projects/07-cold-email-warmup/docs/PRD.md#L22
[reply]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/store.ts#L77
[input]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/input.ts#L13
[claim]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/store.ts#L7
[campaign]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/campaigns/input.ts#L4
[dispatch]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/worker.ts#L6
[package]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/package.json#L15
[compose]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/docker-compose.yml#L50
[fixture]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/adapter.ts#L11
[verify]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/mailboxes/provider.ts#L6
[scope]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/aa92db5eb7791ba7df2605d367b898dc0f748029/projects/07-cold-email-warmup/docs/Specification.md#L278
[poll]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/replies/worker.ts#L14
[safety]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/aa92db5eb7791ba7df2605d367b898dc0f748029/projects/07-cold-email-warmup/docs/Specification.md#L229
[submit]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/243f04250d428e28e6869a1aef95bc5dbdab2f91/projects/07-cold-email-warmup/src/dispatch/submission.ts#L71
[perf]: https://github.com/djd1m/2026-AUG-PU-Projects/blob/aa92db5eb7791ba7df2605d367b898dc0f748029/projects/07-cold-email-warmup/docs/features/f06-cabinet-e2e-delivery/implementation-b3.md#L23

Started-At: 2026-10-06T08:45:51Z
Finished-At: 2026-10-06T08:48:55.401490+00:00
Elapsed: 184 seconds, including source audit/coordination/report.
Checks: 21 pinned source/line references verified through git show; production src/package/compose unchanged between cited revisions.
Status: completed
