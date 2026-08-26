# @proofwall/widget

Встраиваемый виджет «Wall of Love» — vanilla TypeScript, без React, рендерится в Shadow DOM.
Источники истины: [`docs/Pseudocode.md`](../../docs/Pseudocode.md) §3/§5,
[`docs/Architecture.md`](../../docs/Architecture.md) §4, [`docs/ADR.md`](../../docs/ADR.md)
ADR-001/ADR-002, [`docs/Specification.md`](../../docs/Specification.md) FR-006/FR-GROWTH-003.

## Как встроить

Один тег на странице владельца, в любом месте разметки:

```html
<script src="https://cdn.proofwall.app/widget.<hash>.js" data-slug="acme" async></script>
```

- `data-slug` — обязателен, слаг проекта (тот же, что в `proofwall.app/f/<slug>` и `/w/<slug>`).
  Без него виджет тихо откажется рендериться и напишет предупреждение в консоль.
- `<hash>` в имени файла — content-hash, проставляется сборкой (`npm run build`, ADR-007). Не
  редактировать вручную: имя меняется при каждой новой версии, чтобы можно было отдавать файл с
  агрессивным `Cache-Control: immutable`, не боясь раздать устаревшую версию после деплоя.
- Опционально `data-api-base="https://app.example.com"` — переопределяет origin API-запросов,
  если статика виджета и API однажды разъедутся по разным доменам (см. `[GAP]` в `src/api.ts`);
  на этой неделе не нужен, оба живут на одном origin за Caddy (ADR-007).
- Атрибут `async` — обязателен по контракту (FR-006 AC): виджет не блокирует `window.onload`
  хоста.

Виджет сам находит свой `<script>`-тег, вставляет после него контейнер и рендерит внутрь
Shadow DOM — никакой дополнительной вёрстки на странице владельца не требуется.

## Что делает

1. Читает `data-slug` из собственного тега.
2. Делает **один** сетевой запрос — `GET /api/widget/config?slug=...&domain=...` с таймаутом
   300 мс (Architecture §4.2). Сервер в рамках этого же запроса резолвит тариф, фиксирует
   установку на домене (`widget_installed`/`invite_shown`, если домен новый) и пишет
   `badge_impression` — виджет не дублирует это отдельными вызовами.
3. Рендерит одобренные отзывы внутри изолированного Shadow DOM (`textContent`, никогда
   `innerHTML` — защита от stored-XSS, FR-006 @security).
4. Рендерит badge «Powered by Proofwall», если сервер прислал `badge_required: true`
   (`free`-тариф) — виджет не решает это сам, он только исполняет решение сервера (ADR-002).
5. Клик по badge отправляет `badge_click` через `navigator.sendBeacon` на
   `/api/widget/badge-click`, не блокируя переход по ссылке.
6. Следит за самим узлом badge (`MutationObserver` + `setInterval` раз в 2 сек) и восстанавливает
   его видимость при точечной попытке скрыть — см. «Чего не делает» ниже.
7. Если проект не найден/деактивирован или конфигурация не пришла вовремя — рендерит пустое
   место без ошибок в консоли хоста (`renderEmptyPlaceholder`).

## Чего не делает (осознанные границы, не баги)

- **Не решает, показывать ли badge.** Это единственное решение сервера (ADR-002,
  FR-GROWTH-003) — виджет физически не получает поле `tier`, только готовый
  `badge_required: boolean`. Подделать это на клиенте нельзя, потому что решение принимается не
  в клиенте.
- **Не восстанавливает badge, если скрыт весь контейнер целиком** (например,
  `display:none` на элементе-обёртке снаружи Shadow DOM). Это архитектурная граница ADR-001 —
  виджет не имеет доступа к DOM хоста выше собственного shadow-root и не пытается туда
  «дотянуться». Известный остаточный риск, закрывается условиями оферты, а не кодом (ADR-002).
  Подробный разбор — комментарий в начале `src/badge.ts`.
