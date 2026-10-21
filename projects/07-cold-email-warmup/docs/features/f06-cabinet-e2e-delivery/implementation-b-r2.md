# F06B-BLOCK-002 — narrow correction B-r2

Подтверждённый дефект исправлен: успешный GET HTML `/unsubscribe/:token` теперь получает `Referrer-Policy: same-origin`. Chromium native form navigation отправляет корректный configured Origin, сервер отвечает200 и останавливает будущую отправку. Единственное production-изменение — установка заголовка после успешного `suppression.confirm`; общий `no-referrer` для остальных stop/operator ответов сохранён. Origin/CSRF условие, CSP, cache, существующие noindex поверхности и токены не менялись.

Run `20261003T023900Z-f06`, unit `n7-f06b-r2-sol`, attempt `b-r2`, launch source `03c8952488baa781e88fe54a41d891d2c6aa8e9a`, spec `72b44888ddab0405d955084d572130649fbdddc70b33d53a364db7dd80f05de5`. Профиль `compact-quality-first-v2`; substantive ROUTE XL по privacy/Origin, mechanical L/exit1 как нижняя граница; OWN-N7-002 и явная инструкция владельца покрывают локальный TEST. Один исполнитель, без делегирования/fallback. Requested `gpt-6.1-sol/high`; actual model/effort, usage/cost=null до данных хоста. Экономия не установлена. Fresh Astra review — следующий независимый этап владельца, в этой попытке не запускался.

Заморожено93 source inputs: source-map SHA256 `e9e78e47c349a0c23b3542dc68945d1f976f76c6edbb8bee61c817a3aebd084b`, compiled JS SHA256 `455e80941dc8bc0c0dd7cca1a2f9b1388e1275b7f8b85fdf716993fdcb1ca27f`, image `sha256:4a0935cfa92622f453ef0b922d3b119099a20b066e5ac7880dec0f2d67ee70fb`. Каждый source/compiled файл проверен в работающем собственном web; image receipt и новый frozen map сохранены отдельно от R1. Исходный image `d537403b…`/source `cbe07f1…` — provenance дефекта, а не evidence исправления.

Все evidence ниже относятся к `docs/telemetry/features/20261003T023900Z-f06/`:

| Проверка | Результат / evidence |
|---|---|
| Type/lint/build/fullunit | `sol-b-r2-{typecheck,lint,build,test}.log` и `.exit`: exit0,39/39 unit |
| Meaningful source mutation | `sol-b-r2-mutation.json`: точный оригинальный `src/server.ts` из launch revision, focused actual-PG HTTP тест RED exit1 на `no-referrer` vs `same-origin`; восстановлен побайтно, GREEN exit0 |
| Affected suppression HTTP/PG | `sol-b-r2-pg.log`:14/14, exit0; GET0 бизнес-изменений, null/cross403 origin_denied0 изменений, native form payload с configured Origin200, повтор идемпотентен |
| Реальная native форма1440+390 | `sol-b-r2-unsubscribe-probe-2/{preflight,checks,exit}.json`: READY,30/30 assertion, exit0; четыре PNG просмотрены; configured Origin POST200, suppression+1 и queued future job cancellation+1 для каждой ширины; повтор200 без изменения snapshot |
| Cross-origin privacy | Для каждой ширины настоящий переход к отдельному loopback origin18710: Referer отсутствует; никакое значение заголовка не сохраняется |
| Реальные сообщения | `local-messages.json` и `fixtures.jsonl`: три новых TEST сообщения через accepted PollWorker, DispatchStore, SubmissionStore; body и оба unsubscribe headers проверены. Operator fixture только в собственном web, вне браузера; бизнес-ответы не mocked |
| Runtime/audit | `sol-b-r2-audit.json`: exact source/build/image, privatePG без ports, web loopback18709 CPU2, runtime secrets/canary отсутствуют в файлах и web logs, собственная network attachment снята, shared browser сохранён |
| Harness/static | `sol-b-r2-light-checks.json`: Python AST, node syntax, <500 lines, diff-check pass |

Команды от корня проекта:

```sh
npm run typecheck
npm run lint
npm run build
npm test
N7_F06_BINDING_PREFIX=sol-b-r2 python3 scripts/check-f06b-r1-snapshot.py freeze
# Собственный image build/start под heavy flock; точные команды — sol-b-r2-heavy-command.sh.
python3 scripts/check-f06b-r1-mutation.py b-r2
# Affected PG под heavy flock; точные команды — sol-b-r2-pg-command.sh.
timeout 160s python3 scripts/ui/f06-run.py r2-unsubscribe-probe-2 docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json
python3 scripts/ui/f06-audit.py docs/telemetry/features/20261003T023900Z-f06/sol-b-r2-image-receipt.json b-r2
```

Попытка `sol-b-r2-unsubscribe-probe-1` сохранена: настоящий form POST был200/configured Origin, но harness ошибочно ожидал `data.state=suppressed` вместо реального `{accepted:true}`. Исправлен только oracle, повтор проведён в новом уникальном evidence directory с новыми TEST сообщениями. Оба mutex интервала и detach записаны; heavy освобождён до UI. Initial disk gate отказал при пороге2GiB; затем применён владельческий2GB (2000000KiB), доступно2058512KiB (>2GB); RAM4543948KiB. Никакого общего prune не было. Dependencies — собственный symlink на immutable donor, target не менялся.

**Отдельная найденная граница, вне header correction:** baseline `noOriginCapability` уже разрешает public POST без Origin, включая confirm payload, для capability/one-click пути. Исключение не добавлено и не расширено этой правкой. Поэтому универсальный missing-Origin403 здесь **не доказан и не поставлен**; null и cross-origin403 доказаны. Противоречие между «ONLY header» и «missing403» было вынесено владельцу; до дополнительного ответа применён минимальный явно указанный scope. Изменение существующего one-click контракта требует отдельного решения. Полная B1–B4/browser matrix, unchanged115PG, независимый fresh Astra review и доставка всей F06 остаются вне этой коррекции.

Нет SMTP, charge, deploy, paidLLM, secrets в логах, schema/deps/root изменений, новых browser/container/networks или push. Длительность, terminal binding и пробелы измерений — `sol-b-r2-run.json`, `sol-b-r2-events.jsonl`, `sol-b-r2-receipt.md`; actual heavy/UI интервалы — `sol-b-r2-progress.md`.
