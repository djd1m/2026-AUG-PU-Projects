# Отчёт исполнителя: фича 26 `clip-card`

Исполнитель: Opus 5.5 (OWN-017, модели OpenAI/Codex не вызывались). Код выполняет `00_brief.md` вместе с
9 обязательными правками из `01_validate.md`. На стенд не выкачено, коммита нет, `.env`, compose,
`package.json`/lockfile, tRPC, БД, воркеры, `/c/`, `/g/`, события `download`/`link_copy` и `guest.create` не
тронуты.

## Что сделано (файл:строка)

| Пункт | Где | Что |
|---|---|---|
| Правка 1: чистая функция | `apps/web/src/lib/guest-contract.ts:7-13` | `addGuestPreselect(selected, clipId, selectable)`: отмечает клип, дубль не добавляет, fail-closed — клип, которого форма не предлагает (не `available`, неизвестный id), не отмечается |
| Правка 2 и 6: `preselect` + фокус + reduced motion | `apps/web/src/app/clips/GuestPacks.tsx:7-30,51,55` | тип `GuestPreselect {clip_id, nonce}`; `revealGuestForm()` проверяет `matchMedia('(prefers-reduced-motion: reduce)')` в коде (`auto` вместо `smooth`), фокус в «Имя гостя» по `ref` с `preventScroll`; эффект срабатывает один раз на `nonce` (опрос каждые 5 с меняет `clips`, поэтому без проверки `nonce` прокрутка повторялась бы) |
| Подъём состояния | `apps/web/src/app/videos/[videoId]/VideoDetail.tsx:42-43,74,77` | `guestPreselect`; `onSendToGuest` передаётся только при `consentHash`, иначе `undefined` → кнопка «Гостю» недоступна |
| §1 Плашка оценки | `ClipCard.tsx:35`, `globals.css:151` | `<span class="score-badge" aria-hidden="true">` в левом верхнем углу превью, `pointer-events:none`; только при наличии оценки. Доступный текст «Оценка 85 из 99» — `ClipCard.tsx:49` |
| §2 Объяснения | `ClipCard.tsx:48-54` | строка «Цепкость 29 · Самодостаточность 29 · Длина 27» и `<details class="score-why">` «Почему такая оценка» (закрыт); `summary` ≥ 44 px (глобальное правило, замер: 44 px) |
| §3 Панель действий | `ClipCard.tsx:37-44` | `div.clip-actions role=group`: «↓ Скачать» / «Ссылка» / «Гостю»; `aria-label` «Скачать клип», «Скопировать ссылку на клип», «Отправить клип гостю». Функции `download`/`copyLink` прежние |
| Правка 7: статусы | `ClipCard.tsx:45-46,56` | `copyMessage` (`role=status`) и ошибка скачивания — сразу под панелью; `rerender_failure` — перед музыкой |
| §4 Порядок | `ClipCard.tsx:31-58` | кадр → панель → «ФРАГМЕНТ 01 · 29,2 с» и заголовок → оценка и «почему» → срок хранения → музыка → Pro (`source="clip_card"`) |
| Правка 3: снять `width:100%` | `globals.css:153-155` | `.clip-body .clip-actions button { width:auto; flex:1 1 auto }`, основная кнопка `flex-grow:2`; ряд переносится (cluster) |
| Правка 4 | `globals.css:67` | `.clip-preview { position:relative; … }` |
| Правка 5: токены в обеих темах | `globals.css:3,4` | тёмная `--score-bg:#dcefd9; --score-fg:#0f1a14`, светлая `--score-bg:#ffffff; --score-fg:#305d45` |
| §5 Контейнерные запросы | `globals.css:149-165` | `.clip-card { container-type:inline-size }`; поле карточки 16 px, от 22rem ширины КАРТОЧКИ — 24 px и зазор 12 px |
| Правка 9 | `ClipCard.tsx:19-26,56` | охраняемые подстроки сохранены байт-в-байт: `'link.create'`, `navigator.clipboard.writeText(absolute)`, `disabled={copying}`, `Скопируйте ссылку вручную`, `String(clip.published_render_version ?? clip.render_version ?? 1)`, `clip.rerender_failure &&` |
| Тесты | `tests/clip-card.test.ts` (16 тестов) | функция отметки, reduced motion, три кнопки с `aria-label`, недоступность «Гостю» без формы и при `available=false`, карточка не зовёт `guest.create`, плашка только при оценке и `aria-hidden`, объяснения внутри закрытого `details`, порядок, контраст плашки по токенам ≥ 4,5:1 в обеих темах, CSS-правки 3–5 |
| Прибор | `tests/browser/responsive-check.test.ts:88` | в палитру axe добавлены плашка (без `aria-hidden` — чтобы axe посчитал контраст), панель действий, строка оценки и `details`; обе темы, оба движка зелёные |

