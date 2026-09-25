# U1-fluid — разбор mickadesign/fluid-functionalism

RUN_ID=uiux-20260925T081903Z · WORK_UNIT_ID=U1-fluid · дата проверки 2026-09-25
Источник: `git clone --depth 1 https://github.com/mickadesign/fluid-functionalism` → `scratchpad/uiux/ff` (HEAD `b3587bd`, 2026-09-14), GitHub API `api.github.com/repos/mickadesign/fluid-functionalism`.

## 1. Что это

- **Реестр компонентов shadcn/ui (React + Tailwind), а не скилл Claude Code и не CSS-библиотека.** README: «A shadcn/ui registry of components, the systems they share, and blocks that compose them» (`ff/README.md`). Под «fluid» имеется в виду плавная анимация на пружинах и «fluid hover» — подсветка, скользящая к ближайшему под курсором пункту списка, а НЕ fluid-типографика (`ff/README.md`, раздел Systems).
- Установка — копированием исходников в свой проект через shadcn CLI: `npx shadcn@latest registry add @fluid`, `npx shadcn@latest add @fluid/button` или по URL `https://www.fluidfunctionalism.com/r/button.json` (`ff/README.md`, Install). Компоненты с примитивами есть в двух вариантах: Radix (по умолчанию) и Base UI (`@fluid/base/...`).
- Состав: 26 компонентов (Button, Dialog, Select, Tabs, Sidebar, Combobox, Slider, Tooltip, ChatMessage и др.), 5 «систем» (`use-fluid-hover`, `springs`, `scroll-area`, `size-context`, `elevated`), 3 блока (App Sidebar, Settings Dialog, Queued stack) — таблицы в `ff/README.md`. Исходники: `ff/registry/{default,radix,base,blocks}/`, сборка реестра в `ff/public/r/*.json`. Сам репозиторий — ещё и сайт документации на Next.js (`ff/app/`). 443 файла.
- Есть текстовые руководства: `motion-guidelines.md` (313 строк), `component-documentation-guidelines.md`, `preset-guidelines.md`, `tone-of-voice.md`. Навыка/SKILL.md для Claude нет; «AI-агентам» предлагается кнопка «Copy prompt» на сайте (`ff/README.md`, «With an AI coding agent»). `metadata-templates/AGENTS.md` — про шаблоны OG-картинок, к UI не относится.
- **Лицензия: MIT**, «Copyright (c) 2026 Micka Touillaud» (`ff/LICENSE`; SPDX `MIT` по GitHub API). Для коммерческого продукта пригодна; обязательство — сохранить уведомление об авторском праве в копиях.
- **Активность:** создан 2026-02-13, последний push 2026-09-22, последний коммит в main 2026-09-15 (GitHub API); 918 звёзд, 43 форка, 4 открытых issue (GitHub API на 2026-09-25). `package.json` версия `0.1.0`, `private: true` — npm-пакета нет. Есть CI (`ff/.github/workflows/ci.yml`) и 17 тестов в `ff/tests/`, в основном на согласованность реестра и пресеты.

## 2. Что даёт для mobile/responsive (проверено grep по `registry/`, `hooks/`, `app/globals.css`)

| Техника | Есть? | Факт |
|---|---|---|
| Fluid typography/spacing через `clamp()` | **Нет** | 0 вхождений `clamp(` |
| Container queries | Почти нет | 1 место: `registry/blocks/sidebar-workspace-header.tsx:109` (`@container` Tailwind) |
| `env(safe-area-inset-*)` | **Нет** | 0 вхождений |
| Reduced motion | **Да, продумано** | `useReducedMotion()` в 10 файлах; `motion-guidelines.md:223+`: «fewer and gentler, not none», `<MotionConfig reducedMotion="user">` в корне |
| Определение сенсорного ввода | Да | `registry/default/hooks/use-touch-primary.tsx` — `matchMedia("(pointer: coarse)")`; скроллбар «with native scroll on touch» (README) |
| Мобильные единицы вьюпорта | Да | `min-h-svh`/`h-svh` в `sidebar-core.tsx`, `76dvh` в `command-menu.tsx:1529` |
| Мобильная навигация | Да | Sidebar превращается в drawer на мобиле (`registry/radix/mobile-drawer.tsx`, Radix Dialog + framer-motion) |
| Размер касаемой зоны | **Слабо** | Высота контролов 36px по умолчанию и 28px компактная (`registry/default/lib/size-context.tsx:48-62`) — ниже 44px (рекомендация Apple HIG / WCAG 2.5.5 AAA); выше минимума WCAG 2.5.8 AA (24px) |
| Брейкпоинты | Обычные Tailwind | 47 использований `sm:/md:/lg:` в `registry/` |

