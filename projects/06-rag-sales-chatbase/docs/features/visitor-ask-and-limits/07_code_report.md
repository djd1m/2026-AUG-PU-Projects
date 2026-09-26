# 07 — Отчёт о коде: `visitor-ask-and-limits` (фича 12)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (`claude-opus-5-5[1m]`, агент, автономный режим, один исполнитель) ·
Основа: `HEAD 2923e4a` + незакоммиченное дерево проекта (снимок `git diff` + 11 новых файлов кода/тестов без `docs/` и
артефактов: sha256 `4e6ecb45ac1c412e…`). Не закоммичено. FR: FR-WIDGET-002, FR-LIMIT-001, FR-BOT-003, FR-ANSWER-003,
FR-GROWTH-006, FR-TARIFF-003; SC-US-006-1/2, SC-US-007-1/2/3, SC-US-008-1/2, SC-US-009-1/2; **ADR-003, ADR-004, ADR-005,
ADR-008, ADR-013, ADR-014** (перенос L1 Phase 2 — номера ADR названы). Решения без владельца — **A-N6-035**.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| Маршрут вопроса посетителя | `apps/web/src/server/widget-ask-handler.ts`, `widget-ask-deps.ts`, `app/w/v1/ask/route.ts`, `widget-runtime.ts` | `POST /w/v1/ask?bot=`: дверь → бот по public_key из адреса → CheckOrigin (403 без ACAO, тело не читается, `refused_origin` без текста) → тело ≤ 4 КиБ, ЗАКРЫТЫЙ набор `{visitor_session, question}` (`history`/`bot_id` — 422) → токен сессии (409) → бейдж показан (409, ADR-004) → отметка «проверено» (A-N6-035) → ядро `answerQuestion` с квотой 5 scope → answered: ход истории, `recordWidgetInstall(first_answer)`, `growth_event first_answer`. Статусы ядра → HTTP: refused → 429 `{code: limit, message, contact}`, unknown → 200 с контактом, invalid → 422, not_found → 404. `OPTIONS ?bot=` — по списку ЭТОГО бота |
| Токен сессии посетителя | `apps/web/src/server/visitor-token.ts`, `widget-handler.ts` (config, event) | `<uuid>.<HMAC-SHA256(SESSION_SECRET, uuid, бот, origin, /24)>` выдаёт `GET /w/v1/config` (прежний годный продолжается через `?vs=`); «один посетитель» = id токена (`visitor_answers`) + /24 (`ip_answers`); UUID, придуманный клиентом, не принимается ни в `event`, ни в `ask` |
| Сессия, история, сторож | `packages/db/migrations/003_visitor_ask.sql`, `packages/db/src/visitor.ts`, `apps/worker/src/watchdog.ts` | `visitor_session.history` (≤ 2 хода, CHECK) + `history_at`; ход старше 30 мин не читается; `openVisitorSession` (ленивое создание + привязка бот/origin + «показ бейджа был»); `recordFirstAnswer`; `sweepVisitorText` — сторож стирает текст «не знаю» по сроку 14 дней и историю старше 30 мин (WatchdogTick п.5) |
| A-N6-035 (ворота показа) | миграция 003 (`bot.answers_verified_at`), `packages/db/src/{widget,bots}.ts`, `cabinet-handler.ts` (`createBotVerifyHandler`), `cabinet-deps.ts`, `app/api/bots/[botId]/verify/route.ts`, `BotScreen.tsx`, `page.tsx` | без отметки — «Бот ещё настраивается … Напишите: <контакт>», модель и квота не тронуты; кнопка «Я проверил ответы бота» / «Снять отметку» с текстом о риске; значение строго boolean |
| SC-US-007-2 (баннер) | `packages/db/src/bots.ts` (`month_answers_used` по `now()` БД), `page.tsx` (предел из `QUOTA_BOT_MONTH_*` по плану), `BotScreen.tsx` | «Месячный лимит ответов исчерпан (N из N)…» с упоминанием, что тестовые вопросы расходуют тот же лимит (carry_over фичи 13) |
| Виджет | `apps/widget/src/{api,session,index,chat-window}.ts` | токен из config в `sessionStorage`; вопрос на `/w/v1/ask?bot=` с телом `{visitor_session, question}`; ждёт доставки показа бейджа; 409 `session_expired` → новый токен и ОДИН повтор; бандл 5,61 КБ gzip |
| carry_over quota-and-spend | `packages/rag/src/spend.ts` (M1), `.claude/rules/coding-style.md` (L-1, M2), страж в `tests/widget-ask.unit.test.ts` | M1: слоты проб `O_CREAT|O_EXCL`; M2: все построители списаний уже берут `now` из `SELECT now()` — закреплено стражем по исходнику; L-1: правило «клиент OpenRouter только внутри `run:` meteredCall» + страж |
| carry_over rag-answer | `widget-ask-handler.ts`, тесты | история на сервере + тест подделки (unit, integration, мутация); A-N6-030 — явный known-gap тест на ядре (зелёный, пока разрыв есть) + тест, что маршрут не показывает выдумку непроверенного бота |
| carry_over widget (L-1) | `tests/widget-handler.unit.test.ts` | trailing dot (`https://shop.example.`) — отказ; punycode `пекарня.рф` ↔ `xn--80ajpngj0i.xn--p1ai` — совпадает с сохранённым кабинетом, похожая метка — нет |
| Тесты | `tests/{widget-ask.unit,visitor-ask.integration,probe.concurrency}.test.ts`; правки `tests/{widget-handler.unit,widget-config.integration,widget-source,bot-cabinet.unit}.test.ts`, `tests/browser/{widget-harness,widget-embed.test}.ts`; `scripts/test-visitor-ask-mutations.mjs`, `scripts/test-widget-browser-mutations.mjs` (+ мутация, выбор и каталог) | см. 05_completion |
| Документы | `docs/decisions-autonomous.md` (A-N6-035), `docs/embed-contract.md`, `docs/model-cost-contract.md`, CLAUDE.md, roadmap | |

