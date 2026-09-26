# 05 — Квитанция: `widget-runtime-and-badge` (фича 11)

Дата: 2026-09-26 · Основа: `HEAD d638b8a` + незакоммиченное дерево (снимок sha256 `580e7e43513d2e5e…`, см.
07_code_report) · ADR: **ADR-004, ADR-005, ADR-013** · решения: A-N6-034 · карта донора: [`reuse-map.md`](reuse-map.md).

## Профиль и модели

Один исполнитель (маленькая по оркестрации, крупная по объёму фича — делегирование не применялось): Claude
Opus 5.5 (`claude-opus-5-5[1m]`, из метаданных сессии). OpenAI/Codex не вызывались; продуктовые модели — только
фейки (модель в этой фиче не зовётся вовсе). Независимого ревью (Sonnet 5) ещё НЕ было — `08_review.md` отсутствует.
Телеметрия p-replicator: счётчики токенов/времени агента — `null` (недоступны изнутри агента).

## Проверки и итоги (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| typecheck | `npm run typecheck` | код 0 (после правки типов в тестах) |
| lint | `npm run lint` | `Статические правила: ошибок нет` |
| build | `docker compose … run --rm --build test` (стадия build: `npm run build` — виджет → rag → db → queue → worker → web) | `[widget] widget.7f5dabb8185f5abc.js: raw=13.98 КБ, gzip=5.54 КБ, потолок 45.00 КБ`; `✓ Compiled successfully` |
| тесты в образе, настоящие Postgres 16 + pgvector 0.8.6 и Redis 7.4 (финальное дерево) | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | `Test Files  40 passed (40)` · `Tests  806 passed (806)` · `exit=0` — `tests/artifacts/widget-runtime-and-badge/image-run.txt` |
| первый прогон в образе (до исправления SQL) | то же | `Tests  1 failed \| 805 passed (806)` — `image-run-1-red.txt` (см. 07) |
| браузер на ЧУЖОМ origin, контейнер Playwright 1.60, Chromium + Firefox + WebKit | `bash scripts/check-responsive.sh --test tests/browser/widget-embed.test.ts` | `Tests  24 passed (24)` — `browser-run.txt`, скриншоты `browser/*.png` |
| мутации в образе (unit + integration) | `… run --rm test sh -c 'node scripts/test-db.mjs && node scripts/test-widget-mutations.mjs'` | код 0, см. ниже |
| мутации в браузере | `node scripts/test-widget-browser-mutations.mjs` | код 0, см. ниже |
| контракт встраивания | `node ../../.claude/hooks/check-embed-contract.cjs .` | **код 2** — `проверка на чужой странице НЕ ВЫПОЛНЕНА, причина: not-deployed` |
| уборка | `docker compose … down -v`; `docker images -f dangling=true` | контейнеров `n6-test` 0, томов стека нет, висячих образов 0; образ `n6-sufler-test:foundation` пересобран на месте. Диск: 95 %, 8,3 ГБ свободно |

### Почему `check-embed-contract` = 2 законно, а не 1

Код 2 значит «проверка НЕ ВЫПОЛНЕНА с названной причиной» из закрытого списка: `not-deployed`. Правило
`embeddable-widget.md` требует проверки по адресу, который ВЫДАЛО развёртывание; стенда нет, `POST /w/v1/ask`
(главный кросс-доменный POST) — фича 12. Оснастка этой фичи проверила все три класса на чужом origin
(`127.0.0.1:8099` против виджета `127.0.0.1:18411`, CSP = опубликованные директивы, враждебный CSS) — это записано
в `embed-contract.md` отдельной секцией, НЕ как строки контракта: объявить «ВЫПОЛНЕНА» по адресу, который я знал
заранее, было бы тем самым дефектом, который правило запрещает. Код 1 (доказанный дефект) не получен.

## Стражи, испытанные мутацией (дефект → красный; восстановлено → зелёный)

В образе (`tests/widget-handler.unit`, `badge-required`, `widget-source`, `widget-config.integration`; дословно):

```
cors-wildcard: дефект возвращён → 6 failed | 40 passed (46) (код 1); код восстановлен → 46 passed (46) (код 0)
origin-outside-allowlist: дефект возвращён → 5 failed | 41 passed (46) (код 1); код восстановлен → 46 passed (46) (код 0)
badge-normalized: дефект возвращён → 2 failed | 44 passed (46) (код 1); код восстановлен → 46 passed (46) (код 0)
inline-style: дефект возвращён → 1 failed | 45 passed (46) (код 1); код восстановлен → 46 passed (46) (код 0)
```

