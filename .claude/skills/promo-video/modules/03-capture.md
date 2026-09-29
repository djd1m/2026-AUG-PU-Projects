# Модуль 03: запись экранов

Эталоны: [`promo/capture/README.md`](../../../../promo/capture/README.md) + [`record-n6.mjs`](../../../../promo/capture/record-n6.mjs)
(N6: курсор, `page.route`-блокировки, счётчик платных вызовов, журнал событий), [`hidpi-recorder.mjs`](../../../../promo/capture/hidpi-recorder.mjs),
[`promo/capture/n2/`](../../../../promo/capture/n2/README.md) (фикстура-учётка, `run.sh` с проверкой памяти),
[`promo/capture/n4/`](../../../../promo/capture/n4/README.md) (платные распознавания, сверка чисел, CC0-фото).

## Input

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `SCENARIO.md` | файл | да | какие экраны и действия нужны, с какой раскладкой |
| таблица запретов | раздел `SCENARIO.md` | да | модуль 02 — что блокировать маршрутом ещё до съёмки |
| `stand_url` | URL | да | выданный адрес стенда |
| `paid_limit` | число на проект | да, если у продукта есть платные вызовы | лимит серии: N6 предпросмотр 1 + ответы ≤ 4, N4 ≤ 3 распознавания, N5 одна запись ≤ 3 мин, N1/N2/N3 — 0 |

## Process

1. **Проект записи** `promo/capture/<proj>/`: `record-<proj>.mjs`, `package.json` с **точной** версией
   `"playwright": "1.60.0"` и `"type": "module"` (копия `promo/capture/n2/package.json`), lockfile, `README.md`, при
   необходимости `run.sh`. Запуск — только в контейнере `mcr.microsoft.com/playwright:v1.60.0-noble`, на хосте ничего не
   ставить. **Bootstrap в новом проекте**: lockfile создаёт первый запуск в том же контейнере, дальше — только `npm ci`:
   ```bash
   T0=$(date '+%Y-%m-%d %H:%M:%S')
   docker run --rm --name promo-<proj>-capture --memory=1500m --cpus=2 --shm-size=1g \
     -v "$PWD/promo/capture:/work" -v /home/dz-projects-2026/.promo-assets/<proj>:/assets -w /work/<proj> \
     mcr.microsoft.com/playwright:v1.60.0-noble bash -c 'set -e
       [ -f package-lock.json ] || npm install --package-lock-only --no-audit --no-fund   # только первый раз
       npm ci --no-audit --no-fund && node record-<proj>.mjs'
   bash .claude/skills/promo-video/scripts/gate-watchdog.sh promo-<proj>-capture "$T0"
   ```
   Lockfile закоммитить вместе со скриптом. Проверено на пустом проекте в scratchpad: lockfile создан (1681 байт),
   `npm ci` — «added 2 packages in 2s», запись прошла. Без `-p` (записи порты не нужны). Имя контейнера —
   `promo-<proj>-capture` (модуль 06 §2).
2. **Память до запуска**: `free -g`; если `free` < 2 ГБ — ждать `sleep 60` до 10 раз (эталон — `promo/capture/n2/run.sh`).
   На этой машине колонка `free` почти всегда < 2 из-за страничного кэша, поэтому после 10 попыток решает `available`
   ≥ 2; меньше — код 2 «запись НЕ выполнена», не запуск наудачу.
3. **Две раскладки**:
   - **desktop 1920×1080** — штатный `recordVideo` с **явным** `size: {width: 1920, height: 1080}` (умолчание Playwright —
     800×800 с масштабом); курсор рисуется `addInitScript` (headless системный курсор не рисует);
   - **mobile 390×844 CSS px @2** — `startHiDpiRecording` из `hidpi-recorder.mjs` → файл 780×1688. Штатный `recordVideo`
     при `deviceScaleFactor 2` кладёт кадр 390×844 в угол серого поля — проверено в пилоте (README записи, «Грабли»).
     Минимальный вызов (проверен: 780×1688, 63 кадра за 4 с, `capture_fps` 22,9):
     ```js
     import { startHiDpiRecording } from '../hidpi-recorder.mjs';
     const ctx = await browser.newContext({ viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
     const page = await ctx.newPage();
     const rec = await startHiDpiRecording(page, `${OUT}/${file}`, { width: 780, height: 1688 });
     videoStart(file, 'mobile');                     // п. 5: событие video.start СРАЗУ после старта рекордера
     // … действия …
     const stats = await rec.stop();                 // ДО page.close(): дописывает кадры, закрывает ffmpeg, бросает при коде ≠ 0
     await page.close();
     note('video.saved', { file, ok: true, recorder: stats });
     ```
     У desktop (`recordVideo`) запись начинается в `ctx.newPage()` — `video.start` писать сразу после `newPage()`.
   - Тема — продукта по умолчанию (`colorScheme`), `locale: 'ru-RU'`, `timezoneId: 'Europe/Moscow'`.
4. **Человеческий темп**: ввод по буквам 60–260 мс на знак, паузы, плавная прокрутка (`easeInOutCubic` через
   `requestAnimationFrame`), курсор к элементу за 18–30 шагов. Ожидания сервера (у N6 ≈ 30 с на ответ) снимаются как
   есть и вырезаются на монтаже — не ускорять продукт подделкой ответа.
5. **Журнал событий `record-log-<ISO>.json` — источник истины для монтажа.** Часы прогона (`t_s` от старта скрипта) и
   секунды внутри файла — разные шкалы; монтаж берёт `from/to` ВНУТРИ файла, поэтому журнал обязан связывать их
   (вердикт Codex по навыку §2: в `record-n6.mjs` общий `t0`, а `recorded()` начало файла не записывает):
   - `{t_s, event: 'video.start', file, layout}` — сразу после старта записи файла (`newPage()` для desktop,
     `startHiDpiRecording` для mobile), по событию на КАЖДЫЙ файл, т. е. отдельно на каждую раскладку;
   - каждое событие действия (клик, ввод, ответ сервера, `blocked`, отказ) внутри записи — `{t_s, event, file, layout,
     t_file_s}`, где `t_file_s = t_s − t_s(video.start того же file)`; это число и идёт в `from/to` конфига;
   - `{t_s, event: 'video.saved', file, ok}` — после сохранения.
   Шаблон функции:
   ```js
   const starts = new Map();
   const videoStart = (file, layout) => { const t_s = +((Date.now() - t0) / 1000).toFixed(2); starts.set(file, t_s); log.events.push({ t_s, event: 'video.start', file, layout }); };
   const note = (event, extra = {}) => { const t_s = +((Date.now() - t0) / 1000).toFixed(2);
     const e = { t_s, event, ...extra };
     if (extra.file && starts.has(extra.file) && event !== 'video.saved') e.t_file_s = +(t_s - starts.get(extra.file)).toFixed(2);
     log.events.push(e); };
   ```
   Ворота: `node .claude/skills/promo-video/scripts/gate-log.mjs <record-log-*.json> /home/dz-projects-2026/.promo-assets/<proj>`
   → 0. Журналы серии 29.09 этим воротам НЕ удовлетворяют (проверено на N2 `record-log-…08-13-12-792Z.json` → код 1:
   «нет video.start», «ни одно событие действия не привязано к файлу»): их тайминги сверялись по кадру. Если README и
   конфиг разошлись (N6 «ответ ~30 с» против сегмента 9–15 с; N2 «Отправлено» на ~24 с против 22,5 с) — сверять по
   `t_file_s` и кадру, исправлять документ, если кадр верен, и монтаж, если нет (DEC-S-03).
6. **Блокировки маршрутом до первого клика** — всё, что тратит деньги сверх лимита, меняет чужие данные или ведёт в
   запрещённое: `ctx.route(<regex>, r => { note('blocked', {url}); return r.abort(); })`. Эталоны: N6 `/claim`, `/share`,
   `/api/auth/*`; N2 `kofeynya-artel`, `/places/*/bind`, `t.me`; N5 `/api/checkout`, `/upgrade`, повтор обработки.
7. **Фикстура-учётка — только если сцена невозможна без кабинета**, и ровно одна на проект:
   - почта `promo-fixture-<proj>@example.com`, пароль `openssl rand -hex 12`;
   - регистрация обычной формой стенда, вне записи (почта фикстуры не должна попасть в кадр);
   - `/home/dz-projects-2026/.promo-assets/<proj>/.fixture.env` и cookie `.state-<proj>.json` — права 600, вне git;
   - **не удалять** — решение владельца; в README записи: что создано (id объектов, адреса).
   - Это пункт 7 модуля; ссылки «модуль 03 п. 7» в модулях 01 и 02 ведут сюда.
   - Чужие учётки, `ui-fixture.json`, `.env` стендов — не трогать никогда.
8. **Платные вызовы — по счёту и по лимиту**:
   - счётчик в журнале (`paid: {…}`) и в файле состояния (`.state-<proj>.json`, 600), переживающем перезапуск;
     при достижении лимита скрипт отказывает, а не делает «ещё один» (N4: `paid_total ≥ 3` → стоп);
   - считать **запросы к провайдеру**, а не действия в UI: у N5 «1 загрузка» = расшифровка + выделение фрагментов,
     у N6 «4 вопроса» не обязательно = 4 генерации (отказ по порогу раньше модели) — Codex §4. Если провайдерские
     запросы не видны — так и писать: «число вызовов провайдера и стоимость не измерены»;
   - второй раскладке не делать второй платный вызов: перехватить `POST` и отдать уже выданный идентификатор
     (N6: `preview_creates_intercepted: 1`);
   - отказ платного вызова не повторяется скриптом (N4 prep `no_food_matched` → повтор только с явным флагом).
9. **Сверка чисел перед съёмкой** (где продукт показывает данные): прочитать API и проверить диапазон (N4: ккал/100 г
   яблока 45–65, id USDA из ожидаемого набора). Неверные числа в кадр не берутся; дефект данных — координатору, стенд
   не править.
10. **Нужна правка продукта** (экран недоступен, вёрстка режется, стенд отказывает) — **не править**: в README записи
    «не снято, нужна правка: <что>», сообщить координатору. Стенды не перезапускать. Эталоны: N6 `install-desktop` не
    снят (за входом); N3 отложен целиком (стенд `403 ORIGIN_DENIED`, лимит демосеансов исчерпан, пересборка выкатила бы
    незавершённый F3); N4 степпер «прим…» обрезан на 390 px — свойство продукта, записано.
11. **Свободные материалы** для загрузки в продукт (фото еды, подкаст) — только CC0/Public Domain, лицензия проверена по
    метаданным источника (N4: `extmetadata` Commons, автор, sha256 файла) и записана в README.
12. **README записи** по эталону: таблица `ffprobe` (разрешение, длительность, fps, кодек, кадры, размер), «что в кадре»
    с таймингами внутри файлов, журналы прогонов, фикстура, платные вызовы, «что НЕ снято и почему», «нельзя → как
    обойдено», команда повтора, грабли.

## Output

- `/home/dz-projects-2026/.promo-assets/<proj>/*.webm` (desktop 1920×1080, mobile 780×1688, vp8 25 fps) — **вне git**.
- `record-log-*.json` рядом с записями; `.fixture.env`, `.state-<proj>.json` (600) — вне git.
- `promo/capture/<proj>/{record-<proj>.mjs,package.json,package-lock.json,README.md[,run.sh]}` — в git.
- Коммит `feat(promo): запись экранов <proj> …` по-русски; видео в git не класть (`promo/.gitignore`).

## Quality Gate

| Проверка | Команда | Порог | Код → действие |
|---|---|---|---|
| Размеры записей | `docker run --rm --name promo-<proj>-probe --cpus=1 --memory=1g --network none -v /home/dz-projects-2026/.promo-assets/<proj>:/a:ro promo-render:2026-09-29 bash -c 'for f in /a/*.webm; do echo "$f $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f")"; done'` | desktop `1920,1080`, mobile `780,1688` | другое → переснять; пустой вывод → НЕ выполнено |
| Кадр mobile — на всё поле, не в углу | один кадр `ffmpeg -ss 2 -frames:v 1` глазами | — | блокирует |
| Журнал годен для монтажа | `node .claude/skills/promo-video/scripts/gate-log.mjs <журнал> <каталог записей>` | 0 | 1 → дописать `video.start`/`t_file_s`, переснять; 2 → журнала нет |
| Платные вызовы ≤ лимита, посчитаны по журналу | `paid` в `record-log-*.json` = таблица README | ≤ лимита | блокирует |
| Ни одного запроса к запрещённому | `blocked` в журнале названы; для запретов «не снимать» — 0 обращений | 0 | блокирует |
| В git нет видео, `.env`, состояния, журналов, пароля фикстуры | `bash .claude/skills/promo-video/scripts/gate-git.sh <proj>` — ИНДЕКС (`git ls-files`), новые файлы (`git status --porcelain --untracked-files=all`), значение `FIXTURE_PASSWORD` в отслеживаемых файлах, права `.fixture.env` = 600 | 0 | 1 → `git rm --cached`, убрать секрет; 2 → не git/нет каталогов |
| Сторож не трогал запись | `gate-watchdog.sh promo-<proj>-capture "$T0"` | 0 | 1 → запись недействительна, переснять; 2 → повторить через 3 мин |

Пустой `git status` отсутствия секретов не доказывает: закоммиченный и неизменённый файл в нём не виден (Codex §5).
Проверено: закоммиченные `clip.webm` и `.state-zz.json` при пустом `git status` → `gate-git.sh` код 1 «в ИНДЕКСЕ»;
те же файлы неотслеживаемые → 1; пароль фикстуры в отслеживаемом `record-zz.mjs` и права 644 → 1; чисто → 0;
настоящие n1, n2, n4, n5, n6 → 0.

## Dependencies

- Образ `mcr.microsoft.com/playwright:v1.60.0-noble` (REQUIRED); нет — «запись НЕ выполнена» с причиной.
- `promo/capture/hidpi-recorder.mjs` (REQUIRED для mobile) — импортировать относительным путём `../hidpi-recorder.mjs`.
- Образ `promo-render` (REQUIRED для `ffprobe`/кадров): в Playwright-образе ffprobe нет.
- Node на хосте (REQUIRED для `gate-log.mjs`; проверено на Node 20) — или тот же скрипт в `promo-render` (Node 24).

## Reusability

`hidpi-recorder.mjs` и шаблон `recorded()` из `record-n6.mjs` (запись → `saveAs` ДО `page.close()` → журнал) годятся
для любых E2E-видео продуктов; счётчик платных вызовов с файлом состояния — для любого скрипта, трогающего
платный стенд.