Существующие тесты карточки (`progress-screen`, `clip-music-choice`, `clip-music-review-fixes`, `short-link`)
не правились — все проходят без изменений.

## Итоги проверок (дословно)

Прогон после последней правки кода (финальный).

1. typecheck / lint / build:
```
typecheck exit=0
Статические правила: ошибок нет
lint exit=0
build exit=0
```
Сборка `apps/web` печатает `⚠ Compiled with warnings` про `@valkey/valkey-glide` из bullmq — то же
предупреждение есть на чистом дереве (проверено `git stash`), к фиче не относится.

2. Набор в образе `docker compose --project-directory . --env-file /tmp/n5-test.env --profile test run --rm --build test`:
```
 Test Files  101 passed (101)
      Tests  857 passed (857)
   Start at  23:43:15
   Duration  327.20s (transform 3.15s, setup 0ms, collect 20.66s, tests 272.49s, environment 38ms, prepare 11.70s)

suite exit=0
```
841 → 857: +16 тестов `tests/clip-card.test.ts`.

3. `bash scripts/check-responsive.sh --test`:
```
 Test Files  1 passed (1)
      Tests  50 passed (50)
   Start at  20:48:43
   Duration  26.46s (transform 121ms, setup 0ms, collect 576ms, tests 25.55s, environment 0ms, prepare 115ms)

responsive exit=0
```

4. Мутация «Гостю» (ручная, файл восстановлен копией и сверен `git diff`).

Мутант А — в `addGuestPreselect` убрана отметка (`return [...selected, clipId];` → `return [...selected];`):
```
--- RED
   × addGuestPreselect — «Гостю» marks the clip in the guest form > marks an offered clip 12ms
 FAIL  tests/clip-card.test.ts > addGuestPreselect — «Гостю» marks the clip in the guest form > marks an offered clip
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
exit=1
--- GREEN
 Test Files  1 passed (1)
      Tests  16 passed (16)
exit=0
```
Мутант Б — из эффекта `GuestPacks` удалён вызов `setSelected(old => addGuestPreselect(old, preselect.clip_id, selectable));`:
```
--- RED
 FAIL  tests/clip-card.test.ts > ClipCard markup > the card never creates a guest pack; the form marks the clip through addGuestPreselect only on a new nonce
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
exit=1
--- GREEN
 Test Files  1 passed (1)
      Tests  16 passed (16)
exit=0
```
Мутант Б ловится стражем по исходнику (слой 1, но по тексту, а не по поведению): jsdom в проекте нет,
клик по кнопке не симулируется — так и сказано в `01_validate.md` §1.

## Правка 8а: контраст плашки — посчитан вручную

axe плашку с `aria-hidden` не проверяет, поэтому число посчитано формулой WCAG (относительная
яркость) и закреплено тестом `clip-card CSS › … contrast ≥ 4.5:1`:

| Тема | Фон / текст | Контраст текста | Плашка против фона превью `--media-bg` |
|---|---|---|---|
| тёмная | `#dcefd9` / `#0f1a14` | **14,76 : 1** | 16,63 : 1 (`#060807`) |
| светлая | `#ffffff` / `#305d45` | **7,56 : 1** | 15,23 : 1 (`#1d2822`) |

Для светлой темы сначала рассматривалась пара кнопки (`#305d45`/`#ffffff`, те же 7,56 : 1), но тёмно-зелёная
плашка на тёмном превью светлой темы давала бы 2,01 : 1 против фона — почти невидимая граница; поэтому
плашка светлая. Кроме ручного расчёта плашка добавлена в палитру прибора без `aria-hidden` — axe на
Chromium и WebKit в обеих темах нарушений не нашёл (проверка 3).