В браузере на чужом origin (`tests/browser/widget-embed.test.ts`, три движка; дословно):

```
badge-hidden-by-client: дефект возвращён → 3 failed | 21 passed (24) (код 1); код восстановлен → 24 passed (24) (код 0)
inline-style: дефект возвращён → 9 failed | 15 passed (24) (код 1); код восстановлен → 24 passed (24) (код 0)
origin-outside-allowlist: дефект возвращён → 3 failed | 21 passed (24) (код 1); код восстановлен → 24 passed (24) (код 0)
cors-wildcard: дефект возвращён → 3 failed | 21 passed (24) (код 1); код восстановлен → 24 passed (24) (код 0)
```

Логи: `tests/artifacts/widget-runtime-and-badge/{mutations-run.txt,browser-mutations/}`. Оговорка привязки: мутации
прогнаны ДО последней правки тестов (чтение заголовка ACAO через `headers.get` вместо итерации — ради typecheck);
финальное дерево прогнано целиком (806/806 и 24/24), мутации на нём не повторялись.

## Что доказано и чем

- **перекрёстный-запрос:** ровно один ACAO = origin хозяина, `Vary: Origin`, без `*` и Allow-Credentials (unit +
  integration на Postgres + браузер); origin вне списка / поддомен / другая схема — 403 без ACAO и без строки
  установки; OPTIONS 204 только для origin из списка.
- **протечка-стилей:** в трёх движках пузырь 56×56 в 16 px от угла, окно 360 px, шрифт 16/15 px вопреки
  `* {font-size:30px !important}`; стили хозяина не изменились; в документ хозяина не добавлено `<style>/<link>`.
- **политика-безопасности:** 0 нарушений CSP и 0 ошибок консоли под CSP без `unsafe-inline`; мутация style-атрибута
  краснеет и статический страж, и браузер.
- **Бейдж fail-closed (ADR-004):** 11 форм плана → бейдж; SC-US-011-2 на настоящей БД (оператор меняет план →
  следующий config); параметр клиента бейдж не снимает; удаление/`display:none`/чужой лист в корне — бейдж
  восстановлен с прежней ссылкой; nobadge — бейджа и показа нет.
- **NFR-SEC-002 (донор xss):** разметка ответа и заголовка источника — текст, `javascript:` отброшен.
- **Установки:** first_config одна строка; свой origin — не установка; 8 одновременных first_answer → ровно одно
  событие `widget_install`; метрика считает только установки с ответом.
- **Потолок бандла:** 5,54 КБ из 45; файл больше потолка — `ok: false` (страж умеет падать).

## Что НЕ доказано

- Проверка на стенде по ВЫДАННОМУ адресу (not-deployed) и с настоящим `/w/v1/ask` — фича 12.
- Маршрут `GET /w/[file]` в собранном Next проверен только модулем обработчика; живой `next start` не поднимался
  (стек целиком не поднимался) — старый хэш → текущий бандл подтверждён тестом обработчика, не запросом к образу.
- Скрытие узла-хозяина стилями хозяина снаружи корня не ловится (граница механизма, условие оферты, ADR-004).
- Показы бейджа можно раздуть сменой `visitor_session` (метрика, не деньги) — A-N6-034 (5).
- Safari < 16.4 виджета не видит (нет constructable stylesheets) — A-N6-034 (7).
- Первое открытие окна ≤ 1 с (NFR-PERF-003) не измерялось отдельно; окно строится синхронно по клику, конфигурация
  загружена заранее.
- Независимое ревью — не проведено.

## Ответ по строкам reuse (ADR-013)

Все пять строк roadmap + тесты донора: [`reuse-map.md`](reuse-map.md) (загрузчик/Shadow DOM — адаптировано; бейдж —
перенесено с исправлением потери ссылки; сборка — адаптировано 45 КБ; конфигурация/установка — адаптировано +
allowlist, first_answer; тариф — адаптировано три плана). carry_over: FR-LOOK-012 в Specification — отмечено;
манифест бандла и старые хэши — решено (A-N6-034 (2)); `readContact` в конфигурации — да.

Status: completed