- **Не стилизуется под бренд хоста.** Shadow DOM изолирует двусторонне; проброс `font-family`/
  цветов хоста внутрь — не в scope MVP-недели (ADR-001 «Последствия»).
- **Не переписывает и не улучшает текст отзыва.** Рендерит побайтово то, что вернул сервер
  (FTC-граница, ADR-005, `.claude/rules/security.md` §5).
- **Не грузит React/фреймворк-рантайм.** Vanilla TypeScript, один файл, бюджет ≤ 30 KB gzip
  (FR-NFR-PERF-001) — импорт чего-либо из `apps/web`/`packages/ui` в этот пакет запрещён
  (`.claude/rules/coding-style.md` §1).

## Разработка

```bash
npm install            # из корня монорепо (npm workspaces)
npm run build --workspace apps/widget    # esbuild -> dist/widget.<hash>.js + dist/manifest.json
npm run test --workspace apps/widget     # vitest (jsdom)
npm run typecheck --workspace apps/widget
```

`npm run build` сам проверяет бюджет размера (`scripts/check-bundle-size.mjs`, gzip -9) и
проваливает сборку при превышении 30 KB — см. `.claude/rules/coding-style.md` §3 и
`docs/Refinement.md` §4. `dist/manifest.json` содержит имя финального файла и точные размеры —
источник для деплоя/раздачи через Caddy (кто именно читает манифест на этой неделе — решение
инфраструктурного слоя, вне этого пакета).

## Структура

```
src/
  index.ts    — точка входа, widgetBootstrap
  render.ts   — DOM внутри Shadow Root, textContent-only рендер отзывов
  badge.ts    — badge + anti-tamper (startBadgeIntegrityWatch/checkAndRestore)
  api.ts      — GET /api/widget/config, sendBeacon для badge_click
  styles.ts   — стили, инжектируемые внутрь Shadow DOM
  types.ts    — локальные типы контракта конфигурации (см. [GAP] внутри файла)
tests/
  xss.test.ts             — вредоносная разметка отображается как текст, не исполняется
  badge-integrity.test.ts — восстановление прямого скрытия badge; НЕ-восстановление при
                            скрытии родителя (негативный тест, без ложных срабатываний/цикла)
  isolation.test.ts       — структурная изоляция Shadow DOM от стилей/скриптов хоста
scripts/
  build.mjs               — esbuild, content-hash в имени файла, гейт размера
  check-bundle-size.mjs   — gzip -9 + сравнение с бюджетом 30 KB
```

## [GAP] — не выдумано, зафиксировано как открытое

- **Топология доменов CDN/API.** ADR-007 иллюстративно упоминает `cdn.proofwall.app` отдельно от
  API, но Architecture.md не описывает это как отдельную инфраструктуру этой недели. По
  умолчанию виджет берёт API-origin из собственного `src` (`src/api.ts`); точка расширения —
  `data-api-base`.
- **Форма `branding`** в ответе `/api/widget/config` (Architecture §4.2 упоминает поле по имени,
  без схемы) — в `types.ts` типизировано как `Record<string, unknown>`, не используется в рендере
  на этой неделе.
- **Канонический пакет типов.** `src/types.ts` — временная локальная копия контракта; когда
  `packages/shared-types` будет готов (собирается параллельно), эти типы нужно заменить импортом
  оттуда, не поддерживать два источника истины (см. комментарий в файле).
- **Серверная наблюдаемость anti-tamper-событий.** `badge_hide_attempt_blocked` и
  `badge_zero_size_detected_possible_ancestor_hide` логируются только в консоль клиента — таблица
  событий аналитики в Architecture §6 не описывает для них серверный эндпоинт; отправлять их
  «в никуда» на не задокументированный путь не стали.
- **ToS-текст о запрете скрытия виджета** — продуктовый текст, не техническая задача этого пакета
  (ADR-002 «Последствия»).
