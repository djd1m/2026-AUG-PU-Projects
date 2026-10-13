# F06 B2 — фактическое возобновление B1–B4

Результат: **failed**, новый подтверждённый blocker **F06B-BLOCK-002**. Полная матрица и MVP не приняты. Один исполнитель, без агентов; `compact-quality-first-v2`, substantive XL. ROUTE до реализации: explicit шесть f06 helpers → L/exit1, нижняя граница; XL сохранён. OWN-N7-002 и текущая инструкция владельца разрешают локальный TEST MVP и требуют STOP при новом дефекте продукта. Product src/db/deps, прежние failed receipts и implementation-b/r1 не изменены.

Run `20261003T023900Z-f06`, unit `n7-f06b-resume-sol`, attempt `b2`; старт `2026-10-03T04:25:16.391164+00:00`; исходная ревизия `647639ec7da7d328944ac16fe7e0850c615d9f81`; spec SHA256 `72b44888ddab0405d955084d572130649fbdddc70b33d53a364db7dd80f05de5`. Полная телеметрия попытки и длительность: `docs/telemetry/features/20261003T023900Z-f06/sol-b2-run.json`, `sol-b2-events.jsonl`, terminal `sol-b2-receipt.md`. Requested `gpt-6.1-sol/high`; actual model/effort, tokens и cost = null: метаданные хоста недоступны; fallback/delegation отсутствуют, экономия не установлена.

Использован явный принятый R1 image receipt. Точная source-map **93** inputs, build-map и работающий image проверены; source SHA256 `cbe07f1ca34ec24312cc77ca14625be26dcf7ed07f79a44656b55e6b8cb9d047`; compiled JS `45385ec142c3cf23790226575dcbe2b4f7d2d760cd108cab5383e18a81fd8ae8`; image `sha256:d537403b927dff7dbdf6a01845545c1430820a9c2da015c49d39fde172a082af`. Локальный dist скопирован из точного работающего контейнера, без сборки/изменения image/deps. R1 frozen receipt revision `50e3c26d93327dc16fee89cfbf8252bf5466cffe` обозначает provenance snapshot, текущая launch revision выше; содержимое продукта совпадает.

**F06B-BLOCK-002, high/blocker:** собственная серверная HTML-форма отписки не выполняет остановку. В `src/server.ts:73` publicStop получает `Referrer-Policy: no-referrer`; настоящая Chromium form navigation POST несёт opaque Origin `null`; проверка `src/server.ts:82` отвечает HTTP403 `origin_denied` до `SuppressionStore.unsubscribe`. Форма из `src/suppression/http.ts:3` открывается GET200 и содержит обычную кнопку Unsubscribe. Bridge сохраняет исходный Host/Origin без подмены, записывая только безопасный класс origin. Утверждение о причине основано на фактическом Origin-классе и текущем коде; политика no-referrer связана с этим POST. Это не дефект native-fetch BLOCK001 и не исправлено в этом проходе.

Воспроизведение дважды: Chromium1440 полной попытки и отдельный Chromium390 probe. Probe `diagnostic.json`: GET/absent-origin/200 → POST/opaque-null/403; реальное тело `error.code=origin_denied`. `effects-before.json` и `effects-after.json` побайтно по JSON-значениям равны: own job state/count, consent rows, entitlement count без изменений. Три ранее submitted локальных сообщения и два queued последующих задания сохраняются. Не утверждаем, что это полный негативный tenant/zero-effects набор. После подтверждения дальнейшая матрица остановлена; бизнес-код не исправлялся.

Все пути evidence ниже относительны `docs/telemetry/features/20261003T023900Z-f06/`.

