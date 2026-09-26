# Отчёт исполнителя кода — фича 29 `progress-ribbon`

Исполнитель: Opus 5.5 (Anthropic; OpenAI/Codex не вызывались — квота, память «Только Anthropic с 25.09.2026»).
Проверка плана — Sonnet 5 (`01_validate.md`, READY WITH FIXES). Ревью кода — за другим агентом Anthropic. Выкатки и
коммита нет, `.env` не тронут. Тир: M (существующий экран, без схемы/внешних вызовов/публичных путей).

## Что сделано

1. **Лента стадий** — `apps/web/src/lib/progress-ribbon.ts` (`ribbonOf`, чистая функция): закрытый набор
   `Загрузка(uploading|queued) → Расшифровка(transcribing) → Выбор(selecting) → Монтаж(rendering)`; вид стадии
   `done | running | silent | failed | pending`; «N из M» — только у идущего Монтажа. Разметка `StageRibbon` в
   `VideoDetail.tsx`: `ol.progress-ribbon`, у текущей стадии `aria-current="step"`, состояние — знаком
   (✓ ◷ ? ! ○) И скрытым текстом («— сделано/идёт/нет ответа/отказ/впереди»), не только цветом.
2. **Три состояния + молчание сохранены** в `ProgressPanel` (экспорт и `data-state` прежние): «Выполняется» с лентой,
   текстом стадии и `progress`; «Нет ответа от обработки» (сервер и локальные часы, ≥ 5 мин) — `role=alert`, без
   `progress`, стадия `silent`; «Обработка не завершена» — стадия `failed`, причина, «Лимиты обновятся/обновились»,
   «Повторить»/«Загрузить другой файл» как было; «успех» — одна строка «Клипы готовы · N из M».
3. **Стадия отказа (A-2609-01)** — `screen.ts`: `LEFT JOIN LATERAL` последней попытки `job_attempt` по наибольшему
   `fence`, **без пересборок** (`NOT j.rerender`); `failedStageOf`: попыток нет или стадия вне `JOB_STAGE` → «Загрузка»;
   последняя попытка `succeeded` → СЛЕДУЮЩАЯ стадия (уточнение исполнителя, записано в `decisions-autonomous.md`:
   иначе `refused_*_llm` при повторе после готовой расшифровки показывался бы на «Расшифровке»). Новое поле экрана
   `VideoScreen.failed_stage` (null вне отказа).
4. **`wait_reason='no_disk'`** — «идёт» на текущей стадии, текст «Ждём свободного места» (как было в `stage_label`).
5. **Первый экран экрана записи (FR-GROWTH-001)** — `globals.css`, блок `progress-ribbon:first-screen` под
   `@media(width < 600px)`: шапка — `video_id` под `<details>` «Подробнее» в строке «← Все записи» (все ширины);
   h1 1,5rem, `<br/>` НЕ убран (2 строки, 54 px); зазоры header→лента→клипы `--space-4` вместо `--space-10`;
   «Ваши клипы» 1,25rem в строку со счётчиком; кадр карточки во всю ширину, `max-height:32svh` (у ВСЕХ карточек —
   единообразный список; до правки блок 9:16 сужался к левому краю). Порог шапки `22.49rem → 22.5rem` (360 включительно).
6. **R9 экрана записи** — `rules.mjs`: `/^\/dashboard\/videos\/[\w-]+$/ → .clip-card:first-of-type .clip-actions`;
   `check-responsive.mjs`: цикл `FIRST_SCREEN_VIEWPORTS` несёт `storageState` для `/dashboard…`.
7. Тесты: `tests/progress-screen.test.ts` (+5 «лента…»), `tests/limits-retry.test.ts` (без правок — прошёл),
   `tests/responsive-check.test.ts` (+1: маршрут R9 + страж по исходнику на `storageState`),
   `tests/progress-screen.integration.test.ts` (+1: `failed_stage` на настоящем PostgreSQL), новый браузерный
   `tests/browser/video-screen.test.ts` (НАСТОЯЩИЙ `VideoDetail` + шапка кабинета + боевой `globals.css`), фикстура AA
   `tests/browser/responsive-check.test.ts` дополнена лентой во всех тонах и шапкой. `vitest.browser.config.ts` —
   псевдонимы `enums/cta/music-catalog`. `scripts/test-progress-mutations.mjs` — якорь перенесён, +3 мутации, и
   **починен доконавший дефект**: копия проекта не содержала `scripts/test-skip-reporter.ts`, vitest падал ДО тестов,
   и все мутации давали `red=1, green=1` (красное ничего не доказывало) — теперь репортёр копируется.

## Числа первого экрана (готовое состояние, браузерный набор, WebKit = Chromium, обе темы; JSON рядом со скриншотами)

| Вьюпорт | шапка кабинета | заголовок экрана | лента (1 строка) | «Ваши клипы» | кадр | панель действий | запас |
|---|---|---|---|---|---|---|---|
| 390×844 | 0–77 | 101–228 (h1 54) | 244–286 | 302–327 | 340–610 (270) | **634–681** | 163 |
| 375×667 | 0–77 | 101–228 | 244–286 | 302–327 | 340–553 (213) | **569–616** | 51 |
| 360×740 | 0–77 (одна строка) | 101–228 | 244–286 | 302–327 | 340–576 (237) | **592–639** | 101 |

Было (оценка валидатора, 375×667): ≈ 1163 px до конца панели. Скриншоты: `screens/{webkit,chromium}-{dark,light}-first-screen-{390x844,375x667,360x740}.png`
(просмотрены 375×667 и 360×740), состояния на 320: `screens/*-dark-{done,running,silent,failure}-320.png`, десктоп
`screens/chromium-dark-{done,running}-1440.png` (просмотрены: лента в строку, композиция цела).

