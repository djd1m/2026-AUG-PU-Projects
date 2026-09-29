# MoviePy

Проверено: 2026-09-29 (добавлено в круге 2 по ревью Codex). Всё без ссылки — «не проверено».

**Что это.** Python-библиотека монтажа: клипы видео/аудио/изображений/текста, композиция, эффекты, запись файла.
Работает на NumPy и FFmpeg. Автор — Zulko, сообщество. [1][2]

**Версия, активность.** PyPI `moviepy` **2.2.1**, загружен 2025-05-21 — последний релиз (16 мес. назад). Ветка 2.x
с breaking changes относительно 1.x. Последний push 2026-08-26, ≈14,9 тыс. звёзд, 87 открытых issue+PR. [2][3]

**Лицензия и цена.** MIT, бесплатно. [2][3]

**Движок и требования.** Python + NumPy + FFmpeg («automatically downloaded/installed by ImageIO during your first
use», путь переопределяется `FFMPEG_BINARY`). Pillow — опционально. GPU не упоминается, вычисления на CPU.
Минимальная версия Python на странице установки не названа. [4] В разрешённом Playwright-образе Python и FFmpeg в PATH
не проверялись/отсутствуют (см. `diy-ffmpeg-playwright.md`) — нужен образ с Python. Скорость — до замера.

**Как в кадр попадает живой интерфейс.** Только готовые записи/скриншоты (`VideoFileClip`, `ImageClip`) от внешнего
захвата. Встраивания DOM/React нет. [1]

**Русская озвучка и субтитры.** Аудио — `AudioFileClip` (внешний Piper). `TextClip` принимает путь к шрифту TTF —
кириллица зависит от шрифта. [1] Готовый класс субтитров по SRT (`SubtitlesClip` в `moviepy.video.tools`) — в этой
сессии не проверен.

**Форматы 9:16 / 16:9 / 1:1.** Размеры задаются параметрами клипов и композиции; три формата — три прогона скрипта
с разными размерами (не проверено).

**Агентопригодность.** Документированный Python API с примерами; агентских навыков и типизированной проверки до
рендера нет. Лучше строк фильтров FFmpeg по сопровождаемости; по скорости и дизайну преимущество не установлено.

**Минимальный пример (из документации [1]).**

```python
from moviepy import *

clip = VideoFileClip("long_examples/example2.mp4").subclipped(10, 20)
clip = clip.with_volume_scaled(0.8)

txt_clip = TextClip(
    font="example.ttf", text="Big Buck Bunny", font_size=70, color="white"
)
txt_clip = txt_clip.with_position("center").with_duration(10)

video = CompositeVideoClip([clip, txt_clip])
video.write_videofile("result.mp4")
```

**Известные ограничения (из документации [1]).** Не оптимизирован для покадрово тяжёлой обработки; ограничения по
памяти при 100+ одновременных источниках; моушн-дизайн и типографика — уровня текстовых оверлеев.

## Источники (проверено 2026-09-29)

1. https://zulko.github.io/moviepy/getting_started/quick_presentation.html
2. https://pypi.org/pypi/moviepy/json
3. https://api.github.com/repos/Zulko/moviepy
4. https://zulko.github.io/moviepy/getting_started/install.html
