# Квитанция кода — фича 28 `landing-demo` (лендинг с демо-клипом, витрина CTDUUG)

Исполнитель: Opus 5.5 (Claude Code, 26.09.2026). Постановка — `00_brief.md` целиком, включая «ОБЯЗАТЕЛЬНЫЕ правки
после VALIDATE»; все 9 правок `01_validate.md` выполнены (таблица ниже). Методика — `.claude/skills/responsive-ui/SKILL.md`.
OpenAI/Codex не вызывались. Ничего не выкачено и не закоммичено, миграций нет, `.env` не тронут; для прогона в образе —
существующий `/tmp/n5-test.env`. Из базы стенда только ЧТЕНИЕ (одна выборка для чисел витрины). Ревью — другой агент
(OWN-017). Телеметрия p-replicator этим исполнителем не велась: `null` — запись прогона принадлежит координатору.

## Первым делом: ретенция стёрла бы витрину — подтверждено базой стенда

Выборка из `n5-clipmaker-db-1` (только чтение), 26.09.2026:

```
CTDUUG|46f99d89-33f5-494d-a682-2fa364c14152|ec8b9021-729d-41bb-b830-bc188b67b86f|done|t|t||5305.9|2026-09-24 10:24:31.092331+00|free|7
code  |clip.id                              |video_id                            |status|object|thumb|expires_at|duration_seconds|finished_at|plan|clips done
```

План аккаунта `free`, `finished_at` 24.09 10:24 UTC → отбор `retention.ts` (`plan <> 'paid' AND finished_at <= now − 3 сут`)
забрал бы клип **27.09 ≈ 10:24 UTC**. Сделано: в шаге «очистка клипов» `AND NOT (c.id = ANY($3::uuid[]))` с
параметром `SHOWCASE_CLIP_IDS`; тест на PostgreSQL + мутация (ниже). **До выкатки защита НЕ действует** — если выкатка
позже 27.09 10:24 UTC, объект стенда будет стёрт текущим кодом (см. «Что НЕ доказано», п. 1).

Найдено сверх постановки (стык): `/c/{code}` (`previewState`) считает тот же срок 3 суток и после 27.09 показал бы
«Срок хранения клипа истёк» при живом объекте — ссылка «Открыть клип» под демо вела бы в тупик. Исправлено:
срок бесплатного тарифа к клипу набора не применяется (явный `expires_at` соблюдается). Экран владельца
(`presentClip`, `clip-file.ts`, смена музыки/призыва) — не расширялся, владелец увидит клип «истёкшим» (строгая сторона;
записано в ADR-018 «Последствия»).

## Что сделано

| Часть | Где |
|---|---|
| Закрытый набор `SHOWCASE_CLIPS` (`CTDUUG` → `clip.id`, 88 мин, 7 клипов), `findShowcase` (точное членство), `isShowcaseClip`, `showcaseCaption` («88 мин разговора → 7 клипов») | `packages/shared/src/showcase.ts` (новый) |
| Ретенция щадит клипы набора; стирание аккаунта — нет | `apps/web/src/server/retention.ts` |
| `/c/` не объявляет клип набора истёкшим; `clip_id` в выборке ссылки | `apps/web/src/server/short-link.ts` |
| Третий путь к файлу: 429 → членство ДО базы → строка (`done`, живой аккаунт, неудалённая запись, неотозванная `clip_link` с ЭТИМ кодом) → 302 на подпись | `apps/web/src/server/showcase-file.ts` (новый), `showcaseRoute` в `screen-runtime.ts`, `app/api/showcase/[code]/{file,thumbnail}/route.ts` |
| Лендинг: разметка вынесена в `Landing` (его же рендерит браузерный набор), демо `LandingDemo`, кнопка `LandingCta` (клиентский фокус), `AuthForm` — `id="auth"`, `id="auth-email"`, фокус по `#auth` (эффект + `hashchange`) | `apps/web/src/app/{Landing,LandingDemo,LandingCta}.tsx` (новые), `page.tsx`, `AuthForm.tsx` |
| Стили демо — только токены, `--media-bg` у видео | `apps/web/src/app/globals.css` (блок в конце) |
| Прибор: `FIRST_SCREEN_ACTIONS.selector: string \| string[]`, `firstScreenSelectors(route)`, цикл по каждому селектору | `scripts/responsive/rules.mjs`, `scripts/check-responsive.mjs` |
| Псевдоним `@clipmaker/shared/showcase` в обоих конфигах vitest; `jsx: automatic` в браузерном | `vitest.config.ts`, `vitest.browser.config.ts` |
| Тесты | `tests/landing-demo.test.ts` (18), `tests/landing-demo.integration.test.ts` (7), `tests/retention.integration.test.ts` (+2), `tests/retention.test.ts` (ожидание параметров), `tests/responsive-check.test.ts:169` (новый селектор), `tests/browser/responsive-check.test.ts` (+10 на движок: R9 3 размера × 2 темы, R1/R2/R5/axe/R8 × 2 темы, 320 и 1440) |
| Мутационный раннер | `tests/run-landing-demo-mutations.mjs` (новый) |

