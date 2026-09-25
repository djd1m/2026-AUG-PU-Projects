# Фичи «КлипМейкера» — указатель

Все двадцать одна — `done` на 25.09.2026 (16–21 добавлены 24–25.09). Двенадцать — MVP по плану; три появились после первого живого
прогона 23.09.2026 и в замороженной спецификации отсутствуют (их требования —
`../Specification-addendum.md`).

У каждой фичи есть постановка `00_brief_codex.md` (исполнитель — Codex, семейство OpenAI) и отчёты
исполнителя; ревью — семейство Anthropic (`../reviews/`). В столбце «Доказательство» — **последний**
отчёт или квитанция фичи: он описывает итоговое состояние, включая мутации обеими строками и то, что
фича НЕ доказывает.

| № | Фича | Что делает | Приоритет | Доказательство |
|---|---|---|---|---|
| 1 | `foundation` | Монорепо, схема БД, отказ старта при ненастроенной конфигурации, вход по почте | mvp | [10_fix_report.md](foundation/10_fix_report.md) |
| 2 | `upload-and-quota` | Приём загрузки, идемпотентность и шесть ключей квоты | mvp | [13_fix_report.md](upload-and-quota/13_fix_report.md) |
| 3 | `queue-and-probe` | Очередь с фенсом попыток, probe длительности и сторож | mvp | [11_integration_verdict.md](queue-and-probe/11_integration_verdict.md) |
| 4 | `transcription` | Транскрипция с таймкодами слов, чанкинг и журнал расхода | mvp | [21_fix_report_word_order.md](transcription/21_fix_report_word_order.md) |
| 5 | `selection-and-score` | Выделение 3–8 самодостаточных фрагментов и объяснённая оценка | mvp | [10_fix_report.md](selection-and-score/10_fix_report.md) |
| 6 | `render-and-watermark` | Кроп 9:16, вшитые субтитры и метка free с короткой ссылкой | mvp | [11_integration_verdict.md](render-and-watermark/11_integration_verdict.md) |
| 7 | `progress-and-clips-screen` | Экран прогресса с тремя состояниями и экран клипов | mvp | [10_fix_report.md](progress-and-clips-screen/10_fix_report.md) |
| 8 | `short-link` | Короткая ссылка /c/{code} и счётчик уникальных переходов | mvp | [16_fix_report.md](short-link/16_fix_report.md) |
| 9 | `guest-pack` | Клипы для гостя: галочки, согласие, гостевая страница без входа | mvp | [07_code_report.md](guest-pack/07_code_report.md) |
| 10 | `partner-codes-and-dashboard` | Коды блогеров, атрибуция трёх источников, кабинет и анти-фрод | mvp | [07_code_report.md](partner-codes-and-dashboard/07_code_report.md) |
| 11 | `limits-ui-and-pro-interest` | Понятные отказы по потолкам и экран интереса «Pro скоро» | mvp | [07_code_report.md](limits-ui-and-pro-interest/07_code_report.md) |
| 12 | `retention-and-erasure` | Срок хранения клипов, истечение гостевой страницы и удаление аккаунта | mvp | [10_fix_report.md](retention-and-erasure/10_fix_report.md) |
| 13 | `transcript-tolerance` | Погрешность таймкодов исправляется, а не отвергает запись | post-mvp | [05_completion.md](transcript-tolerance/05_completion.md) |
| 14 | `framing` | Кадр следует за лицом | post-mvp | [05_completion.md](framing/05_completion.md) |
| 15 | `subtitles-and-glossary` | Субтитры без мигания, крупнее, английские термины латиницей | post-mvp | [05_completion.md](subtitles-and-glossary/05_completion.md) |
| 16 | `music-bed` | Фоновая CC0-музыка по галочке, уровень из речи клипа | post-mvp | [05_completion.md](music-bed/05_completion.md) |
| 17 | `pack-shot` | Финальный акцент: CC0-удар и вспышка наложением | post-mvp | [05_completion.md](pack-shot/05_completion.md) |
| 18 | `music-library` | 11 CC0-треков, выбор по номеру клипа | post-mvp | [05_completion.md](music-library/05_completion.md) |
| 19 | `teaser-headline` | Заголовок клипа крупно в первые 2,5 с | post-mvp | [05_completion.md](teaser-headline/05_completion.md) |
| 20 | `partner-fairness` | Блокировка по людям, разблокировка, обезличивание атрибуций | post-mvp | [05_completion.md](partner-fairness/05_completion.md) |
| 21 | `pause-compaction` | Уплотнение пауз | post-mvp | [05_completion.md](pause-compaction/05_completion.md) |

## Сквозные документы, без которых фичи не читаются

| Документ | О чём |
|---|---|
| `../REPRODUCE.md` | как поднять заново в другом окружении; расхождения с замыслом |
| `../pipeline-walkthrough.md` | конвейер по шагам: акторы, инструменты, ресурсы |
| `../measurements/2026-09-23-first-long-recording.md` | первый живой прогон 88 минут и пять вскрытых им отказов |
| `../reviews/` | ревью семейства Anthropic и отчёты исправлений по деньгам, конкурентности, границам доверия, живым находкам |
| `../ADR.md` | десять решений, у каждого — проверка, обязанная упасть при нарушении |
| `../canon.md` | имена и числа; источник для кода и документов |

## Порядок, если повторять с нуля

По зависимостям из `.claude/feature-roadmap.json`: `foundation` → `upload-and-quota` →
`queue-and-probe` → `transcription` → `selection-and-score` → `render-and-watermark` →
`progress-and-clips-screen` → `short-link` → `guest-pack` → `partner-codes-and-dashboard` →
`limits-ui-and-pro-interest` → `retention-and-erasure` → `transcript-tolerance` → `framing` →
`subtitles-and-glossary`.

Три последние стоит делать **сразу**, а не после живого прогона: все они — ответ на свойства
настоящих данных, которых синтетические фикстуры не имели. Если повторять проект, начать живую
приёмку длинным файлом на фиче `transcription`, а не в конце.
