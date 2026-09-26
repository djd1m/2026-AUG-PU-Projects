# 05 — Квитанция: `visitor-ask-and-limits` (фича 12)

Дата: 2026-09-26 · Основа: `HEAD 2923e4a` + незакоммиченное дерево (снимок sha256 `4e6ecb45ac1c412e…`, см. 07) ·
ADR: **ADR-003, ADR-004, ADR-005, ADR-008, ADR-013, ADR-014** · решения: **A-N6-035** · отчёт: [`07_code_report.md`](07_code_report.md).

## Профиль и модели

Один исполнитель (делегирование не применялось): Claude Opus 5.5 (`claude-opus-5-5[1m]`, из метаданных сессии).
OpenAI/Codex не вызывались; продуктовые модели — только фейки (подменный fetch под настоящим клиентом OpenRouter).
Независимого ревью (Sonnet 5) ещё НЕ было — `08_review.md` отсутствует. Тир по complexity-router — XL (платный вызов,
запускаемый посторонним); остановки на плане у владельца не было — автономный режим по постановке координатора.
Телеметрия p-replicator: счётчики токенов/времени агента — `null` (недоступны изнутри агента).

## Проверки и итоги (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| typecheck | `npm run typecheck` | код 0 |
| lint | `npm run lint` | `Статические правила: ошибок нет` |
| build | стадия build образа (`npm run build`: виджет → rag → db → queue → worker → web) | `[widget] widget.e3bc9a0778cf6e82.js: raw=14.43 КБ, gzip=5.61 КБ, потолок 45.00 КБ`; маршрут `ƒ /w/v1/ask` в сборке Next |
| тесты в образе, настоящие Postgres 16 + pgvector 0.8.6 и Redis 7.4 | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | `Test Files  43 passed (43)` · `Tests  837 passed (837)` · `exit=0`, пропущенных 0 — `tests/artifacts/visitor-ask-and-limits/image-run.txt` |
| браузер на ЧУЖОМ origin, Playwright 1.60, Chromium + Firefox + WebKit, фейковая модель | `bash scripts/check-responsive.sh --test tests/browser/widget-embed.test.ts` | `Test Files  1 passed (1)` · `Tests  33 passed (33)` · `exit=0` — `browser-run.txt` |
| мутации в образе | `… run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-visitor-ask-mutations.mjs'` | 6/6, код 0 — `mutations-run.txt` |
| мутации в браузере | `N6_BROWSER_MUTATIONS_ONLY=unverified-shown,cors-wildcard,origin-outside-allowlist node scripts/test-widget-browser-mutations.mjs` | 3/3, код 0 — `browser-mutations-run.txt`, `browser-mutations/` |
| регресс мутаций фичи 11 | `… run --rm test sh -c 'node scripts/test-db.mjs && node scripts/test-widget-mutations.mjs'` | 4/4, код 0 — `regression-widget-mutations.txt` |
| контракт стоимости | `node ../../.claude/hooks/check-model-cost.cjs .` | код 0 (`9 вызов(ов) названы …`) |
| контракт встраивания | `node ../../.claude/hooks/check-embed-contract.cjs .` | **код 2** — `проверка на чужой странице НЕ ВЫПОЛНЕНА, причина: not-deployed` |
| уборка | `docker compose … down -v`; `docker ps -a --filter name=n6-test`; `docker volume ls --filter name=n6-test`; `docker images -f dangling=true` | контейнеров 0, томов 0, висячих образов 0; образ `n6-sufler-test:foundation` пересобран на месте. Диск: 93 %, 12 ГБ свободно |

Проверки `check-env-wiring.sh` и `check-ports.cjs` не выполнялись по существу (код 2 без `.env` стека): compose и
переменные окружения фича не меняла — новых переменных нет, токен подписывается существующим `SESSION_SECRET`.

## Стражи, испытанные мутацией (дефект → красный; восстановлено → зелёный)