## Дефекты, пойманные по ходу

- **Страж M2 ложно краснел на комментарии** (`previewCreateCharges (ceilings.ts)` в шапке `previews.ts`): регэксп
  сузен до вызова с аргументом `ceilings,`. Страж ещё раз проверен на всех 6 местах вызова (`seen ≥ 5`).
- **Прежний счётчик проб действительно гонится** (ревью M1 было про перебор, измерение показало обратное): 48 процессов
  одновременно → **23 слота из 24** (ложный отказ старта, а не перерасход). После `O_EXCL` — ровно 24 в трёх раундах;
  мутация «вернуть прежнюю форму» краснеет тест (`1 failed`).

## Отклонения от постановки и почему

- **Бот в адресе `?bot=`, а не в теле** (постановка координатора: «бот по public_id из query»; Pseudocode — `bot` в
  теле): CheckOrigin идёт ДО чтения тела, предполётный запрос проверяется по списку своего бота — A-N6-035 (3).
- **`history` в теле запрещена (422), а не «игнорируется»:** молча принятое поле однажды начнут читать (тот же довод,
  что `bot_id` в ядре). Тест «поддельный ход» доказывает оба свойства: 422 до квоты и модели, в промпте — только ходы
  сервера. Мутация «принять историю от клиента» → `2 failed`.
- **Ответ непроверенного бота не зовёт модель вовсе** (постановка: «ответ показывается только если…») — показывать
  нечего, платить незачем; квота тоже не списывается.
- **`apps/web/src/server/record-widget-install.ts` не создан**: `recordWidgetInstall` уже в `packages/db/src/widget.ts`.
- **Строки `embed-contract.md` не закрыты (код 2, `not-deployed`)**: стенд не поднимался — старт `web` делает пробный
  вызов настоящей модели, а продуктовые модели в этом прогоне — только фейки. Оснастка чужого origin ходит в НАСТОЯЩИЙ
  маршрут и ядро.
- **Калибровка порога 20 + 20 — не выполнена** (ручное измерение на живой модели; запрещено этим прогоном).

## Альтернатива решению A-N6-035 (для владельца)

Флаг «проверено» — грубые ворота: он переносит ответственность на владельца, но не делает ответ правдивее, и после
отметки выдумка A-N6-030 снова возможна. Дешёвые детерминированные дополнения, которые я бы предложил вместо
«всё или ничего»: (а) **сверка чисел и обещаний** — каждое число, ₽, %, срок из текста ответа обязано встречаться в
тексте процитированного фрагмента, иначе «не знаю» (закрывает именно пример «скидка 90%», слой 1, без модели);
(б) **режим «только цитата» для непроверенного бота** — посетитель видит сам фрагмент-источник вместо текста модели
(польза без выдумки). Реализован fail-closed вариант из постановки; (а) — кандидат в следующую фичу.

Итоги проверок — в [`05_completion.md`](05_completion.md): образ **837/837**, браузер **33/33** (3 движка), мутации
**6/6** (образ) + **3/3** (браузер) + регресс фичи 11 **4/4**, `check-embed-contract` = 2 (`not-deployed`),
`check-model-cost` = 0.

Status: completed