### Правки `01_validate.md`

| № | Правка | Как |
|---|---|---|
| 1 | Исключение ретенции по `SHOWCASE_CLIPS` + тест + мутация | `retention.ts`; `retention.integration.test.ts` «ADR-018 showcase clip survives…» (сосед того же возраста и тарифа стёрт); мутации `retention-exclusion` (юнит, SQL и параметр) и `retention-exclusion-db` (PostgreSQL) |
| 2 | `selector: string \| string[]`, цикл в `check-responsive.mjs` | каждый селектор — отдельный вызов `firstScreenRule` до любой прокрутки; находки не подменяют друг друга |
| 3 | `tests/responsive-check.test.ts:169` | `['.landing-cta', '.landing-demo video']` + проверки `firstScreenSelectors` |
| 4 | 302 на подпись, не поток через web | `sign: key => generateDownloadUrl(ctx, key)`; страж по исходнику: в `showcaseRoute` нет `stream`/`guestSecret` |
| 5 | `clamp(7rem,38vw,9.5rem)`, подтвердить скриншотом 375×667 | замер ниже; число не менялось |
| 6 | Фокус в поле почты программно | `LandingCta` onClick: `scrollIntoView` + `focus({preventScroll})` + `replaceState('#auth')`; без JS — обычный якорь; `AuthForm` фокусирует по `#auth` при загрузке и `hashchange` |
| 7 | `controls` | `<video controls playsinline preload="none">` (юнит + браузер) |
| 8 | Addendum: расхождение FR-LOOK-007 | `docs/Specification-addendum.md`, раздел «FR-LOOK-007 и FR-LOOK-011» — три причины, воронка +1 касание |
| 9 | ADR-018 + `security.md` «ровно три пути» | `docs/ADR.md` ADR-018 + строка сводки; `.claude/rules/security.md`; синхронно — `code-reviewer.md`, `security-patterns/SKILL.md`, `pipeline-walkthrough.md` |

### Число первого экрана (правка 5 и п. 3 постановки) — ЗАМЕР, не оценка

Браузерный набор рендерит настоящий `Landing` с настоящим `globals.css` (не стенд: без шрифтов Next и без
safe-area выреза). Геометрия одинакова в WebKit и Chromium, в обеих темах (`tests/artifacts/landing-demo/browser/*.json`):

| Экран | H1 | Видео (Ш×В, низ) | «Попробовать бесплатно» (низ) | Запас до низа |
|---|---|---|---|---|
| 375×667 | 101–209 (3 строки, 108 px) | 143×253, низ 479 | 542 | 125 px |
| 360×740 | 101–209 | 137×243, низ 469 | 531 | 209 px |
| 390×844 | 101–209 | 148×263, низ 489 | 552 | 292 px |

Решение: **постер 9:16 ЦЕЛИКОМ**, видео `clamp(7rem,38vw,9.5rem)`; подпись и «Открыть клип» — справа от видео, не под
ним (экономит ≈ 84 px высоты против оценки валидатора). На 390×844 с вырезом iPhone (`safe-area-top` ≈ 47 px) всё
сдвигается вниз на ≈ 31 px — запас 292 px это покрывает; эмуляцией выреза не проверено. Скриншоты:
`webkit-dark-first-screen-375x667.png` (заголовок → демо с подписью → кнопка → начало формы) и
`chromium-dark-width-1440.png` (демо в левой колонке под текстом, низ 822 из 900, форма справа, кнопки нет) — открыты
и просмотрены.

