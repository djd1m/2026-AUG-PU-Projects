# Шаблон промо-ролика серии (Remotion 4.0.529)

Один компонент ролика, который читает `promo/remotion/<proj>/project.config.ts` и выдаёт три `<Composition>`:
`promo-16x9` (1920×1080), `promo-9x16` (1080×1920), `promo-1x1` (1080×1080), все 45,000 с, 30 fps, 1350 кадров.
Код шаблона читать не нужно: всё, что отличает проекты, — конфиг, записи и шрифт. Правила серии — [`../../SERIES.md`](../../SERIES.md),
эталон проекта — [`../n6/`](../n6/).

## Как добавить проект за 5 шагов

### 1. Папка проекта

```
promo/remotion/<proj>/            # <proj> — a-z, 0-9, «-» (n1, n2 …); совпадает с id в конфиге
  project.config.ts               # шаг 2
  public/rec -> /assets           # симлинк: ln -s /assets promo/remotion/<proj>/public/rec
  public/fonts/…                  # шаг 2: TTF шрифта продукта ИЛИ симлинк на Onest образа
  SCENARIO.md  README.md  MEASUREMENTS.md  ITERATIONS.md   # шаг 5
```

`package.json` и lockfile — общие в `promo/remotion/`, свой не заводить. Onest (400/500/600/700) уже есть в образе:
`ln -s /usr/local/share/fonts promo/remotion/<proj>/public/fonts`. Другой шрифт (Bricolage/DM Sans у N1, Unbounded у N4,
Rubik у N3) — скопировать статические TTF из проекта продукта в `public/fonts/` вместе с файлом лицензии OFL.
Нужны насыщенности 400, 600, 700; надёжнее статические файлы. Вариативный TTF можно указать одним файлом на три
насыщенности, но на N6 это не проверялось — сверить жирность на контрольных кадрах.

### 2. Конфиг `project.config.ts`

Скопировать [`../n6/project.config.ts`](../n6/project.config.ts) и заменить значения. Типы и все проверки —
`shared/src/project.ts` (`ProjectConfig`). Поля:

| Поле | Что |
|---|---|
| `id` | имя папки |
| `name`, `tagline`, `url` | финальная сцена: название, подзаголовок, адрес без `https://` |
| `tokens` | `paper` (фон), `ink` (текст), `accent` — `#rrggbb` из `globals.css` продукта (`docs/research/promo-videos/05_project_inputs.md`) |
| `font` | `family` и файлы относительно `public/` для `400`, `600`, `700` |
| `scenes` | 5 сцен каркаса серии; сумма `seconds` ровно 45 |

Типы сцен:

- `{type: 'title', seconds, lines: [{text}, {text, accent: true}]}` — заголовок на фоне (сцена 1 «боль»).
- `{type: 'screen', seconds, tracks, use, note?}` — запись экрана с полосой титра:
  - `tracks.<имя> = {file, size: [w, h], segments}` — файл из `/home/dz-projects-2026/.promo-assets/<proj>/`, размер в пикселях
    (`ffprobe`), куски `{from, to, seconds, caption, crop?}`: секунды `[from, to]` записи укладываются в `seconds` ролика
    (ускорение = (to−from)/seconds). Сумма `seconds` кусков каждой дорожки = `seconds` сцены. Обычно две дорожки: `desktop`
    (1920×1080) и `mobile` (HiDPI 780×1688) — тайминги у них разные.
  - `use.wide | use.tall | use.square = {track, crop?}` — какая дорожка в какой формат. `crop = {x, y, w, h}` —
    прямоугольник ИСХОДНОЙ записи, который обязан попасть в кадр целиком и как можно крупнее (зум). Без `crop` — запись целиком.
    Кусок может перекрыть кадрирование: `segments[i].crop = {wide?, square?}` (например, верх чата для 1-го вопроса, низ — для 2-го).
  - **9:16 показывает запись целиком** (правило серии): `crop` для `tall` запрещён, пока в конфиге нет `allowTallCrop: true`.
  - `note` — расхождение титра и кадра (переносится в `SCENARIO.md`).
- `{type: 'outro', seconds}` — последняя сцена, ровно одна.

Раскладка фиксирована шаблоном: 16:9 — запись сверху, титр снизу (18 %); 9:16 — титр сверху (15 %), запись ниже;
1:1 — титр сверху (30 %). Титр запись не перекрывает. Шрифт титров 54 px (16:9) / 5,6 % короткой стороны.
Титр длиннее ~70 знаков в 16:9 и ~45 в 9:16/1:1 займёт три строки — сократить.

Координаты `crop` проще всего снять с кадра записи:

```bash
docker run --rm --network none -v /home/dz-projects-2026/.promo-assets/<proj>:/a:ro -v /tmp/x:/o promo-render:2026-09-29 \
  ffmpeg -loglevel error -ss 12 -i /a/chat-desktop.webm -frames:v 1 /o/f.png     # смотреть /tmp/x/f.png
```

### 3. Записи

По [`../../capture/README.md`](../../capture/README.md): Playwright по ВЫДАННОМУ адресу стенда, desktop 1920×1080 штатным
`recordVideo`, mobile — `hidpi-recorder.mjs`. Файлы — в `/home/dz-projects-2026/.promo-assets/<proj>/` (вне git), в контейнер
монтируются как `/assets` только для чтения. Что нельзя показывать и лимиты платных вызовов — `SERIES.md`.

### 4. Рендер одной командой

```bash
REPRO=1 bash promo/remotion/shared/render.sh <proj>          # три формата + повтор 16:9 (sha256)
bash promo/remotion/shared/render.sh <proj> 1x1              # один формат (черновик)
```

Скрипт сам: `npm ci` в образе (если нет `node_modules`), сборка бандла, рендер каждого формата, страж, квитанция.
Всё — в `promo-render:2026-09-29`, `--cpus=2.5 --memory=4g --network none`, под `flock /home/dz-projects-2026/.promo-assets/render.lock`,
контейнеры `promo-<proj>-{install,bundle,16x9,9x16,1x1,16x9-repeat,probe}`. Флаги кодирования заданы ТОЛЬКО в `render.sh`
(H.264 High, `--crf=20`, `yuv420p`, bt709, `--concurrency=2`, кэш видео 512 МБ, Chromium из образа) — не менять в проекте.
Результат: `/home/dz-projects-2026/.promo-assets/<proj>/out/final/{16x9,9x16,1x1}.mp4`, журналы и `receipt.txt` — `logs/`.

Коды возврата: `0` — все форматы прошли страж, сторож хоста контейнеры не трогал · `1` — дефект доказан (в выводе названо
поле, файл или контейнер) · `2` — проверка НЕ выполнена (нет образа, записей, журнала сторожа или имя контейнера занято).
`2` никогда не значит «готово».

Контрольные кадры до полного рендера (≈ 1 мин вместо ≈ 5):

```bash
docker run --rm --name promo-<proj>-stills --cpus=2.5 --memory=4g --network none -e PROMO_PROJECT=<proj> \
  -v "$(pwd)/promo/remotion:/work" -v /home/dz-projects-2026/.promo-assets/<proj>:/assets:ro \
  -v /home/dz-projects-2026/.promo-assets/<proj>/out/final:/out -w /work promo-render:2026-09-29 bash -c \
  'bash shared/scripts/in-container.sh bundle /out/bundle-dev && for id in promo-16x9 promo-9x16 promo-1x1; do
     bash shared/scripts/in-container.sh stills /out/bundle-dev $id /out/stills 60 250 600 820 1000 1250; done'
# смотреть out/final/stills/promo-*-sheet.png
```

Сломанный конфиг (сумма ≠ 45 с, нет дорожки, `crop` за краем записи, пустой титр, кадрирование 9:16) бандл ещё
собирает (webpack модуль не исполняет), но первый же кадр или рендер падает с сообщением `project.config.ts (<proj>): …`
в журнале `logs/<формат>.txt` — читать его, а не код. Испытано: конфиг на 46 с → `Error project.config.ts (zztest):
сцены дают 46 с, а нужно ровно 45`, код 1.

### 5. Критерий готовности

- `render.sh` вернул `0`; в `logs/receipt.txt` три строки `✅ … 1350 кадров 45.000000 с` и `✅ повтор 16:9 побайтно совпал`.
- Глазами просмотрены контрольные кадры всех трёх форматов: нет обрезанного интерфейса, текст не выходит за полосу.
- В папке проекта: `SCENARIO.md` (титры сцен для владельца + расхождения титра и кадра), `README.md` (одна команда,
  адреса и тайминги записей), `MEASUREMENTS.md` (из `receipt.txt`: сборка и рендер отдельно, пик памяти, sha256, сторож),
  `ITERATIONS.md` (каждая попытка с категорией: **инструмент / среда / исполнитель**, минуты, число платных вызовов).
- Коммиты `feat(promo)` / `docs(promo)` по-русски; mp4, записи и `node_modules` в git не класть.

## Что измеряет квитанция

| Строка `receipt.txt` | Что |
|---|---|
| `promo-<proj>-bundle TIME … MEMPEAK …` | сборка бандла webpack (кэш выключен — время не зависит от предыдущих запусков) |
| `promo-<proj>-<fmt> TIME … MEMPEAK … host_load1=…` | рендер формата из готового бандла: bash `time` (wall/user/sys) и `memory.peak` cgroup (Chromium + компоновщик + ffmpeg + файловый кэш, не RSS одного процесса) |
| `watchdog=clean` / `HIT` | перезапускал ли хостовый сторож `crypto-miner-watchdog` этот контейнер после его старта (журнал только читается) |
| `✅/❌ <файл>: …` | страж `scripts/probe.sh`: h264 High, yuv420p, tv/bt709, размер, 30/1, 1350 кадров, 45.000000 с |

Время ожидания блокировки в замер не входит (замер внутри контейнера).
