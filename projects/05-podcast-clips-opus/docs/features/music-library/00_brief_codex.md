# Постановка для Codex — фича 18 `music-library`: 11 треков вместо одного

Готовы фичи 1–17 (16 `music-bed`, 17 `pack-shot`), **653 теста зелёные** в образе. Стенд `https://clipmkr.ru`.
Работа идёт в автономном режиме владельца: решение A-2409-01 в `docs/decisions-autonomous.md`.

## Зачем

Сейчас каталог `MUSIC_TRACKS` из одного трека: все клипы всех записей звучат одинаково. Нужен
каталог из 11 треков и **детерминированный** выбор трека по клипу.

## Треки

Все — Komiku, альбом «Helice Awesome Dance Adventure !!», **тот же** альбом, что у действующего
трека; CC0 1.0 подтверждено двумя источниками (Internet Archive `Komiku-HeliceAwesomeDanceAdventure`,
`licenseurl` = CC0; Free Music Archive, «CC0 1.0 Universal»). Файлы уже лежат в
`apps/worker/assets/music/`. Отбор координатора: длительность ≥ 75 с (не зацикливать под самый
длинный клип), громкость первых 20 с в полосе 300–3400 Гц не ниже −21 LUFS (нет тихого вступления),
ни одного провала тишины > 1 с на −40 дБ.

| id | Трек | Длит. | sha256 |
|---|---|---|---|
| `komiku-everything-is-groovy` | «Everything is groovy» (трек 04) — действующий, остаётся ПЕРВЫМ | 116 с | 8ee1e5f475d0aeae548dc15d97fa967f0e5d5db72d8a7f605fecb2f5dd7f2f8d |
| `komiku-the-journey-begins` | «The journey begins» (трек 11) | 101 с | 3a7298ca305fda5f4b77dc14df1b6b0d9c7c3294dec806ca29539ea7e8ff9a67 |
| `komiku-road-1-fight` | «Road 1 Fight» (трек 13) | 107 с | 5115398ad1370cfa862306cc3b59a22a5f537e8a9d2a1a57761bb0aa110f6040 |
| `komiku-little-town-before-big-city` | «Little town before Big city» (трек 18) | 122 с | b6ba5a7e386cbb7fefd2cb8051eff7b9c847a0672e92c27b22585393a3d6edc8 |
| `komiku-road-3-fight` | «Road 3 Fight» (трек 20) | 106 с | b956814f178b345a009cccf8e311339074f8167a276c085cb2b8d2e71479358b |
| `komiku-road-4-chill` | «Road 4 Chill» (трек 25) | 88 с | eaecda0bc1a72bd38dee47e3e40c27b6627b10f5d328781199a4c7fb2d305ae3 |
| `komiku-cliff-road-fight` | «Cliff Road Fight» (трек 30) | 88 с | e2cde1c16d953533e6307d9feac4878b0a29d66d1febbf4bcf04cc8698936d17 |
| `komiku-pop-city` | «Pop City» (трек 32) | 96 с | 8bde21764ab786c422759fd88bb490c6986ac37860366afcc98f9cbeff1fe0d8 |
| `komiku-dance-with-two-or-more` | «Dance with two or more» (трек 36) | 134 с | 905eae2cb2d0b80ec063795455e667e08a06b95a5b39c43ef2862d6a567b8ae1 |
| `komiku-to-fight-a-spell-by-dancing` | «To fight a spell by dancing» (трек 39) | 115 с | 53542983e293c3b3474ded04c98ba5b7f03653e407e73418069c0d5224d73fc8 |
| `komiku-we-have-to-dance-together` | «We have to dance TOGETHER» (трек 41) | 138 с | 78400352ff85490fb1f971956933c26907a481892850a7fe2d07e795366283e8 |

## Что построить

1. `MUSIC_TRACKS` — 11 элементов в порядке таблицы, `komiku-everything-is-groovy` первым. Закрытый
   список в коде, без переменной окружения.
2. `getRenderInput` дополнительно отдаёт `c.index` (номер клипа в записи; колонка есть).
3. **Выбор трека:** `selectTrack(clipIndex) = MUSIC_TRACKS[((clipIndex % N) + N) % N]`, чистая
   функция с тестом. Неопознанный/нечисловой индекс → первый трек (fail-closed к известному
   значению, не исключение: музыка необязательна).