Вывод по разделу: сильная сторона библиотеки — **качество анимации и интерактивных состояний** (пружины, hover, вес шрифта без сдвига вёрстки, reduced motion), а не адаптивность. Главный её приём «fluid hover» — это hover, то есть на телефоне без курсора он не работает по определению. Fluid-типографики, safe-area и касаемых зон ≥44px в ней нет.

## 3. Совместимость с нашим стеком и цена внедрения

Наш стек (`projects/05-podcast-clips-opus/apps/web/package.json`): `next 15.5.25`, `react ^19.1.0`, tRPC, zod; **нет** Tailwind, Radix, Base UI, framer-motion/motion, clsx, tailwind-merge, class-variance-authority, shadcn. Стили — собственный `apps/web/src/app/globals.css`, 90 строк. В `apps/web` нет `components.json`, `postcss.config.*`, упоминаний tailwind.

Библиотека требует (`ff/package.json`, `ff/components.json`, `ff/app/globals.css`): Tailwind v4 (`@import "tailwindcss"`, `@tailwindcss/postcss`), shadcn-конфигурацию с алиасами `@/components`, `@/lib/utils`, `@/hooks`; Radix или Base UI; `framer-motion`/`motion`; `clsx`, `tailwind-merge`, `class-variance-authority`; иконки (lucide и др.); шрифт Inter Variable с осью `opsz`. Её `globals.css` — 848 строк токенов (`light-dark()`, 8 уровней поверхности).

Совпадает: Next 15, React 19, App Router (`rsc: true`) — по версиям конфликта нет.

Цена «брать целиком»: ввести Tailwind v4 + PostCSS, shadcn-конфиг, 3–5 рантайм-зависимостей на компонент (Radix-пакеты, framer-motion ≈ десятки КБ в клиентском бандле), 848 строк чужих токенов поверх наших 90, переписать существующую разметку с наших классов на Tailwind-утилиты. Все компоненты — `"use client"`. Для 05 это смена системы стилей, то есть тир L по `complexity-router.md` (новые зависимости, затрагивает весь UI), а мобильной отдачи прямо — мало (см. §2).

Точечный вариант: MIT позволяет вручную перенести одну идею/хук (например, `use-touch-primary`, логику reduced motion) без Tailwind — переписав классы на наш CSS и сохранив уведомление MIT.

## Риски

- **Зрелость:** v0.1.0, 7 месяцев, один автор (copyright одного лица), нет npm-пакета и semver — обновления приходят только повторным `shadcn add --overwrite`, которое перезаписывает наши правки (README: «pass `--overwrite` to replace them»).
- **Привязка к стеку:** жёсткая к Tailwind v4 + shadcn + Radix/Base UI + framer-motion. Без Tailwind компоненты не работают как есть.
- **Лицензия:** MIT — коммерческое использование разрешено, риска нет (`ff/LICENSE`).
- **Несоответствие цели:** запрос был «mobile-friendly, very responsive»; библиотека оптимизирована под десктопный hover и плотный интерфейс (36/28px). Не проверено: как компоненты реально ведут себя на телефоне — в браузере не открывал, сайт fluidfunctionalism.com не проверял.

## 4. Вердикт: брать как принципы, код и зависимости не брать

Обоснование:
1. По стеку несовместимо без введения Tailwind v4 + shadcn + Radix + framer-motion — это перестройка UI, непропорциональная задаче.
2. По цели попадание частичное: «fluid» здесь про анимацию и hover, а не про адаптивную вёрстку. Fluid-типографики через `clamp()`, safe-area и касаемых зон ≥44px нет — их придётся делать самим в любом случае.
3. Что стоит перенести как принципы в наш `globals.css` / компоненты:
   - reduced motion «меньше и мягче, а не ноль»: убираем transform/положение/масштаб, оставляем прозрачность и цвет (`motion-guidelines.md:223-240`);
   - определять сенсорный ввод через `(pointer: coarse)` и не полагаться на hover на таких устройствах (`use-touch-primary.tsx`);
   - `svh`/`dvh` вместо `vh` для полноэкранных панелей на мобиле (`sidebar-core.tsx`, `command-menu.tsx`);
   - боковая навигация → drawer на узком экране;
   - смена веса шрифта без сдвига вёрстки (Inter `wght`+`opsz`) — только если будем использовать Inter.
   Для самой адаптивности (clamp-типографика, container queries, safe-area, 44px) нужен другой источник.

Status: completed
