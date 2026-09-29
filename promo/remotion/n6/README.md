# Ролик N6 «Суфлёр» на Remotion — исполнитель пилота

Постановка — [`../../EXECUTOR-BRIEF.md`](../../EXECUTOR-BRIEF.md), протокол — [`../../PILOT-N6.md`](../../PILOT-N6.md).
Замеры — [`MEASUREMENTS.md`](MEASUREMENTS.md), журнал попыток — [`ITERATIONS.md`](ITERATIONS.md).

**Лицензия Remotion:** Company License требуется, если владелец — компания от 4 человек; пилот считает по худшему сценарию.

## Воспроизвести одной командой

```bash
bash promo/remotion/n6/render.sh          # REPRO=1 — ещё раз 16:9 для сверки sha256
```

Скрипт с хоста только запускает контейнеры `promo-render:2026-09-29` (без портов): при отсутствии
`node_modules` — `npm ci` c сетью (`--network bridge`), затем каждый формат — отдельный контейнер
`--network none --memory=4g --cpus=2.5` под `flock /home/dz-projects-2026/.promo-assets/render.lock`.
`--cpus=2.5` — поправка протокола: хостовый `crypto-miner-watchdog.sh` перезапускает контейнер с CPU > 300 %; под 2,9 он однажды намерил 301 %.
Флаги рендера: `--codec=h264 --pixel-format=yuv420p --color-space=bt709 --crf=20 --concurrency=2
--offthreadvideo-cache-size-in-bytes=536870912` (без `bt709` получается `yuvj420p`, без предела кэша — OOM в 4 ГБ).
Результат: `/home/dz-projects-2026/.promo-assets/n6/out/remotion/{16x9,9x16,1x1}.mp4`, журналы — `logs/`.
Контрольные кадры для просмотра: `bash scripts/in-container.sh stills <id> /out/stills <кадр…>` в том же контейнере.

## Устройство

| Файл | Что |
|---|---|
| `src/Root.tsx` | три `<Composition>` (`n6-16x9` 1920×1080, `n6-9x16` 1080×1920, `n6-1x1` 1080×1080) над ОДНИМ компонентом `<Promo layout>` — без копипасты сцен |
| `src/timeline.ts` | сцены (0–5–15–30–38–45 с, 1350 кадров при 30 fps), куски записей с ускорением и кадрированием по раскладке; проверки сумм кадров при загрузке (не сошлось — рендер падает, а не обрезает) |
| `src/Promo.tsx` | титульные сцены, сцены с записями (`<OffthreadVideo>` прямо из `.webm`, `trimBefore` + `playbackRate`), полоса титра |
| `public/fonts/` | Onest Regular/SemiBold/Bold из образа (OFL, лицензия рядом), подключение `@remotion/fonts` `loadFont` — при ошибке загрузки рендер падает, а не подменяет шрифт |
| `public/rec` | симлинк на `/assets` (записи монтируются только для чтения; в git — только ссылка) |
| `scripts/in-container.sh` | один рендер/кадр внутри образа; время — bash `time`, память — `/sys/fs/cgroup/memory.peak` |
| `install.sh` | `npm ci` внутри образа, время и размер `node_modules` |

- **Браузер:** Chromium из образа — `--browser-executable=/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`
  (документированный флаг CLI). Remotion свой Chrome Headless Shell не скачивал: рендер работает с `--network none`.
- **`--no-sandbox` под root:** ничего делать не пришлось — `@remotion/renderer` 4.0.529 всегда передаёт
  `--no-sandbox --disable-setuid-sandbox` (`node_modules/@remotion/renderer/dist/open-browser.js`); отдельной опции нет и не нужна.
- **Видео:** `.webm` (VP8) читаются `<OffthreadVideo>` напрямую, перекодировка в mp4 не понадобилась.
- **Музыка:** нет (ролик без звука; аудиодорожки в mp4 нет) — осознанно, CC0-трек не подбирался.
- **Сцена 4:** экрана установки нет (нужен вход) — в кадре окно чата предпросмотра с бейджем «Работает на Суфлёре»
  (`widget-*.webm`), а НЕ строка `<script>`; титр «Одна строка кода — и бот на вашем сайте.» оставлен по постановке.
- **Сцена 3:** титр «Чего нет на сайте — не выдумывает.» без слова «контакт» (у бота предпросмотра контакт не задан).
- 16:9 и 1:1 собраны из desktop-записей (кадрирование `cover` + приближение к окну чата), 9:16 — из mobile-записей (`contain`).