В образе (`tests/{widget-ask.unit,widget-handler.unit,visitor-ask.integration,quota.concurrency,spend,probe.concurrency}`; дословно):

```
visitor-limit-removed: дефект возвращён → 6 failed | 58 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
history-from-client: дефект возвращён → 2 failed | 62 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
cors-wildcard: дефект возвращён → 11 failed | 53 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
unverified-shown: дефект возвращён → 3 failed | 61 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
charge-on-success: дефект возвращён → 8 failed | 56 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
probe-read-then-write: дефект возвращён → 1 failed | 63 passed (64) (код 1); код восстановлен → 64 passed (64) (код 0)
```

В браузере на чужом origin (`tests/browser/widget-embed.test.ts`, три движка; дословно):

```
origin-outside-allowlist: дефект возвращён → 6 failed | 27 passed (33) (код 1); код восстановлен → 33 passed (33) (код 0)
cors-wildcard: дефект возвращён → 6 failed | 27 passed (33) (код 1); код восстановлен → 33 passed (33) (код 0)
unverified-shown: дефект возвращён → 3 failed | 30 passed (33) (код 1); код восстановлен → 33 passed (33) (код 0)
```

Регресс фичи 11 (`test-widget-mutations.mjs`, в образе): `cors-wildcard 7 failed → 49 passed`, `origin-outside-allowlist
7 failed → 49 passed`, `badge-normalized 2 failed → 49 passed`, `inline-style 1 failed → 49 passed`. Привязка: мутации
и образ прогнаны на одном дереве; после них менялись только документы и сценарий браузерных мутаций (выбор/каталог).

## Что доказано и чем

- **SC-US-008-1:** origin вне списка (другой бот, поддомен, http, `null`, `evil`) — 403 без ACAO, мусорное тело не
  читается, `quota_counter` бота пуст, эмбеддингов 0, `refused_origin` ×5 без текста (Postgres); POST со страницы :8098
  — браузер ответа не отдаёт, модель не вызвана (3 движка).
- **SC-US-008-2:** ровно один ACAO = origin хозяина, `Vary: Origin`, без Allow-Credentials (unit, Postgres, браузер;
  предполётный `OPTIONS ?bot=` 204 только по списку этого бота).
- **SC-US-006-1/2:** ответ с плашкой «Цены» и ссылкой (Postgres и браузер); «не знаю» без вызова модели, текст вопроса
  хранится с `text_expires_at` = +14 дней; у answered — только id цитат.
- **SC-US-007-1:** 21-й вопрос сессии — 429 `Лимит вопросов на сегодня исчерпан. Напишите: <контакт>`, модель не
  вызвана, `refused_limit` без текста. **Счёт по попыткам:** отказ шлюза (эмбеддинг 500) списал 1 из 20.
- **SC-US-007-3 (конкурентно):** 20 одновременных вопросов ОДНОГО посетителя при остатке 1 → ровно 1 ответ, 1 вызов
  модели, 19 × 429 с контактом. **testing.md п.6:** 20 сессий × 4 вопроса за одним /24 одновременно → ровно 60 ответов,
  ни одна сессия не упёрлась в свой предел. **global_answers:** 24 одновременных вопроса из 12 /24 и 2 ботов при
  остатке 7 → ровно 7.
- **SC-US-007-2:** месячный потолок бота исчерпан → 429 с контактом всем посетителям без эмбеддинга; `readBotCabinet`
  отдаёт `month_answers_used` для баннера (разметка баннера прибором адаптивности НЕ проверялась).
- **SC-US-009-1/2:** первый ответ на origin хозяина — `widget_install.first_answer_at` и события `widget_install` +
  `first_answer` (одно на бота); вопросы с `N6_PUBLIC_ORIGIN` установкой не считаются.
- **История на сервере:** поддельный ход в теле → 422 до квоты и модели; в промпте только наши ходы, ни одного сообщения
  с ролью `assistant`; ≤ 2 хода; старше 30 мин не читается; сторож стирает историю и просроченный текст «не знаю».
