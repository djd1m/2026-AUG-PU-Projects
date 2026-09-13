# Фича `partner-codes-and-cabinet` — завершение: план (реализация не начата)

## Статус документа

Документ — ПЛАН (Phase 1, режим скорости DEC-A-032). Реализация не выполнялась в рамках этого
планирования; таблица `## Criterion coverage` ниже называет ПЛАНИРУЕМЫЕ файлы тестов, а не
фактический прогон. При реализации раздел дополняется фактом по образцу
`docs/features/foundation/05_completion.md`, расхождение плана и факта не стирается, а дописывается.

## Готовность к реализации

- Миграций НЕ требуется: пять нужных таблиц и оба индекса уже в `packages/db/migrations/001_init.sql`.
- Секретов НЕ требуется: только уже обязательный `DATABASE_URL`.
- Единственная неизвестная на момент планирования — точный путь файла, где `source-and-correct`
  переводит `recognition.status` в `done` (эта фича его ещё не написала). Контракт вызова назван в
  `03_architecture.md`; конкретную строку интеграции подставляет реализующий агент по факту
  существования того кода.

## Перед передачей результата (по образцу `testing.md`)

```bash
npm test                                            # unit + integration, включая конкурентные
npm run lint && npm run build
node ../../.claude/hooks/check-ports.cjs .          # не тронуто фичей, но не должно сломаться
bash ../../.claude/hooks/check-review-contract.cjs . 2>/dev/null || true
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Известный, честно названный пробел (follow-up, не блокирует Phase 1)

**FU-partner-codes-and-cabinet-1.** `attribution.reject_reason = antifraud_ip_burst` НИКОГДА не
записывается этой фичей: `ActivateAttributionOnRecognition` при заблокированном коде всегда пишет
`code_blocked`, не различая, была ли исходная причина блокировки `antifraud_ip_burst` или `manual`
(см. `01_specification.md`, «Решение…», и `02_pseudocode.md`, конец `ActivateAttributionOnRecognition`).
Причина: узнать задним числом, какая ИЗ ДВУХ причин действовала В МОМЕНТ, когда конкретная
`pending`-строка ещё не была активирована, без хранения снимка на момент блокировки, было бы
изобретением факта. Колонка `reject_reason` при этом остаётся ЗАКРЫТЫМ перечислением из трёх
значений (канон не меняется) — значение `antifraud_ip_burst` в ней просто не достижимо кодом этой
фичи. Устранение — отдельное решение владельца канона: либо принять асимметрию, либо ввести снимок
причины блокировки на момент создания `pending`-атрибуции (полноценная миграция, вне этого плана).

## Вне охвата (следующие фичи роадмапа или отдельные решения)

- Выдача кода партнёру (административный процесс, вне API недели).
- Деактивация партнёра (`partner.status`) как отдельный сценарий, влияющий на его коды.
- Живой прогон `GET /api/v1/partner/dashboard` на развёрнутом стенде по внешнему адресу
  (`deployment-seams.md`) — часть общего E2E CJM, не отдельного смоука этой фичи.

## Criterion coverage

**Таблица ПЛАНОВАЯ.** Каждый файл — предполагаемое расположение теста, соответствующее
`.claude/rules/coding-style.md` (структура `apps/api`) и `04_refinement.md` (слой по природе
признака). Реализующий агент подтверждает или правит расположение по факту.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-partner-codes-and-cabinet-1 | tests/unit/partner/normalize-code.test.ts | недействительный формат и неизвестный код ничего не меняют |
| AC-partner-codes-and-cabinet-2 | tests/integration/partner/apply-code.test.ts | первое применение создаёт pending-атрибуцию и одно событие code_applied |
| AC-partner-codes-and-cabinet-3 | tests/integration/partner/apply-code.test.ts | явный код заменяет cookie и записывает replaced_source |
| AC-partner-codes-and-cabinet-4 | tests/integration/partner/apply-code.test.ts | explicit не перебивается ни другим, ни тем же кодом |
| AC-partner-codes-and-cabinet-5 | tests/integration/partner/apply-code.test.ts | слабый источник не перебивает слабый |
| AC-partner-codes-and-cabinet-6 | tests/concurrency/partner/apply-code-session.test.ts | два кода одной сессией одновременно дают один applied и один conflict |
| AC-partner-codes-and-cabinet-7 | tests/integration/partner/apply-code.test.ts | заблокированный код отклоняется до записи в attribution |
| AC-partner-codes-and-cabinet-8 | tests/integration/partner/apply-code.test.ts | самореферал отклоняется до записи в attribution |
| AC-partner-codes-and-cabinet-9 | tests/concurrency/partner/anti-fraud.test.ts | 51-е применение блокирует код и переживает 20 одновременных попыток |
| AC-partner-codes-and-cabinet-10 | tests/integration/partner/anti-fraud.test.ts | заблокированный код не пересчитывает окно повторно |
| AC-partner-codes-and-cabinet-11 | tests/integration/partner/manual-unblock-guard.test.ts | разблокировка только вручную — страж падает на внедрённом автоснятии |
| AC-partner-codes-and-cabinet-12 | tests/integration/partner/activate-attribution.test.ts | первое успешное распознавание активирует, второе — no-op |
| AC-partner-codes-and-cabinet-13 | tests/integration/partner/activate-attribution.test.ts | код заблокирован между применением и распознаванием даёт rejected(code_blocked) |
| AC-partner-codes-and-cabinet-14 | tests/integration/partner/activate-attribution.test.ts | самореферал, обнаруженный после входа через Telegram, даёт rejected(self_referral) |
| AC-partner-codes-and-cabinet-15 | tests/integration/partner/dashboard.test.ts | четыре счётчика кабинета совпадают с посеянными growth_event |
| AC-partner-codes-and-cabinet-16 | tests/integration/partner/dashboard.test.ts | не-партнёр получает 403 без утечки чужих счётчиков |
| AC-partner-codes-and-cabinet-17 | tests/integration/partner/dashboard-server-authority-guard.test.ts | код кабинета берётся только с сервера — страж падает на внедрённом чтении query |
| AC-partner-codes-and-cabinet-18 | tests/integration/partner/dashboard.test.ts | честные нули и порог n<30 вместо процента |
| AC-partner-codes-and-cabinet-19 | tests/unit/partner/dashboard-schema.test.ts | в ответе кабинета нет денежных полей |

## Answer-map PD-*
PD-REUSE-001 ← FR-partner-codes-and-cabinet-3 (anti-fraud перенесён из N1 как отправная точка).
PD-PRICE-001 ← FR-partner-codes-and-cabinet-10 (в кабинете нет денег).