4. `prepareMusic` получает трек аргументом; замер громкости трека — по ВЫБРАННОМУ треку.
5. Контракт уже содержит `music: '<id>:<sha256>'` — проверить, что он строится из выбранного трека.
6. `apps/worker/assets/music/README.md` — таблица всех 11 треков: название, номер в альбоме,
   длительность, sha256, два источника лицензии.
7. Строка источников в `Uploader.tsx`: «Komiku — Helice Awesome Dance Adventure · Kenney — Sci-Fi Sounds, CC0».

## Инварианты, которые НЕ меняются

- `music=false` → аргументы ffmpeg и контракт побайтово прежние (`tests/fixtures/music-bed/baseline.json`).
- Клип с индексом, для которого выбран `MUSIC_TRACKS[0]`, даёт побайтово прежние аргументы и
  контракт (эталон `tests/fixtures/pack-shot/music-only.json` — там индекс считать 0 или 11×k).
- RD-001, SL-008, все стражи Г-1…Г-3 и пэк-шота.

## ОБЯЗАТЕЛЬНЫЕ правки после VALIDATE (перекрывают текст выше)

Проверка плана (Anthropic): READY WITH FIXES. Ассеты сверены: 11 sha256 и длительности совпадают.

1. **[high] `clip.index` начинается с 1** (`001_init.sql:48`, `CHECK ("index" > 0)`). Выбор —
   `selectTrack(index - 1)`: первый клип каждой записи получает `komiku-everything-is-groovy`, как и
   раньше. Во ВСЕ моки `getRenderInput` в эталонных тестах добавить явный `index: 1`. Новый тест через
   `handleRenderJob` с `index: 2`: контракт и `-i` содержат `MUSIC_TRACKS[1]`. Мутация «индекс не
   передаётся» → красный.
2. **[high] Путь трека в аргументах ffmpeg.** `ffmpeg.ts` сейчас берёт `-i MUSIC_TRACKS[0].path`
   отдельно от `prepareMusic`. `prepareMusic` возвращает выбранный трек (или путь), и `-i` берёт его
   ОТТУДА. Мутация «`-i` = `[0]` при выбранном `[k]`» → красный в `tests/music.test.ts`.
3. **[medium] Сквозная передача индекса:** поле `clipIndex` в `RenderOptions`, `index: number` в
   `RenderInput`, передача в `handleRenderJob`.
4. **[medium] Fail-closed для нецелых:** `Number.isSafeInteger(i) ? … : MUSIC_TRACKS[0]`; в тест —
   `1.5`, `'3'`, `Infinity`, `NaN`, `-1`, `undefined`.
5. **[medium] Обновить цели мутаций** `off-input` и `catalogue` в `tests/run-music-mutations.mjs` и те
   же строки в `tests/run-pack-shot-mutations.mjs`, чтобы старые мутации продолжали проверять.
6. **[low] Разрешено** обновить точное ожидание строки источников в `tests/pack-shot-uploader.test.ts`
   на новую — точным сравнением, не поиском подстроки.
7. **[low] Медиа-страж на двух треках** — через настоящий выбор по индексу (например `index: 1` и
   `index: 5`), а не через `MUSIC_TRACKS[0]`/`[1]` напрямую.

## Тесты

| Страж | Что проверяет | Внедряемый дефект → ожидание |
|---|---|---|
| каталог | 11 файлов существуют, sha256 совпадает, длительность каждого ≥ 75 с (ffprobe) | подменить один хеш → красный |
| выбор | индексы 0…21 дают каждый трек ровно дважды; одинаковый индекс → одинаковый трек; `NaN`, `-1`, `undefined` → определённый трек без броска | всегда `[0]` → красный |
| замер по выбранному | `measureLoudness` для трека вызван с путём ВЫБРАННОГО трека | мерить `[0]` → красный |
| контракт | разные индексы → разные контракты; `index=0` → эталон `music-only.json` | фиксированный id → красный |
| медиа | хотя бы на двух разных треках настоящий рендер даёт `music_mix` и выполняет Г-2/Г-3 | — |

Мутации обеими строками, скрипт по образцу `tests/run-pack-shot-mutations.mjs`. Прогон — `npx vitest run`
по затронутым файлам (Docker тебе недоступен — не повод для `failed`).

## Границы

НЕ меняй уровень (18 LU, 3 LU), вспышку, пэк-шот, схему БД, процедуры. НЕ правь `docs/` кроме отчёта.

## Отчёт

`docs/features/music-library/07_code_report.md`; последняя строка — ровно `Status: completed` либо `Status: failed`.