- **A-N6-035:** бот без отметки — «Бот ещё настраивается … Напишите: <контакт>», 0 эмбеддингов, 0 вызовов модели, 0
  списаний; после отметки — ответ (Postgres, браузер, мутация в образе и в браузере).
- **ADR-004 на сервере:** free без записанного показа бейджа — 409; nobadge — без показа; токен с другого /24 и голый
  UUID — 409 `session_expired`, ip-квота нового /24 не тронута.
- **A-N6-030 — known-gap зафиксирован:** ядро возвращает answered с «скидкой 90%», которой нет во фрагменте
  (тест зелёный, пока разрыв есть); маршрут непроверенного бота этот текст не показывает.
- **Ревью quota-and-spend:** M1 — 48 процессов → ровно 24 слота (3 раунда), прежняя форма давала 23; M2 — страж: все
  6 вызовов построителей списаний берут `now` из `SELECT now()`; L-1 — правило в `coding-style.md` + страж (5 вызовов
  клиента, все внутри `run:` meteredCall).
- **Ревью widget L-1:** trailing dot — отказ; punycode — совпадает с сохранённым кабинетом.

## Что НЕ доказано

- Проверка на стенде по ВЫДАННОМУ адресу (`not-deployed`, код 2): стек целиком не поднимался — старт `web` зовёт
  настоящую модель (`answerProbe`), а этот прогон их не вызывает. Браузерная оснастка ходит в настоящий маршрут и
  ядро, но хранилища в ней — словари (SQL — в интеграционном наборе).
- Калибровка порога 20 + 20 на живой модели (A-N6-013) — НЕ ИЗМЕРЕНО; A-N6-030 не закрыт, только огорожен (A-N6-035).
- Экран кабинета (кнопка отметки, баннер месяца) не прогнан прибором адаптивности и браузером; проверены только данные
  (`readBotCabinet`) и обработчик `verify` типами и unit-порядком входа.
- Отметка «проверено» не снимается при добавлении нового источника.
- Небраузерный клиент может записать себе «показ бейджа» и получать ответы без виджета — это граница механизма (ADR-004
  метрика), не денег: квота 5 scope действует.
- Строки `visitor_session` без событий не удаляются (только префикс /24 и origin, без текста).
- 152-ФЗ: текст ANSWERED-вопроса живёт в серверной истории до 30 минут — вопрос владельцу (A-N6-035 п.5).
- Независимое ревью — не проведено.

## Ответ по строкам reuse (ADR-013, ADR-014)

- ADR-014 «ключи квоты для анонимов» (N4 `keys.ts`) — **перенесено ранее** (quota-and-spend, `ceilings.ts`); здесь
  добавлено, что ключ сессии — id ПОДПИСАННОГО токена, а не id от клиента; конкурентный тест повторяет тест донора N4 на
  уровне маршрута (одна сессия, один /24, общий предел).
- ADR-013 «установка по Origin» (N1 `widget-install.ts`) — **адаптировано ранее** (фича 11, `packages/db/src/widget.ts`);
  здесь подключено событие `first_answer` из маршрута ответа; свой origin — не установка (SC-US-009-2).

## carry_over — закрыто

quota-and-spend: M1 (слоты `O_EXCL` + конкурентный тест процессами), M2 (страж по исходнику), L (правило в
`coding-style.md` + страж). rag-answer: история на сервере + тест подделки; A-N6-030 — known-gap тест + ворота A-N6-035;
маршрут берёт бота по public_key/Origin, проверенным сервером; квота `chargeAnswerQuota(widget)` ПОСЛЕ CheckOrigin;
`recordWidgetInstall(first_answer)` и `first_answer` — в маршруте; статусы ядра → HTTP. widget: `/w/v1/ask` по контракту
виджета (с правками A-N6-035), заглушка оснастки заменена настоящим маршрутом; L-1 (trailing dot, punycode).
**Не закрыто:** калибровка 20 + 20; решение владельца по ADR-003; строки `embed-contract.md` на стенде.

Status: completed