## Проверки (итоги дословно)

| Проверка | Итог |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | `Статические правила: ошибок нет` |
| `npm run build` (хост) | exit 0; в образе `#17 41.05  ✓ Compiled successfully in 18.5s` |
| Набор в образе `docker compose --project-directory . --env-file /tmp/n5-test.env --profile test run --rm --build test` | **` Test Files  109 passed (109)`, `      Tests  975 passed (975)`, `exit=0`** (было 968; +7). Журнал `tests/artifacts/progress-ribbon/full-suite-docker.log` |
| — прогон 1 того же набора | `Tests  1 failed | 974 passed (975)`: страж `tests/theme.test.ts` поймал `white-space` (слово `white`) в `.visually-hidden` вне блоков токенов — свойство убрано (`full-suite-docker-run1-theme-red.log`) |
| — прогон 2 | `dependency failed to start: container n5-clipmaker-test-db-1 is unhealthy`, диск 100 % (1,1 ГБ) → `bash scripts/cleanup-our-docker.sh`: `свободно до: 1G` → `свободно после: 14G (освобождено 13G)` (`full-suite-docker-run2-disk-full.log`) |
| `bash scripts/check-responsive.sh --test` | **` Test Files  2 passed (2)`, `      Tests  134 passed (134)`, `exit=0`** (было 94; +40 `video-screen.test.ts`). Журнал `tests/artifacts/progress-ribbon/browser-suite.log` |
| `node ../../.claude/hooks/check-job-contract.cjs .` | код 2 `проверка НЕ ВЫПОЛНЕНА, причина: not-deployed` — как до фичи (контракт так объявлен) |
| Прибор по стенду `check-responsive.mjs --base https://clipmkr.ru` | **НЕ ВЫПОЛНЕН** — выкатки нет. Выполнить после выкатки (код 0 обязателен) |

### Мутации

| Мутация | Красное | Зелёное |
|---|---|---|
| `distinct-states` — отказ рисуется как `running` (якорь теперь в `progress-ribbon.ts`) | `red=1` | `green=0` |
| `ribbon-silence` — молчание читается как «идёт» (`tone === 'silent' ? … ` → `'running'`) | `red=1` | `green=0` |
| `ribbon-failed-stage` — `failed_stage` не отдаётся экрану | `red=1` | `green=0` |
| `ribbon-collapse` — готово не сворачивается в строку | `red=1` | `green=0` |
| прежние `silence`, `foreign-404`, `unfinished-404`, `explanations` | `red=1` каждая | `green=0` каждая |
| R9 «панель первой карточки ниже сгиба» — экран без блока `progress-ribbon:first-screen` (встроено в браузерный набор, 3 вьюпорта × 2 движка) | 6 тестов утверждают находку `Основное действие вне первого экрана` — зелёные, т.е. мутант пойман | — |
| Страж `storageState` в цикле R9 — убрать `storageState` | `Tests  1 failed | 13 skipped` | `Tests  1 passed | 13 skipped` |
| AA-контраст ленты — `pending` цветом `--line` | `Tests  4 failed | 90 skipped (94)` | `Tests  4 passed | 90 skipped (94)` |

Журналы: `tests/artifacts/progress-ribbon/progress-mutations.log`, `tests/artifacts/progress-and-clips-screen/mutations/*`,
`tests/artifacts/progress-ribbon/aa-contrast-mutation-{red,green}.log`.

## Чего фича НЕ доказывает и ограничения (правка 12 валидатора)

- **R9 по стенду проверяет только ГОТОВОЕ состояние** (фикстура `seed-ui-fixture.mjs` ждёт `done`). «Идёт», «нет
  ответа», «отказ» проверены браузерным набором по настоящей разметке, не стендом.
- Эмуляция 375×667 — это вьюпорт целиком. На настоящем iPhone SE с панелями Safari видимая высота меньше (`svh`
  тоже меньше, кадр ужмётся, но фиксированные ≈ 400 px сверху останутся) — панель может оказаться у самого края или
  ниже. На устройстве не проверено. Вырез iPhone (`safe-area-top`) тоже не эмулирован.
- Уведомления между «Ваши клипы» и сеткой («Найдено фрагментов: …», «Часть клипов не удалось собрать») сдвигают панель
  вниз на свою высоту — в фикстуре их нет.
- Для `queued` лента показывает «Загрузку», а сторож при `stalled` из `queued` может показать отказ на «Расшифровке»
  (если попытка `stt` уже создана) — следствие правила A-2609-01, записано, не исправлялось.
- Правка порога шапки `22.5rem` изменила и лендинг на 360 px (бренд мельче) — браузерный набор лендинга зелёный,
  скриншоты `tests/artifacts/landing-demo/browser/*360x740*` перезаписаны прогоном.
- Стрелки между стадиями — `content:"→" / ""`; в Safari < 17.4 объявление отбрасывается целиком (стрелок нет, порядок
  `ol` сохраняется).

## Документы

`docs/Specification-addendum.md` (FR-GROWTH-001: выполнено в браузерном наборе, по стенду не проверено),
`docs/long-job-contract.md` (дополнение о ленте), `docs/REPRODUCE.md` (соглашение вёрстки + R9 экрана записи),
`docs/plans/2026-09-25-mobile-ui.md` (шаг 6 — код, ждёт ревью и выкатки), `docs/decisions-autonomous.md` (уточнение A-2609-01).

Status: completed
