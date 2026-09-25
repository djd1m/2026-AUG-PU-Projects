# U3-skills — набор навыков и инструментов для mobile-friendly / responsive UI «КлипМейкер»

RUN_ID=uiux-20260925T081903Z · WORK_UNIT_ID=U3-skills · дата проверки 2026-09-25
Код проекта не менялся. Внешние факты сняты WebFetch 2026-09-25 (URL у каждого).

## 0. Исходное состояние стека (проверено чтением файлов)

- `projects/05-podcast-clips-opus/apps/web/package.json`: next 15.5.25, react ^19.1.0, **ни Tailwind, ни PostCSS, ни UI-кита, ни тестового браузера**. Корневой devDeps: typescript, vitest ^3.2.4 — и всё.
- Стили: один файл `apps/web/src/app/globals.css`, 90 строк; CSS-модулей 0; `className=` 50 вхождений; `style={{` 6.
- Токены уже есть на `:root` (`--ink --muted --paper --line --green`), шрифт system-ui, `:focus-visible` задан, кнопки/поля `min-height:46px` (≥ 44px тач-цели — хорошо).
- Адаптивность сейчас: 2 медиазапроса (`max-width:900px`, `max-width:600px`), `clamp()` только для h1 (`clamp(30px,4vw,54px)`, `clamp(36px,4.5vw,62px)`); h2/h3/отступы — фиксированные px; `.landing` — `grid-template-columns:1.3fr 1fr; gap:80px; min-height:calc(100vh - 84px)` (`100vh` на мобильных даёт прыжок из-за адресной строки — стоит `100dvh`; это суждение, не измерено).
- `layout.tsx:4` экспортирует `viewport = { width:'device-width', initialScale:1 }` — корректно.
- Вывод: проект уже на «собственном CSS с токенами»; самая дешёвая дорога — развить это, а не менять парадигму.

## 1. Инвентаризация того, что уже есть на машине

