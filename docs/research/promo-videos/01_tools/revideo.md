# Revideo

Проверено: 2026-09-29. Всё без ссылки — «не проверено».

**Что это.** «Rendering engine for creating videos in code»: сцены на TypeScript (генераторы, как в Motion Canvas),
рендер программно из Node — в отличие от Motion Canvas есть headless-рендер и API для серверного рендера. Исторически
форк Motion Canvas (в текущем README не упомянуто — не проверено). Репозиторий переехал: `redotvideo/revideo` →
`midrender/revideo`. [1][2]

**Версия.** `@revideo/core` **0.11.0** от 2026-07-10; последний push 2026-07-15; ≈4,1 тыс. звёзд. Pre-1.0,
активность снизилась. [2][3]

**Лицензия и цена.** MIT, бесплатно. [1][3]

**Движок и требования.** Node + headless-браузер + FFmpeg; «runs anywhere Node and a headless browser run, including
serverless platforms like Google Cloud Run» — значит, Docker на CPU возможен. Скорость — не проверено. [1]

**Живой интерфейс.** Сцены на Canvas; экраны — как видео/изображения. [1] Путь встраивания DOM/React в README не
найден — не проверено.

**Русский TTS/субтитры.** `<Audio/>` с покадровой синхронизацией есть. [1] Встроенный TTS и готовый путь к
субтитрам по времени в README **не найдены — не проверено** (README не каталог возможностей, профильная документация
не просматривалась). Внешний Piper/Whisper доступен так же, как всем.

**Форматы.** Размер проекта задаётся параметрами (не проверено для мультиформата).

**Агентопригодность.** Типизированный TS; официальных навыков для агентов не найдено; меньше примеров, чем у
Remotion.

**Минимальный пример (из README [1]).**

```tsx
import {makeScene2D} from '@revideo/2d';
import {createRef, waitFor} from '@revideo/core';
import {RubiksCube} from './rubiks-cube';

export default makeScene2D('scramble', function* (view) {
  view.fill('#0d0d12');
  const cube = createRef<RubiksCube>();
  view.add(<RubiksCube ref={cube} size={620} />);
  yield* waitFor(0.5);
  yield* cube().scramble(18);
});
```

**Ограничения.** Смена организации репозитория, редкие коммиты с июля 2026, pre-1.0 — риск заброшенности.

## Источники (проверено 2026-09-29)

1. https://github.com/midrender/revideo — README
2. https://api.github.com/repos/redotvideo/revideo → редирект на `midrender/revideo`
3. https://registry.npmjs.org/@revideo/core
