# OpenMontage

Проверено: 2026-09-29. Всё без ссылки — «не проверено».

## Что это и кто делает

Не движок рендера, а **оркестратор поверх движков**: набор инструкций (YAML-манифесты пайплайнов + Markdown-навыки) и
Python-инструментов, превращающий кодового агента в «студию». 12 пайплайнов (Animated Explainer, Screen Demo, Talking
Head, Clip Factory, Localization & Dub и др.). Автор — `calesthio` (GitHub), репозиторий создан 2026-03-29. [1][2]

## Версия, активность

- Релизов (GitHub Releases) **нет**; npm-пакета нет. Последний push 2026-09-06. [2]
- ≈61,8 тыс. звёзд, 7,9 тыс. форков; 2571 файл в дереве. [1][2][3]

## Лицензия и цена

- **AGPL-3.0**. [2]
- Движки внутри: Remotion (`remotion-composer`, `@remotion/*` ^4.0.484) и HyperFrames. **При рендере через Remotion
  действует лицензия Remotion** (порог 3 сотрудника, см. `remotion.md`). В README OpenMontage об этом не сказано. [3][4]
- Бесплатный путь: Piper TTS, стоковые Pexels/Pixabay (бесплатные ключи), Remotion/HyperFrames/FFmpeg. Платные
  провайдеры: Kling, Runway, Veo, Seedance, FLUX, Imagen, ElevenLabs, OpenAI TTS, Suno. [1]
- В манифесте screen-demo `budget_default_usd: 1.00` — **настройка бюджета**, а не доказанная стоимость прогона:
  расход агентов и выбранных провайдеров в неё не входит. [5]

## Движок и требования

- Python 3.10+, Node.js 18+ (для HyperFrames — 22+). GPU опционален (`make install-gpu` для локальной генерации
  видео); «CPU-only supported». Docker в README не описан. [1][4]

## Как в кадр попадает живой интерфейс

Пайплайн **Screen Demo v2.1**, режим `real_capture` — запись экрана (`screen_recorder`, `cap_recorder`,
`playwright-recording`) + выноски, зум, субтитры, чистка звука. Режим `synthetic_terminal` — только для терминала. [5]
Навык `playwright-recording` — `recordVideo` с размером 1920×1080. [6]

## Русская озвучка и субтитры

- TTS-инструменты: Piper (локально), ElevenLabs, OpenAI, Azure, Google, Fish Audio, Doubao и др. [3]
- У Piper есть русские голоса (denis, dmitri, irina, ruslan). [7] Качество на промо-тексте — не проверено.
- Субтитры SRT/VTT с пословным таймингом. [1]

## Форматы

Профили 16:9, 9:16, 21:9, 1:1. [1]

## Агентопригодность

Сделан для агентов (CLAUDE.md, AGENT_GUIDE.md, 700+ файлов навыков). Обратная сторона — объём: агенту нужно
загружать крупные инструкции, решения принимаются «продюсерскими» ролями с чекпоинтами, а не декларативным API.
Типизированного API нет — интерфейс это инструкции + Python-инструменты. [1][5]

## Минимальный пример

Кодового примера нет: вход — текстовый бриф агенту, дальше пайплайн. Рендер конечного шага (из `package.json`):

```bash
cd remotion-composer && npx remotion render src/index.tsx Explainer out/video.mp4
```

## Известные ограничения

- Нет релизов и версий — воспроизводимость только по хэшу коммита.
- Два слоя лицензий (AGPL + Remotion).
- Уклон в ИИ-генерацию футажа/изображений в ряде пайплайнов — риск «пластикового» вида; для лучшего качества README
  прямо называет платных провайдеров. Генерация при этом опциональна: режим `real_capture` пайплайна Screen Demo
  обходится без неё. [1][5]
- Для нашей задачи полезен как **источник рецептов** (screen-demo, playwright-recording), а не как зависимость.

## Источники (проверено 2026-09-29)

1. https://github.com/calesthio/OpenMontage — README
2. https://api.github.com/repos/calesthio/OpenMontage (+ `/releases/latest` → нет релизов)
3. https://api.github.com/repos/calesthio/OpenMontage/git/trees/main?recursive=1
4. https://raw.githubusercontent.com/calesthio/OpenMontage/main/README.md (строки про Remotion/HyperFrames, Python/Node)
5. https://raw.githubusercontent.com/calesthio/OpenMontage/main/pipeline_defs/screen-demo.yaml
6. https://raw.githubusercontent.com/calesthio/OpenMontage/main/.claude/skills/playwright-recording/SKILL.md
7. https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU
