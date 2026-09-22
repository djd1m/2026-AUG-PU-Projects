# Интеграционная проверка фичи 6 `render-and-watermark`

`Test Files 38 passed (38)` · `Tests 299 passed (299)` · `EXIT=0` — с первого раза, без раунда
исправлений. 22.09.2026, профиль `test`, изолированный стек, `--build`.

## Переиспользование — проверено СРАВНЕНИЕМ КОДА, не чтением отчёта

`.reference/jan-clone/apps/worker/lib/ffmpeg.ts` — 21 экспорт. Доехало по именам **15**:
`buildFilterChain`, `buildWatermarkDrawtext`, `ClipFormat`, `escapeAssText`, `escapeDrawtext`,
`escapeFFmpegPath`, `execFFmpeg`, `formatASSTimecode`, `FORMAT_DIMENSIONS`, `generateSubtitleFile`,
`generateThumbnail`, `getScaleFilter`, `renderClip`, `SubtitleSegment`, `wrapSubtitleText`.

Не переехали ровно шесть, и все шесть — по прямому указанию постановки: `CTA`,
`buildCtaOverlayFilter`, `generateCtaEndCard`, `concatClipAndCta` (CTA в неделю не входит) плюс
`extractAudio` и `ffprobeGetDuration` — они уже перенесены фичами 4 и 3, вторая копия была бы
дефектом. **Расхождений с постановкой нет ни в одну сторону.**

## Чего НЕ доказывает

- **Ни один настоящий файл не отрендерен.** Тесты проверяют сборку цепочки фильтров, порядок слоёв
  и расчёт геометрии метки — но не выход ffmpeg на реальном видео.
- **Читаемость метки на телефоне не проверялась и не автоматизируется** (`testing.md`): два человека
  смотрят пять клипов с руки на экране ≈6 дюймов. Расчёт ширины говорит, что метка ТЕПЕРЬ помещается
  в две строки; видно ли её глазом — отдельный вопрос.
- **Ревью семейством Anthropic не проводилось** — как и у фич 3–5. Зелёные тесты написал автор кода.
- NFR-PERF-001 (час за 20 минут) не измерялся.

Status: completed
