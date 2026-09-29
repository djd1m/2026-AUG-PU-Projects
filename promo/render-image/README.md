# promo-render — среда рендера пилота N6

Производный образ от `mcr.microsoft.com/playwright:v1.60.0-noble` для рендера промо-роликов
([`../PILOT-N6.md`](../PILOT-N6.md)). Оба исполнителя (HyperFrames и Remotion) рендерят ТОЛЬКО в нём.

Тег: **`promo-render:2026-09-29`**.

## Что в образе (версии фактические, из `check.sh` от 2026-09-29)

| Компонент | Версия | Откуда |
|---|---|---|
| Node.js | v24.15.0 | база |
| Chromium / браузеры Playwright | chromium-1223 (Playwright 1.60) | база, `/ms-playwright` |
| Playwright CLI | 1.60.0 | `npm i -g playwright@1.60.0` (только CLI; в базе его нет, и `npx playwright` без него скачал бы последнюю версию из сети) |
| ffmpeg / ffprobe | 6.1.1-3ubuntu5 (пакет `7:6.1.1-3ubuntu5`, пин в apt) | apt noble; libx264 есть |
| Onest | Regular 400, Medium 500, SemiBold 600, Bold 700 — статические TTF | `@fontsource-variable/onest@5.3.1` (та же версия и integrity, что в `projects/06-rag-sales-chatbase/package-lock.json`) |
| DejaVu | `fonts-dejavu-core=2.37-8` | apt |
| Уже в базе | Liberation, FreeFont, Noto Color Emoji, IPA, WenQuanYi, Unifont | база |
| `HYPERFRAMES_NO_TELEMETRY` | `1` | `ENV` |
| Рабочий каталог | `/work` | `WORKDIR` |
| Пользователь | `root` — как в базе (`USER` в базе не задан; `pwuser` uid 1001 существует) | база |

**Onest: почему не просто скопировать woff2.** Fontsource раздаёт шрифт кусками по `unicode-range`
(cyrillic, latin, …), каждый — вариативный woff2. Браузеру этого хватает, а `ffmpeg drawtext` и fontconfig
берут ОДИН файл, и в кириллическом куске нет даже тире «—» (U+2014). Поэтому первая стадия сборки
([`fonts/build_onest.py`](fonts/build_onest.py)) проверяет sha512 пакета, делает статические экземпляры
насыщенностей из кусков latin, latin-ext, cyrillic, cyrillic-ext и сливает их в один TTF на насыщенность
(650 символов), отказывая, если в результате нет кириллицы или тире. Файлы: `/usr/local/share/fonts/Onest-{Regular,Medium,SemiBold,Bold}.ttf`,
лицензия OFL — `/usr/local/share/fonts/Onest-OFL-LICENSE.txt`. Проектам с HTML-рендером лучше подключать
Onest своим `@fontsource-variable/onest` (там `unicode-range` работает); системный — запасной путь и для ffmpeg.

## Размер и время

- Образ: **3,46 ГБ** (`docker image inspect` → 3 459 760 962 байт); база — 3 427 237 022 байт, прирост **+32,5 МБ**
  (ffmpeg всего 7 МБ: его библиотеки libav* уже есть в базе ради браузеров; CLI playwright 18 МБ; шрифты < 1 МБ).
- Сборка: **69 с** при уже скачанной базе (первая сборка, без кэша слоёв apt/шрифтов); с кэшем — 9 с.
  Скачивание самой базы (≈ 0,9 ГБ сжатого) в это время не входит.

## Сборка и проверка

```bash
bash promo/render-image/build.sh            # BuildKit, тег promo-render:2026-09-29, печатает время и размер
bash promo/render-image/check.sh            # 0 — всё есть · 1 — чего-то нет (названо) · 2 — проверка НЕ выполнена
bash promo/render-image/check.sh <образ>    # проверить другой образ
```

`check.sh` запускает разовый контейнер `--rm --network none --memory=4g --cpus=6` без портов и проверяет:
`node -v`, `ffmpeg`/`ffprobe`, `fc-list | grep -ciE "onest|dejavu|noto"` ≥ 3 (фактически 13), что Onest
зарегистрирован, `HYPERFRAMES_NO_TELEMETRY=1`, `npx --no-install playwright --version`, и тест-рендер 2 с
1920×1080 `drawtext` шрифтом Onest «Суфлёр — проверка кириллицы» → libx264 yuv420p → `ffprobe`.

Испытание «страж падает» (2026-09-29):

```text
check.sh promo-render:2026-09-29                     -> exit 0, «✅ всё есть»
check.sh mcr.microsoft.com/playwright:v1.60.0-noble  -> exit 1: нет ffmpeg, ffprobe, шрифтов (1 < 3), Onest,
                                                        HYPERFRAMES_NO_TELEMETRY, playwright CLI; тест-рендер пропущен
check.sh no-such-image:1                             -> exit 2, «образа нет — проверка НЕ выполнена»
```

Кадр тест-рендера просмотрен глазами: кириллица, «ё» и тире отрисованы Onest, без «тофу».

## Как запускать рендер

```bash
docker run --rm --memory=4g --cpus=6 \
  -v <абсолютный путь к проекту>:/work -w /work \
  promo-render:2026-09-29 <cmd>
# пример: ... promo-render:2026-09-29 bash -c 'npm ci && /usr/bin/time -v npx remotion render ...'
```

- **Никаких `-p`.** Рендеру порты не нужны; студии/превью HyperFrames и Remotion в этом образе не публиковать.
- Контейнер работает от `root`, файлы результата на хосте будут принадлежать `root`. Если нужен другой владелец —
  `--user "$(id -u):$(id -g)"` (тогда `HOME` не записываем: добавьте `-e HOME=/tmp` для кэша npm).
- Chromium под root требует `--no-sandbox`. Playwright по умолчанию запускает Chromium без песочницы; передают ли
  флаг HyperFrames и Remotion сами — **не проверено**, это первый вопрос исполнителя, если браузер не стартует.
- `npm ci` требует сети — `--network none` здесь не ставить; для замеров времени рендера сеть можно отключить
  вторым запуском после установки.

## Что НЕ включено

- hyperframes и remotion (и их зависимости) — ставятся исполнителями в свои проекты через `npm ci` с lockfile.
- Noto Sans/Serif (`fonts-noto-core`) — не нужен: кириллицу покрывают Onest, DejaVu, Liberation; из Noto в базе
  только Color Emoji.
- GPU-ускорение, аппаратные энкодеры, облачный рендер, музыка и записи экранов (они в
  `/home/dz-projects-2026/.promo-assets/n6/`, вне образа).
- Промежуточный кэш сборки: после сборки удалялись только записи СВОЕГО builder-кэша поштучно
  (`docker builder prune -f --filter id=<id>`); `docker system prune` и общий `builder prune` не применялись —
  кэш общий с другими проектами машины. Записи, на которые ссылается сам образ, не удаляемы (≈ 40 МБ).
