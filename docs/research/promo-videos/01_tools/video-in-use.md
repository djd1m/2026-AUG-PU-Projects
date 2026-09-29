# «video in use» — опознание

Проверено: 2026-09-29. **Статус (круг 2): предположительно browser-use/video-use — правдоподобная гипотеза, не
подтверждена.** Ссылки от владельца нет; совпадают только название и контекст кодовых агентов.

## Гипотезы — все четыре остаются вопросом владельцу

Пригодность для задачи не определяет, что имел в виду владелец, поэтому альтернативы не отбрасываются.

| # | Кандидат | Совпадение с «video in use» | Класс | Статус |
|---|---|---|---|---|
| 1 | **browser-use/video-use** | почти дословно («video use»), вышел в 2026, популярен, связан с Claude Code и Codex | монтаж готового футажа агентом + генерация оверлеев | правдоподобная основная гипотеза |
| 2 | npm `video-use` 0.1.1 (2026-05-06) | имя совпадает дословно | «MCP server + CLI to download videos and extract key frames» | альтернатива |
| 3 | VideoDB / Director | «video» + агенты | облачная видео-БД + фреймворк агентов (MIT), инфраструктура VideoDB платная | альтернатива |
| 4 | Vidu (ShengShu) | созвучие | облачная генеративная модель видео, API | альтернатива; класс «не-код», см. `no-code-services.md` |

Источники гипотез: [1][5][6][7].

## Карточка основной гипотезы: browser-use/video-use

**Что это.** «Edit videos with coding agents»: кладёшь сырой футаж в папку, общаешься с Claude Code, получаешь
`final.mp4`. Делает команда browser-use. Репозиторий создан 2026-04-12. [1][2]

**Версия.** Релизов нет, 22 коммита в main, последний push 2026-09-24; ≈27,5 тыс. звёзд. [1][2]

**Лицензия и цена.** MIT. **Обязателен ключ ElevenLabs** (Scribe — транскрипция с пословными метками); стоимость по
тарифу ElevenLabs, в README не указана. [1]

**Движок.** FFmpeg + Python (`uv sync`); опционально HyperFrames/Remotion/Manim/PIL для оверлеев. GPU не нужен. [1]

**Принцип.** Транскрибировать → упаковать в ~12 КБ markdown → LLM решает → EDL → рендер → самопроверка (до 3 кругов).
«The LLM never watches the video». [1]

**Что монтирует и что генерирует (по README, круг 2).** Монтирует «any content — talking heads, montages, tutorials,
travel, interviews — without presets or menus». Генерирует анимированные оверлеи: «HyperFrames, Remotion, Manim, or
PIL — spawned in parallel sub-agents, one per animation». Установка: «Paste into Claude Code, Codex, Hermes,
Openclaw, or any agent with shell access». [1]

**Живой интерфейс.** Собственного захвата приложения нет: экран продукта попадает только как готовая запись
(Playwright), поверх которой агент монтирует и добавляет оверлеи. [1]

**Русский.** TTS нет. Субтитры прожигаются (по умолчанию 2 слова КАПСОМ). Поддержка русского в Scribe заявлена
ElevenLabs — в этой сессии не проверено. [1]

**Форматы.** Не описаны — не проверено.

**Агентопригодность.** Навык для Claude Code и Codex (симлинк в `~/.claude/skills/video-use`), память сессии в
`project.md`. [1]

**Минимальный пример.** Кода нет — вход естественным языком:

```text
~/.claude/skills/video-use  ->  <repo>
videos/raw/*.mp4            ->  «убери паузы, добавь субтитры, 9:16»  ->  videos/edit/final.mp4
```

**Ограничения.** Центр инструмента — монтаж существующего футажа любого вида с оверлеями; экраны продукта он не
снимает. Для промо без исходного видео нужен внешний захват. Решения монтажа принимает LLM: повторный рендер по
сохранённому EDL и новое решение LLM — разные вещи; повторяемость нового прогона не проверена.

## Что уточнить у владельца

1. Какой из четырёх: `browser-use/video-use`, npm-пакет `video-use`, VideoDB/Director или Vidu? Или прислать ссылку.
2. Если `browser-use/video-use` — он не конкурент движкам сцен, а возможный финальный шаг монтажа поверх записей.

## Источники (проверено 2026-09-29)

1. https://github.com/browser-use/video-use — README
2. https://api.github.com/repos/browser-use/video-use
3. https://registry.npmjs.org/video-use
4. https://pypi.org/pypi/videodb/json — `videodb` 0.5.1; npm `videodb` 0.3.2 (2026-09-03)
5. https://github.com/video-db/Director
6. https://www.prnewswire.com/news-releases/shengshu-technology-lays-foundation-for-scalable-ai-video-generation-with-launch-of-vidu-api-offering-instant-access-and-industry-leading-speed-for-enterprises--developers-302375882.html
7. Поиск «video in use / video-use» 2026-09-29: форки `vodrls0-ai/video-use`, `aonizai/video-use` и др. — копии основного