## Проверки (итоги дословно)

| Проверка | Итог |
|---|---|
| `npm run typecheck` | `typecheck exit=0`, `error TS` — 0 (после `npm run build --workspace=packages/shared`: без собранного `dist` web не видит `@clipmaker/shared/showcase` — так же, как любой подпуть `shared`). Журнал `tests/artifacts/landing-demo/typecheck.log` |
| `npm run lint` | `Статические правила: ошибок нет` (`lint.log`) |
| build | внутри образа `test`: `#17 36.56  ✓ Compiled successfully in 16.8s` |
| Набор в образе `docker compose --project-directory . --env-file /tmp/n5-test.env --profile test run --rm --build test` | **` Test Files  109 passed (109)`, `      Tests  968 passed (968)`, `exit=0`** (было 941/107: +18 `landing-demo.test.ts`, +7 `landing-demo.integration.test.ts`, +2 `retention.integration.test.ts`). Журнал `tests/artifacts/landing-demo/full-suite-docker.log` |
| Предыдущий прогон того же кода | `exit=1`: `dependency failed to start: container n5-clipmaker-test-db-1 is unhealthy` — диск машины 100 % (1,4 ГБ). Вылечено проектным `bash scripts/cleanup-our-docker.sh` (`свободно до: 2G` → `свободно после: 14G (освобождено 12G)`: неиспользуемый кэш сборки и безымянные образы; чужие контейнеры и тома не тронуты), затем прогон выше |
| `bash scripts/check-responsive.sh --test` | **` Test Files  1 passed (1)`, `      Tests  94 passed (94)`, `exit=0`** (было 74: +10 на движок). Журнал `tests/artifacts/landing-demo/browser-suite.log` |
| Прибор по стенду `node scripts/check-responsive.mjs --base https://clipmkr.ru …` | **НЕ ВЫПОЛНЕН** — выкатки нет, на стенде старый лендинг. Выполнить после выкатки (код 0 обязателен) |
| `check-ports.cjs`, `check-env-wiring.sh` | не запускались: compose и переменные окружения не менялись |

### Мутации (`node tests/run-landing-demo-mutations.mjs [id…]`; квитанции `tests/artifacts/landing-demo/mutations/`)

Строки дословно из вывода раннера (vitest `--reporter=json`).

| Мутация | Где выполнена | Красное | Зелёное | Итог |
|---|---|---|---|---|
| set-membership — `findShowcase` отдаёт витрину на ЛЮБОЙ код (снята проверка набора) | хост | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| set-membership-db — то же, чужой НАСТОЯЩИЙ клип с кодом того же формата | образ, PostgreSQL 16 | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| link-code-db — в SQL снята привязка `l.code=$2` (набор и база разошлись) | образ | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| done-only-db — снят `c.status='done'` | образ | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| retention-exclusion — исключение выключено (`… AND false`), параметр оставлен | хост | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| retention-exclusion-db — то же на PostgreSQL: клип витрины стирается | образ | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| preview-showcase — `/c/` снова считает 3 суток для витрины | хост | `{"exit":1,"passed":0,"failed":1}` | `{"exit":0,"passed":1,"failed":0}` | killed |
| playsinline — убран `playsInline` у демо | хост → контейнер Playwright | `{"exit":1,"passed":0,"failed":4}`; причина дословно `expected [ 'R5: Нет playsinline' ] to deeply equal []` | `{"exit":0,"passed":4,"failed":0}` | killed |
| demo-below-fold — видео `clamp(16rem,80vw,22rem)` | хост → контейнер Playwright | `{"exit":1,"passed":4,"failed":8}`; на 375×667 дословно `R9 за сгибом: [".landing-cta: Основное действие вне первого экрана",".landing-demo video: Основное действие вне первого экрана"]` | `{"exit":0,"passed":12,"failed":0}` | killed |

Сводки: хост `{"summary":["set-membership:killed","retention-exclusion:killed","preview-showcase:killed"]}`;
браузер `{"summary":["playsinline:killed","demo-below-fold:killed"]}` (журнал `browser-mutations-host.log`; повтор
`demo-below-fold` с явным списком селекторов в сообщении — `browser-mutations-host-2.log`); образ
`{"summary":["set-membership-db:killed","link-code-db:killed","done-only-db:killed","retention-exclusion-db:killed"]}`
(журнал `db-mutations-docker.log`, запуск `… run --rm --build test sh -c "node scripts/test-db.mjs && env -u N5_ACCEPTANCE node tests/run-landing-demo-mutations.mjs …"`).

**Первый прогон `link-code-db` выжил** (`red {"exit":0,"passed":1,"failed":0}`): тест удалял у клипа витрины ВСЕ ссылки,
и `EXISTS` без привязки к коду всё равно был ложным. Тест усилен (у клипа витрины живая ссылка с ДРУГИМ кодом, код
витрины висит на соседе) — после этого killed. Итог 390×844 в `demo-below-fold` остаётся зелёным: там мутированное видео
ещё помещается — красное дают 375×667 и 360×740 (8 из 12).

## Отступления и решения исполнителя (сверить ревью)

1. **`/c/` витрины не истекает** — сверх постановки (стык, найден чтением `short-link.ts`); без этого «Открыть клип»
   после 27.09 вёл бы на «срок истёк». Экран владельца не трогал — ADR-018 «Последствия».
2. **Маршрут требует неотозванную `clip_link` с кодом из набора** — сверх постановки: набор (код + id) и база обязаны
   указывать на один клип; отзыв короткой ссылки владельцем закрывает и витрину.
3. **Стирание аккаунта витрину стирает** — право на удаление сильнее витрины (тест).
4. **Разметка вынесена в `Landing.tsx`**, `page.tsx` только читает тему: так браузерный набор проверяет НАСТОЯЩУЮ
   разметку, а не копию-фикстуру.
5. **Надзаголовок на телефоне скрыт, как и до фичи** (постановка: «надзаголовок → H1»): его показ съел бы ≈ 30 px и
   менял решённое в фиче 24; текст владельца не менялся. На ≥ 600 надзаголовок виден.
6. **Пустой набор → демо не рисуется**; клип набора пропал (404) → пустая рамка плеера: лендинг в базу не ходит и
   наличие не проверяет (записано в ADR-018).

## Документы (черновики)

- `docs/ADR.md` — ADR-018 + строка сводки.
- `.claude/rules/security.md` — «РОВНО ТРИ пути», граница третьего; синхронно `.claude/agents/code-reviewer.md`,
  `.claude/skills/security-patterns/SKILL.md`, `docs/pipeline-walkthrough.md`, `.claude/skills/responsive-ui/SKILL.md` (R9 для `/`).
- `docs/Specification-addendum.md` — FR-LOOK-007/011: что воплощено, расхождение с принятой FR-LOOK-007 и три причины,
  воронка +1 касание.
- `docs/REPRODUCE.md` — R9 для `/`, соглашение «демо-клип лендинга» (в новом окружении заменить запись набора на свой
  клип), две строки таблицы расхождений.
- **Не обновлено** (дело координатора при закрытии): «941 тестов» → 968/109 в `CLAUDE.md`/`REPRODUCE.md` §4, число фич
  «27» → 28, `.claude/feature-roadmap.json`, `docs/features/README.md`, `05_completion.md`; `docs/Pseudocode.md` («ровно
  два пути») — заморожен, расхождение записано в `REPRODUCE.md` §10.

## Что НЕ доказано

1. **Защита витрины от ретенции не на стенде.** Пока код не выкачен, стенд работает старым `retentionTick` (раз в час):
   после **27.09.2026 ≈ 10:24 UTC** объект клипа CTDUUG будет стёрт безвозвратно (пересборка — повторный рендер). Выкатка
   `web` до этого момента — условие, а не пожелание.
2. Прибор по стенду не запускался; геометрия — по настоящей разметке в эмуляции без шрифтов Next и без выреза iPhone.
3. Постер и видео в браузерном наборе не грузились (маршрута витрины там нет): размер кадра задан CSS, а не картинкой;
   воспроизведение по тапу во встроенных браузерах Telegram/VK не проверено.
4. Фокус в поле почты по кнопке проверен только чтением кода и разметкой, не кликом в браузере.
5. Ложные `429` на постер при общем лимите чтений с `/c/` — не измерялись (нагрузки нет).
6. Конверсия «визит → регистрация» после +1 касания — только после выкатки.

Status: completed
