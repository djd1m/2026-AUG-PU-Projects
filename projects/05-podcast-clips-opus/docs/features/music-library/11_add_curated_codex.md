# music-library — 8 треков, отобранных владельцем на слух (OWN-014)

Файлы уже лежат в `apps/worker/assets/music/`. Сделать ровно это:

1. `MUSIC_TRACKS` — 9 элементов: `komiku-everything-is-groovy` ПЕРВЫМ (эталоны не меняются),
   затем в порядке таблицы:

| id | Трек | Длит. | sha256 | Страница трека (лицензия CC0 1.0) |
|---|---|---|---|---|
| `holizna-bubbles` | «Bubbles ( Lofi , Bright , Relaxed )» (альбом `public-domain-lofi`) | 148 с | 73efb557d8cfcca0f5cf3b435d3a0157bf9a702115b55266b8a2529f3997b542 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/bubbles-lofi-bright-relaxed/ |
| `holizna-tranquil-mindscape` | «Tranquil Mindscape ( Lofi , Happy , Reflection )» (альбом `public-domain-lofi`) | 154 с | 488d9693c13e44c5213c0647ee89ea91b21e17d9ac602225a78ee089720134c0 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tranquil-mindscape-lofi-happy-reflection/ |
| `holizna-walking-away` | «Walking Away ( Lofi , Peaceful , Motivating )» (альбом `public-domain-lofi`) | 156 с | fd8a618a4076b76f02f69414d6beb4ad7ddf3b8c26164085bd6dc1a9fd2f7610 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/walking-away-lofi-peaceful-motivating/ |
| `holizna-doodles` | «Doodles ( LoFi , Happy )» (альбом `public-domain-lofi`) | 138 с | 84db72387b14fa51294ba76a0bb3f72f39172527e5eb7964da8567596561ae72 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/doodles-lofi-happy-mp3/ |
| `holizna-one-good-day` | «One Good Day» (альбом `public-domain-lofi`) | 129 с | dd6f973da34bad28bc16b794601b952bd1506472ed7fb979b3e41369bd831427 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/one-good-day-1/ |
| `holizna-warm-fuzz` | «Warm Fuzz ( LoFi , Retro )» (альбом `public-domain-lofi`) | 173 с | 974ffd083b09aecbe60412f3376db07fb241adbbb0abf89698a22229a2de02c6 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/warm-fuzz-lofi-retro/ |
| `holizna-roof-tops` | «Roof Tops» (альбом `summer-air-lo-fi`) | 214 с | f6e619fbfdc0898c409494d5c810d34d9cd29be2b75bb2d8c197e1edb37155b5 | https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/roof-tops/ |
| `holizna-ocean-memory` | «Ocean Memory» (альбом `ocean-memory-lo-fi-chill`) | 151 с | 6121e8621b6d7894ba413b502092e7a57c74772021a5220f1dee354d7d496276 | https://freemusicarchive.org/music/holiznacc0/ocean-memory-lo-fi-chill/ocean-memory/ |

2. `apps/worker/assets/music/README.md` — все 9 треков: название, автор, альбом, длительность,
   sha256, страница трека, лицензия; и строка: «CC0 подтверждён на страницах трека и альбома на Free
   Music Archive и в биографии автора; независимого источника вне FMA нет — принято владельцем
   (OWN-014). У автора есть релизы НЕ под CC0 — лицензию проверять у каждого трека».
3. Тест каталога: ровно 9, порядок id, sha256 и длительность ≥ 75 с каждого (ffprobe). Тесты выбора
   остаются на тестовом каталоге. Мутацию `catalogue` нацелить на sha256 одного из новых треков.
4. Строка источников в `Uploader.tsx`: «Komiku, HoliznaCC0 — музыка CC0 · Kenney — Sci-Fi Sounds, CC0».

Прогон: `npx vitest run` по затронутым файлам + мутация `catalogue`. Не коммить. Отчёт —
`docs/features/music-library/12_curated_report.md`, последняя строка `Status: completed`/`failed`.