| Элемент | Где | Что делает | Польза для responsive | Ограничения |
|---|---|---|---|---|
| `frontend-design` (плагин, официальный) | `~/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md` (55 строк, прочитан целиком) | Инструкция «дизайн-лида»: сначала план токенов (4–6 hex, 2+ шрифта, ASCII-вайрфрейм, «подпись»), самокритика против трёх AI-клише, осторожность со специфичностью CSS, правила текстов UI | **Слабая, но есть**: единственная строка — «Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected… taking screenshots if your environment supports it» | Про эстетику и копирайт, не про адаптивную методику: нет брейкпоинтов, fluid-шкал, тач-целей, проверок. Толкает к «рискованной» эстетике и нестандартным шрифтам — для рабочего инструмента (загрузка/клипы) это частично вредно |
| `frontend-design` (локальная копия в репо) | `.claude/skills/frontend-design/SKILL.md` (45 строк, старшая версия; trust_tier 0 «Advisory») | То же, в старой редакции: «BOLD aesthetic», запрет Inter/Roboto/**system fonts** | **Ноль** слов про responsive/mobile. Прямо противоречит текущему `globals.css` (system-ui) | Две версии с одним `name:` — какая загрузится, зависит от приоритета; две разные политики с одним именем = расхождение молча (по `port-conflicts-local.md`) |
| `browser` (claude-flow) | `.claude/skills/browser/SKILL.md` | Обёртка над CLI `agent-browser`: open/snapshot/click/screenshot | Могла бы снимать скриншоты на мобильной ширине | **CLI `agent-browser` на машине не найден** (`which agent-browser` пусто) — навык сейчас неисполним |
| `claude-in-chrome` | встроенный навык сессии | Управляет Chrome пользователя через расширение | Скриншоты/консоль на реальном браузере | Требует Chrome с расширением; на VPS системного Chrome нет (`which google-chrome chromium` пусто). Для агентов на этой машине — **не проверено/вероятно недоступно** |
| `clone-website` (@dzhechkov/skills-website-cloner) | не в этом репо; есть в `/home/dz-projects-2026/dz-harness-hub-lhe/.claude/skills/clone-website/SKILL.md` (483 строки) | Пиксельный клон чужого сайта в Next.js | Содержит полезную **процедуру responsive-свипа**: снимки на 1440 / 768 / 390, запись брейкпоинтов, QA-сравнение на 390px | Требует **Next.js + shadcn + Tailwind** скаффолд и browser-MCP; назначение — копировать чужое. Для нас годится только как донор чек-листа ширин |
| `cc-toolkit-generator-enhanced` | `.claude/skills/cc-toolkit-generator-enhanced/` | Генератор тулкита | Единственное упоминание — строка «Mobile / responsive behavior» в шаблоне `references/templates/automation-commands.md:545` | Правил UI/responsive фактически нет |
| проектные навыки 05 | `projects/05-podcast-clips-opus/.claude/skills/{coding-standards,project-context,security-patterns}` | Бэкенд-образцы | grep `responsive|mobile|breakpoint|viewport|css` — **0 совпадений** | Про UI ничего |
| `artifact-design` | встроенный навык сессии | Контракт для claude.ai Artifacts (токены на `:root`, тёмная тема, 16px гаттер, без горизонтального скролла на телефоне) | Идеи правильные (гаттер, no h-scroll), но область — артефакты, не продуктовое приложение | Не предназначен для кода проекта |
| Playwright 1.60.0 + chromium-1223/1234 | `/home/dz-projects-2026/genai-pulse-discovery/node_modules/playwright`, `~/.cache/ms-playwright/` | Браузерный движок | **Главный исполнимый ресурс на машине**: эмуляция устройств, скриншоты | В репо не установлен; рабочий способ подключения записан в памяти `playwright-and-tmux-on-this-machine.md` |
| axe-core | лежит в чужих `node_modules` (например `/home/dz-projects-2026/cipr-ai-advisor/node_modules/.pnpm/axe-core@4.11.4`) | Движок проверок доступности | Можно инжектировать в страницу через Playwright | В проекте нет |

Итог инвентаризации: **навыка-методики для адаптивной вёрстки на машине нет**; есть эстетический навык (две конфликтующие версии) и есть рабочий браузер (Playwright), но не подключённый к проекту.

## 2. Внешние кандидаты (проверено 2026-09-25)

| Кандидат | Тип | Факты (источник) | Годится нам? |
|---|---|---|---|
| Anthropic `frontend-design` | **skill** (инструкция) | Плагин в `anthropics/claude-code/plugins/frontend-design`; README про «bold aesthetic choices», про responsive в README ничего (https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design). Текущая SKILL.md упоминает responsive одной строкой (локальный файл, см. §1) | Уже установлен. Полезен для эстетики, не для адаптивности |
| fluid-functionalism (mickadesign) | **registry компонентов** (библиотека через shadcn CLI) | Требует React 19, Next 15, **Tailwind v4, Framer Motion, Radix/Base UI**, ставится `npx shadcn@latest add @fluid/...`, MIT; есть responsive sidebar с мобильным drawer (https://github.com/mickadesign/fluid-functionalism) | Под наш стек без Tailwind — **нет** без миграции; глубже разбирает другой агент |
| shadcn skills / MCP | **skill** (`pnpm dlx skills add shadcn/ui`) + **MCP** | Skill активируется при наличии `components.json` (https://ui.shadcn.com/docs/skills); MCP требует `components.json` и shadcn CLI (https://ui.shadcn.com/docs/mcp). Прямо Tailwind как обязательное не названо, но компоненты shadcn написаны на Tailwind-классах (общеизвестно; в прочитанных страницах явно — не проверено) | Нет смысла без перехода на shadcn+Tailwind |
| Tailwind v4 | **библиотека/сборка** | Установка: `tailwindcss @tailwindcss/postcss postcss` + `postcss.config.mjs` + `@import "tailwindcss"` (https://tailwindcss.com/docs/installation/framework-guides/nextjs) | Цена миграции: 3 зависимости + конфиг + переписать ~90 строк CSS и 50 `className` (оценка по grep, трудозатраты — не измерено). Выигрыш — доступ к экосистеме shadcn/fluid. Для responsive как такового Tailwind **ничего не даёт сверх CSS** (те же media/container queries). Рекомендация: не вводить, если не решено брать shadcn-компоненты |
| Utopia (utopia.fyi) | **методика + генератор** (выход — CSS) | «There's no program or dependency to install»; калькуляторы Type/Space/Grid/Clamp выдают custom properties с `clamp()`, интерполяция между мин. и макс. вьюпортом (https://utopia.fyi/). Лицензия на странице не указана | **Да**: ноль зависимостей, ложится на существующие `:root`-токены, убирает фиксированные px у h2/h3/отступов |
| Open Props | **библиотека токенов** (CSS) | 500+ custom properties, 4.0 kB brotli, без зависимостей, MIT v1.7.23; есть `--size-fluid-1..10` на `clamp()`; именованные media — только через PostCSS-плагин (https://open-props.style/) | Можно, но дублирует то, что Utopia даёт генерацией без зависимости; +1 пакет или CDN-импорт (CDN противоречит CSP-дисциплине). Вторичен |
| Every Layout | **методика** (книга, $69; есть бесплатные вводные главы; к книге идут custom elements) | 12 примитивов: Stack, Box, Center, Cluster, Sidebar, Switcher, Cover, Grid, Frame, Reel, Imposter, Icon, Container; принцип — алгоритмическая раскладка без «магических» брейкпоинтов (https://every-layout.dev/) | **Да как методика** (примитивы пишутся на чистом CSS за несколько строк каждый); веб-компоненты не нужны |
| CUBE CSS | **методика** | Composition / Utility / Block / Exception; опора на каскад, без библиотек (https://cube.fyi/) | Совместима с текущим `globals.css`; даёт порядок, куда класть примитивы Every Layout и токены Utopia |
| Playwright device emulation | **инструмент проверки** | `devices['iPhone 13']`, `viewport`, `isMobile`, `hasTouch`, colorScheme (https://playwright.dev/docs/emulation) | **Да**: уже на машине (1.60.0) |
| `toHaveScreenshot` (визуальная регрессия Playwright) | **инструмент проверки** | pixelmatch, `maxDiffPixels`; оговорка: рендер зависит от ОС, версии, headless, железа — базовые снимки только в одинаковом окружении (https://playwright.dev/docs/test-snapshots) | Условно: недетерминированность между машинами; годится только если снимки делаются в одном Docker-образе |
| BackstopJS | **инструмент проверки** (визуальная регрессия) | Puppeteer по умолчанию или Playwright, массив viewports, MIT (https://github.com/garris/BackstopJS); дата последнего релиза на странице не видна — не проверено | Избыточен при наличии Playwright |
| axe-core / `@axe-core/playwright` | **инструмент проверки** (a11y) | `new AxeBuilder({page}).withTags([...]).analyze()`; сама документация: автоматика ловит только часть проблем, остальное — ручная проверка (https://playwright.dev/docs/accessibility-testing) | Да, детерминированный слой 1 для части WCAG |
| Lighthouse CI | **инструмент проверки** | `@lhci/cli@0.15.x`, Node, ассерты по бюджетам, Apache-2.0 (https://github.com/GoogleChrome/lighthouse-ci) | Шумный для perf (нужны многократные прогоны — там же); тяжелее, чем нужно; вторичен |

## 3. Рекомендация: минимальный набор (4 элемента)

Принцип: **генерацию направляет методика, приёмку делает скрипт**. Ни один элемент не добавляет рантайм-зависимостей в `apps/web`.

### 1) Проектный навык `responsive-ui` (методика, слой 2) — НОВЫЙ, написать самим
- **Роль:** методика для агента-генератора. Содержание (≈1 страница): mobile-first; токены fluid-типографики и отступов из Utopia (сгенерировать один раз, вписать в `:root` `globals.css`); 4–5 примитивов Every Layout на чистом CSS (Stack, Cluster, Sidebar, Switcher, Center) в слое Composition по CUBE; container queries для карточек клипов; правила: тач-цель ≥ 44px, `100dvh` вместо `100vh`, `min()`/`clamp()` вместо фиксированных px, никаких горизонтальных скроллов на 320px, `prefers-reduced-motion`; список контрольных ширин 320 / 390 / 768 / 1024 / 1440 (ширины 390/768/1440 взяты из `clone-website`).
- **Цена:** ~1 час на навык + ~1 час на перевод `globals.css` на fluid-токены (оценка, не измерено). Ноль зависимостей.
- **Риск:** навык — слой 2, работает, пока его читают; без п. 3 деградирует в «пожелание». Utopia и CUBE — методики без закрытой лицензии на код-генератор (лицензия Utopia не указана — не проверено); выход — просто CSS-значения.

### 2) `frontend-design` (официальная версия плагина) — генерация, эстетика; уже установлен
- **Роль:** визуальный план (палитра, шрифты, «подпись») и тексты интерфейса; его строка «responsive down to mobile… screenshots» — дополнение к п. 1.
- **Цена:** 0. Но **нужно убрать конфликт имён**: локальная `.claude/skills/frontend-design/SKILL.md` (старая редакция, запрещает system fonts, ни слова про mobile) против плагинной. Оставить одну — плагинную; в `responsive-ui` явно сказать, что у рабочего инструмента приоритет — читаемость и скорость, а не «эстетический риск».
- **Риск:** толкает к нестандартным веб-шрифтам (вес страницы, FOUT на мобильной сети). Ограничить в п. 1: максимум один самохостинговый display-шрифт через `next/font`.

### 3) Скрипт проверки адаптивности на Playwright — проверка, **слой 1**, детерминированный
- **Роль:** `scripts/check-responsive.mjs` (не в зависимостях проекта; Playwright берётся с машины способом из памяти `playwright-and-tmux-on-this-machine.md`, либо ставится как devDependency в отдельный воркспейс `tests/e2e`). Для каждого маршрута × ширины 320/390/768/1440 с `isMobile/hasTouch` проверяет **числовые инварианты, а не картинки**: `document.documentElement.scrollWidth <= innerWidth` (нет горизонтального скролла); у каждого `button, a, input` `getBoundingClientRect()` ≥ 44×44; вычисленный `font-size` текста ≥ 16px на мобильной ширине у полей ввода (иначе iOS зумит — общеизвестно, не проверено в этой сессии); ни один элемент не выходит за вьюпорт. Три кода возврата по `guard-must-be-able-to-fail.md`: `0` проверено, `1` нарушение с маршрутом/шириной/селектором, `2` проверка не выполнена (нет браузера, стенд не отвечает). Проверять по адресу, который выдал стенд, а не по localhost (`deployment-seams.md`).
- **Цена:** ~2–3 часа (оценка). Рантайм-зависимостей 0.
- **Риск:** страж надо испытать внедрённым дефектом (например временно `min-width:1200px` у `.container` → ожидать `1`). Скриншоты сохранять как **улики для человека**, а не как ассерт — pixel-diff недетерминирован между машинами (https://playwright.dev/docs/test-snapshots).

### 4) axe-core в том же скрипте — проверка доступности, слой 1 (частично)
- **Роль:** на тех же страницах и ширинах `AxeBuilder.withTags(['wcag2a','wcag2aa'])`, провал — код `1` с id правил. Покрывает подписи полей, роли, контраст (частично).
- **Цена:** +1 пакет (`@axe-core/playwright`) только в тестовом скрипте; ~30 минут.
- **Риск:** документация Playwright прямо говорит, что автоматика ловит лишь часть проблем; остальное — ручная проверка/ревью. Не выдавать `0` за «доступно».

### Что сознательно НЕ брать
- **Tailwind + shadcn skills/MCP + fluid-functionalism** — все три требуют сменить парадигму стилей (Tailwind v4: 3 пакета + PostCSS + переписывание ~90 строк CSS и 50 `className`); для адаптивности сами по себе ничего не добавляют сверх CSS. Оправдано только если владелец решит брать готовые компоненты — отдельное решение (ADR).
- **Open Props** — дублирует Utopia, но добавляет пакет или CDN.
- **Lighthouse CI, BackstopJS** — тяжелее и шумнее, чем Playwright-скрипт с числовыми инвариантами; Lighthouse можно запускать вручную перед релизом.
- **`browser` (agent-browser), `claude-in-chrome`** — на этой машине неисполнимы (нет CLI / нет Chrome); Playwright их заменяет.

## Не проверено
- Лицензия Utopia; дата последнего релиза BackstopJS; обязательность Tailwind для shadcn skill (в прочитанных страницах явно не сказано).
- Доступность `claude-in-chrome` на этой машине (вывод по отсутствию Chrome, не по запуску).
- Все оценки времени — оценки, не измерения.
- Поведение текущей вёрстки на 320px не измерялось (скрипт п. 3 ещё не существует).

Status: completed
