# HyperFrames

Проверено: 2026-09-29. Всё без ссылки — «не проверено».

## Что это и кто делает

Открытый фреймворк «Write HTML. Render video. Built for agents»: композиция — обычный HTML-файл, тайминг задаётся
атрибутами `data-start` / `data-duration` / `data-track-index`, анимация — любой «перематываемый» рантайм (GSAP, CSS,
Lottie, Web Animations, Three.js). Рендер: headless Chrome покадрово + FFmpeg. Делает HeyGen (репозиторий
`heygen-com/hyperframes`, создан 2026-03-10). [1][2]

## Версия, активность

- npm `hyperframes` **0.8.90**, опубликован 2026-09-29 02:43 UTC; GitHub release v0.8.90 того же дня. [3][4]
- Pre-1.0; 29.09 вышло четыре релиза за сутки (0.8.87–0.8.90). Темп высокий — версию нужно закреплять. [5]
- ≈53,9 тыс. звёзд, последний push 2026-09-29. [4]

## Лицензия и цена

- **Apache-2.0** (npm и GitHub). Ограничений по размеру компании нет. [3][4]
- Локальный рендер бесплатен; **аккаунт HeyGen не нужен**: «You can create and render locally without an account». [6]
- Платное — только опционально: облачный рендер HeyGen, HeyGen-голоса/музыка, ElevenLabs, Lyria, OpenRouter/Gemini
  для описаний захвата. Цены облака не найдены — не проверено. [6][7]
- **Телеметрия включена по умолчанию** (круг 2). Собирает имена команд, производительность рендера, имена ошибок,
  системную информацию («coarse environment fingerprint: OS, kernel string, CPU and memory shape, sandbox runtime such
  as gVisor or Docker») и имя агента (`claude_code`, `codex`, `cursor`). После `hyperframes auth login` к аккаунту
  привязывается и прежняя анонимная история. Выключение: `npx hyperframes telemetry disable`,
  `HYPERFRAMES_NO_TELEMETRY=1` или `DO_NOT_TRACK=1`; при этом установка выходит из canary-раскаток. [7]

## Движок и требования

- Node.js: README требует **22+**, страница CLI называет минимум v18 — источники расходятся, ориентируемся на
  строгий (22+). FFmpeg + FFprobe обязательны; «7.x» — пример из вывода `doctor`, **не доказанный минимум**. Chrome
  встроенный или системный, ≥2 ГБ диска под кэш кадров. GPU не требуется; `--gpu` только ускоряет кодирование. [2][7]
- **Честный путь на этом VPS** (круг 2). На хосте Node 20 и нет FFmpeg — CLI на хосте не запускаем. `--docker` не
  решает проблему: его тоже исполняет CLI, которому нужен Node 22+ (что он делает на Node 20 — не проверено). Путь —
  исполнять сам CLI **внутри разрешённого контейнера** `mcr.microsoft.com/playwright:v1.60.0-noble`. Проверено
  2026-09-29 локально: в нём Node **v24.15.0** и Chromium/headless shell 1223, но **FFmpeg в PATH нет** (есть только
  служебная сборка Playwright `/ms-playwright/ffmpeg-1011` для записи). Значит, нужен производный образ «playwright +
  apt ffmpeg» — это изменение окружения, решение за владельцем. [13]
- `--workers 1–24`, «each is a separate Chrome, roughly 256 MB» — память делится со стендами
  (на 2026-09-29 доступно около 5 ГБ из 11), поэтому 2–4 воркера под `--memory` (оценка, не проверено). [7]
- Скорость рендера 60 с ролика на CPU: цифр в документации не найдено — **не проверено, мерить пилотом**. Есть команда
  `benchmark`. [7]

## Как в кадр попадает живой интерфейс

- Композиция сама является веб-страницей: CSS-токены наших продуктов (N5/N6 — свой CSS) переносятся в сцену как есть.
- `npx hyperframes capture <url>` вытягивает скриншоты, ассеты, шрифты и секции с живого сайта для сборки сцены. [7]
- Руководство «product or website video»: экраны «captured from … not mocked», но «A raw screen recording is not the
  default» — анимируются захваченные материалы. Работу с авторизацией и localhost документация не описывает — не
  проверено. [8]
- Запись Playwright (`.webm/.mp4`) вставляется как обычный `<video>`-клип. [2]
- **Граница (круг 2):** `capture` переносит **оформление** (экраны, ассеты, шрифты), а не интерактивный сценарий.
  Клики, авторизация и потоковый ответ чата N6 приходят только из внешней записи — **не проверено, пилот**.

## Русская озвучка и субтитры

- `npx hyperframes tts`: провайдеры HeyGen / ElevenLabs / Kokoro (локально). **Kokoro-82M русского не поддерживает**:
  локали «en-us, en-gb, es, fr-fr, hi, it, pt-br, ja, zh». [7][9]
- Значит, русский голос — либо платный провайдер (ElevenLabs/HeyGen), либо внешний WAV (например Piper, у которого
  есть голоса `ru_RU` denis/dmitri/irina/ruslan [10]) через `<audio>`.
- `npx hyperframes transcribe` — Whisper с пословными метками, поуровневые/караоке-субтитры. Русский в Whisper есть;
  на нашем материале не проверено. [7][9]

## Форматы 9:16 / 16:9 / 1:1

`data-width`/`data-height` на корне; `init --resolution` (landscape, portrait, 4k). «Variables and templating» —
именованные слоты и повторный рендер одной композиции с другими значениями. Три формата из одного исходника — через
переменные размера и адаптивную вёрстку; готового «multi-aspect» флага не найдено — не проверено. [7][11]

## Агентопригодность

- Официальные навыки: `claude plugin install hyperframes@hyperframes` или `npx skills add heygen-com/hyperframes`,
  21 навык, роутер `/hyperframes`. Есть плагин для Codex. [2]
- `lint` (без браузера), `check` (браузерный гейт: runtime, layout, motion, contrast), `snapshot`, `keyframes`,
  `compare` — дают агенту машинную обратную связь до рендера. [7]
- `llms.txt` с полным индексом документации; руководство по переносу с Remotion. [11]

## Минимальный пример (из документации [12])

```html
<div id="stage" data-composition-id="title-card" data-start="0"
     data-width="1280" data-height="720" data-duration="3" data-fps="30">
  <div id="card" style="position:absolute; inset:0; display:grid; place-items:center;"
       data-start="0" data-duration="3" data-track-index="0">
    <div id="title">HELLO</div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.to("#title", { opacity: 1, duration: 0.5, ease: "none" }, 0);
  tl.to("#title", { opacity: 0, duration: 0.5, ease: "none" }, 2.5);
  window.__timelines = window.__timelines || {};
  window.__timelines["title-card"] = tl;
</script>
```

Рендер: `npx hyperframes render --output final.mp4` (`--docker` для воспроизводимости). [7]

## Известные ограничения

- Анимация обязана быть перематываемой (адаптеры GSAP/CSS/Lottie); «живые» таймеры и сетевые запросы в сцене ломают
  детерминизм. [2]
- Pre-1.0 и несколько релизов в сутки — риск поломок при обновлении. [5]
- Локального русского TTS «из коробки» нет. [9]
- Node 22+ против Node 20 на хосте; в разрешённом контейнере нет FFmpeg. [2][13]
- Телеметрия по умолчанию включена — для воспроизводимого окружения выключать явно. [7]

## Источники (проверено 2026-09-29)

1. https://github.com/heygen-com/hyperframes — README
2. https://github.com/heygen-com/hyperframes — README, раздел skills, требования
3. https://registry.npmjs.org/hyperframes — версия, дата, лицензия
4. https://api.github.com/repos/heygen-com/hyperframes (+ `/releases/latest`)
5. https://github.com/heygen-com/hyperframes/releases
6. https://hyperframes.heygen.com/guides/authentication.md
7. https://hyperframes.heygen.com/packages/cli
8. https://hyperframes.heygen.com/guides/product-launch-video.md
9. https://hyperframes.heygen.com/packages/cli — раздел TTS (список локалей Kokoro)
10. https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU
11. https://hyperframes.heygen.com/llms.txt
12. https://hyperframes.heygen.com/guides/hyperframes-vs-remotion.md
13. Локальная проверка 2026-09-29 (только чтение): `node --version` на хосте → v20.20.2, `which ffmpeg` → пусто;
    `docker run --rm --entrypoint sh mcr.microsoft.com/playwright:v1.60.0-noble -c 'node --version; which ffmpeg; ls /ms-playwright'`
    → v24.15.0, ffmpeg не найден, `chromium-1223 chromium_headless_shell-1223 ffmpeg-1011 …`
