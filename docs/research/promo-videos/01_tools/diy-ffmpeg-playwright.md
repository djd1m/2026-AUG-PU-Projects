# DIY: Playwright-скринкаст + FFmpeg

Проверено: 2026-09-29. Всё без ссылки — «не проверено».

**Что это.** Собственный конвейер из скриптов: Playwright проходит сценарий на стенде и пишет видео/кадры; FFmpeg
склеивает, накладывает текст (`drawtext`), субтитры (`subtitles=`), звук; TTS и Whisper — внешние CLI.

**Что именно установлено (проверено локально 2026-09-29, круг 2) [5].**

| Компонент | Где | Что есть |
|---|---|---|
| Браузер | образ `mcr.microsoft.com/playwright:v1.60.0-noble` (3,43 ГБ) | Node v24.15.0, Chromium и headless shell 1223, Firefox, WebKit; **FFmpeg в PATH нет** — только служебная сборка `/ms-playwright/ffmpeg-1011` для записи видео |
| FFmpeg | **на хосте нет** (`which ffmpeg` пусто) | есть в образе N5 `n5-clipmaker-worker-video:latest`: FFmpeg **8.1.2**, фильтры `drawtext`, `subtitles`, `ass`, кодер `libx264`; Node v22.22.3 |
| Node на хосте | `/usr/bin/node` | v20.20.2 |
| Piper, Whisper | не установлены | Piper: исходный `rhasspy/piper` архивирован (MIT), продолжение `OHF-Voice/piper1-gpl` (GPL-3.0, push 2026-09-28) [3][4] |

Образ N5 — рабочий образ другого продукта: брать его для рендера промо — решение владельца (правило «не трогать
стенды»). Кириллические шрифты в образах не проверялись.

**Лицензия и цена.** Playwright — Apache-2.0 (не проверено в этой сессии); FFmpeg — LGPL/GPL в зависимости от
сборки; Piper1 — GPL-3.0 (используем как утилиту, свой код не распространяем). Плата за рендер — 0.

**Движок и требования.** CPU и Docker. Готового образа «браузер + FFmpeg + шрифты» нет: запись — в Playwright-образе,
сборка — в образе с FFmpeg. Скорость не измерена — до замера (как у всех кандидатов).

**Живой интерфейс.** Самый прямой путь: реальный стенд, реальные клики, реальные состояния. Ограничения записи
Playwright: «The video size defaults to the viewport size scaled down to fit 800x800» — размер надо задавать явно
(`recordVideo.size`); формат/битрейт/FPS документацией не описаны (по опыту — WebM среднего качества, не проверено).
Видео сохраняется при закрытии контекста. Есть аннотации действий (подсветка элементов). [1] Альтернатива для
качества — покадровые скриншоты или CDP screencast (не проверено).

**Русский TTS/субтитры.** Piper с голосами `ru_RU` (denis, dmitri, irina, ruslan) локально на CPU [2]; Whisper/
whisper.cpp для SRT; FFmpeg прожигает субтитры с кириллическим шрифтом (шрифт положить в образ).

**Форматы.** Три прогона Playwright с разными viewport (мобильный 9:16 — и мобильная вёрстка продукта сама по себе),
либо кроп/паддинг FFmpeg. Честные 9:16 требуют отдельной записи мобильного вида.

**Агентопригодность.** Агенты хорошо знают Playwright и FFmpeg; но нет «видео-DSL»: анимация титров и переходы на
фильтрах FFmpeg — хрупкие строки, ошибки непредсказуемы.

**Минимальный пример.**

```ts
import {chromium} from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: {width: 1920, height: 1080},
  recordVideo: {dir: 'out/rec', size: {width: 1920, height: 1080}},
});
const page = await ctx.newPage();
await page.goto(process.env.STAND_URL!);          // адрес стенда из окружения
await page.getByRole('button', {name: 'Начать'}).click();
await page.waitForTimeout(1500);
await ctx.close();                                  // видео пишется здесь
await browser.close();
```

```bash
ffmpeg -i out/rec/*.webm -i voice.wav -vf "subtitles=voice.srt:force_style='FontName=Inter'" \
  -c:v libx264 -crf 18 -c:a aac -shortest promo.mp4
```

**Ограничения.** Слабый моушн-дизайн и типографика; качество записи Playwright требует проверки; всё поддерживаем сами.
Практически этот слой нужен **в любом варианте** как источник экранов для HyperFrames/Remotion.

## Источники (проверено 2026-09-29)

1. https://playwright.dev/docs/videos
2. https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU
3. https://api.github.com/repos/rhasspy/piper — archived: true
4. https://api.github.com/repos/OHF-Voice/piper1-gpl — GPL-3.0
5. Локально 2026-09-29, только чтение: `which ffmpeg node`, `node --version`; `docker images`;
   `docker run --rm --entrypoint sh <образ> -c 'ffmpeg -version; ffmpeg -filters; ffmpeg -encoders; node --version; which ffmpeg'`
   для `playwright:v1.60.0-noble` и `n5-clipmaker-worker-video:latest`