| AC | Фактически выполнено | Вердикт и оставшееся |
|---|---|---|
| B1 | Existing Playwright1.63.0 Docker; Chromium153.0.8010.12 full journey1440 до отписки; reduced-motion, пять shot/no-overflow checks, пустые credential fields; все 8 реальных PNG включая failure/probe просмотрены через view_image; READY с SHA/source/build/env/input names/command/effects/destination; mutex/network cleanup | **Incomplete/failed**. Полный Chromium390 и Firefox/WebKit390 не исполнены; keyboard/focus/полная labels матрица не проверены. Только публичная форма probe390. |
| B2 | Настоящие register201/bootstrap; UI mailbox add/edit/defaultlimit10/TEST verification, два отдельных unchecked consent controls, pool grant/revoke/waiting, campaign2steps/3recipients/preview, blocked before grant → real grant/start; accepted PollWorker + DispatchStore/SubmissionStore: 3 TEST messages с body и List-Unsubscribe; настоящий reply poll → replied и отмена одного будущего job | **Failed**: form unsubscribe403. Pause, complaint quarantine, limit update, UI quarantine, escaped hostile preview, evidence compare/share/copy/open/revoke, partner/checkout/canonical refresh, login/reload persistence не исполнены. |
| B3 | Реальный blocked-before-grant и пустой mailbox desktop; no operator secret в браузере; safe cleared screenshots | **Not executed**: два tenant/foreign404/DOM/zeroeffects, old-cookie logout401, late fence, expired401, R1 passive/explicit two-tab, loading/invalid/unavailable/blocked full desktop/mobile. |
| B4 | Source/build/image exact; web CPU2/loopback18709, PG без host ports; project + own web logs runtime secret scan PASS, canary web logs absent; network detached и shared browser/own web preserved; syntax/AST/line limits/diff check PASS | **Incomplete**: 100 samples/10 concurrency/p95 не исполнены, p95=null. Credential submission произошла, отдельный API-body canary assertion не инструментирован до STOP. Fresh Astra B review — следующий этап координатора. |

Команды от PROJECT (`projects/07-cold-email-warmup`):

```sh
timeout 660s python3 scripts/ui/f06-run.py b2-attempt-1 docs/telemetry/features/20261003T023900Z-f06/sol-b-r1-image-receipt.json
# exit1; 30 пройденных assertion checks, затем timeout ожидания accepted после реального POST403
timeout 120s python3 scripts/ui/f06-unsubscribe-probe.py
# exit0 означает подтверждение дефекта, не product pass
python3 scripts/ui/f06-audit.py docs/telemetry/features/20261003T023900Z-f06/sol-b-r1-image-receipt.json b2
# exit0: read-only source/build/runtime/secret/cleanup audit
```

Полная неудачная попытка сохранена отдельно: `sol-b-b2-attempt-1/{preflight,checks,exit}.json`, `fixtures.jsonl`, `1-local-messages.json`, 6 PNG и точные скопированные execution scripts. Probe: `sol-b-b2-unsubscribe-probe-1/` (read-only READY непосредственно перед исполнением, diagnostic/effects/exit/2 PNG/exact probe). Негативный initial anonymous auth/me401 — ожидаемый; unsubscribe403 — неожиданный product failure; console errors классифицированы так же, pageerrors=0 не означает whole pass. `sol-b2-audit.json` сохраняет классификацию отдельно, не переписывает историю.

Изменения harness: новый progress path `/tmp/n7-f06b-resume-run/progress.md`, own b2 events/audit path, запрет перезаписи существующего audit, очистка password/credential username перед failure shot, удалена ошибочная hardcoded BLOCK001 классификация, добавлен ограниченный реальный unsubscribe diagnostic. `sol-b2-light-checks.json`: 5 node syntax + 3 Python AST + git diff-check (9), каждый script <500 строк. Unchanged39 unit/115PG не перезапускались; прежние проверки наследуются лишь как R1 provenance.

Mutex был реально взят/освобождён для обеих browser executions, соответствующие интервалы сохранены в `sol-b2-progress.md` и events. Контексты, bridge, sockets и собственное network attachment закрыты в finally; shared browser и собственный сервер оставлены работающими. Нет SMTP, charge, paid LLM, deploy, shared proxy, push, новых browser/container или dependency mutation.

Следующее действие координатора: отдельная разрешённая bounded correction BLOCK002, fresh Astra review и новый source/build/image/native form receipt, затем новая уникальная browser attempt для всей оставшейся B1–B4 матрицы. B5 canonical docs/traceability и B6 PR/delivery остаются координатору; текущий русский локальный commit без push не закрывает B6.