## Правка 8б: FR-GROWTH-001 («скачать» и «гостю» без прокрутки на первой карточке) — НЕ выполнено

R9 прибора этот маршрут не проходит, поэтому снят отдельный замер: экран записи собран статически
(та же `globals.css`, разметка `ClipCard` из `renderToStaticMarkup`, навигация, шапка, панель «Клипы
готовы», заголовок «Ваши клипы» — повтор JSX `VideoDetail`), Playwright 1.60 в контейнере
`mcr.microsoft.com/playwright:v1.60.0-noble`, Chromium и WebKit, обе темы. Скрипты и сырые замеры —
`docs/features/clip-card/screens/` (`fixture-render.tsx.txt`, `fixture-measure.cjs.txt`, `geometry.jsonl`).

| Экран | Верх кадра | Панель действий (верх–низ) | В первом экране? |
|---|---|---|---|
| 390×844 | 634 | 1178–1225 | **нет** |
| 375×667 | 634 | 1117–1164 | **нет** |
| 360×740 | 634 | 1168–1215 | **нет** |
| 320×568 | 634 | 1047–1149 (ряд в две строки) | нет |
| 1024×768 (3 колонки, карточка 309 px) | 610 | 1172–1274 | нет |

Числа одинаковые в Chromium и WebKit и в обеих темах. Горизонтального скролла нет ни на одной ширине;
каждая кнопка панели 47 px в высоту, «Почему такая оценка» — 44 px.

**Вывод:** панель действий теперь стоит сразу под кадром, а не после оценки, музыки и блока Pro
(прежний путь ≈ 1,5 экрана внутри самой карточки). Но первая карточка начинается на 634 px: над ней
навигация, «← Все записи», заголовок из двух-трёх строк, `video_id`, панель состояния и заголовок
раздела. Плюс кадр 9:16 высотой до `min(70svh, 32,5rem)`. Поэтому на телефоне кнопки ниже первого экрана
примерно на 330–500 px. Критерий FR-GROWTH-001 этой фичей **не закрыт**. Для этого нужно менять
композицию экрана над сеткой или высоту кадра — это вне границ постановки («текст интерфейса вне
карточки не менять», порядок «кадр → панель» задан брифом). Это решение за координатором или владельцем.
Скриншоты: `screens/first-screen-chromium-dark-{390x844,375x667,360x740}.png`,
`screens/card-*.png`.

Попутно замечено на снимке 390×844: заголовок «Из длинного разговора —<br>короткие моменты» переносит
тире на отдельную строку. Это не относится к карточке, и я это не менял.

## Что не сделано / что фича НЕ доказывает

- FR-GROWTH-001 на экране записи — см. выше, не выполнено.
- `check-responsive` по СТЕНДУ (код 0 в обеих темах) не запускался: фича не выкачена, этот прогон делает
  координатор после выкатки. Проверка 3 — самотест прибора и палитры, а не прогон по стенду.
- Клик «Гостю» → отметка → прокрутка → фокус целиком в браузере не проверен: в стеке нет jsdom. Каждое
  звено проверено по отдельности: функция отметки, `revealGuestForm` на заглушках, недоступность в
  разметке, связка в эффекте — страж по исходнику. Сквозной клик остаётся на ручную проверку на стенде.
- Label-in-name (WCAG 2.5.3): видимое «Ссылка» не входит дословно в `aria-label` «Скопировать ссылку на
  клип» (там падеж «ссылку»). Тексты заданы брифом; axe это правило по умолчанию не проверяет. Для
  состояний «Открываем файл…», «Срок хранения истёк», «Получаем ссылку…» `aria-label` снимается, и
  диктор читает видимое состояние.
- Кадр 9:16 при ограничении высоты уже карточки и прижат к левому краю — так было и до фичи, не менялось.
- Мутации выполнены вручную, отдельного раннера (`run-*-mutations.mjs`) не добавлено.
- В рабочем дереве есть чужой неотслеженный каталог `projects/06-rag-sales-chatbase/docs/` — не мой, не трогал.

Status: completed
