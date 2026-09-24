# music-library — откат к одному треку (OWN-013)

Выполнено по `09_revert_to_one_codex.md`. Коммит не создавался, развёртывание не выполнялось.

- В `MUSIC_TRACKS` ровно `komiku-everything-is-groovy`, прежние путь и SHA-256. Удалены остальные 10 MP3; README содержит один трек и ссылку на историю `53f18f7`.
- `selectTrack` сохраняет алгоритм и принимает необязательный непустой readonly-каталог. Сквозная передача индекса не изменена.
- Цикл, отрицательный индекс, fail-closed и влияние выбора на замер, вход FFmpeg и хеш контракта проверяются на трёх фиктивных треках. Файлы им не нужны: медиаграница замокана. Отдельный тест проверяет настоящий каталог: один трек, закреплённый SHA-256 и длительность ≥ 75 с.
- Мутации `selection`, `catalogue`/`music-catalogue`, `selected-*`, `index-passing` и `index-origin` реально краснеют. Все прежние утверждения сохранены.
- `baseline.json` и `music-only.json` побайтово совпадают с HEAD, проверено прямым сравнением; проверки аргументов и хеша проходят.
- Строка источников: «Komiku — Everything is groovy · Kenney — Sci-Fi Sounds, CC0»; UI-тест обновлён.

## Проверки

| Команда | Результат |
|---|---|
| `npx vitest run tests/music.test.ts tests/pack-shot.test.ts tests/pack-shot-contract.test.ts tests/pack-shot-uploader.test.ts tests/music-uploader.test.ts tests/render-worker.test.ts tests/teaser-contract.test.ts` | 53/53, без пропусков, exit 0 |
| `node tests/run-music-mutations.mjs` + продолжение `strict skip-throws catalogue gain-ceiling` | 19/19: дефект → exit 1 и failed > 0; восстановление → exit 0 и passed > 0 |
| `node tests/run-pack-shot-mutations.mjs` | 21/21: дефект → exit 1 и failed > 0; восстановление → exit 0 и passed > 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `git diff --check` | exit 0 |

Первый полный музыкальный прогон остановился после 15 успешных пар на устаревшем якоре `strict`: в схему уже добавлены `teaser` и `compact`. Якорь обновлён в существующем скрипте; оставшиеся четыре случая пройдены отдельно. Первичные результаты сохранены, успешные пары повторно не запускались. Каталоги вывода заданы через `MUSIC_MUTATION_DIR` и `PACK_SHOT_MUTATION_DIR`; исторические артефакты не перезаписаны.

Доказательства: [тесты](../../telemetry/p-replicator/20260924T194715Z-music-revert/targeted-tests.json), [19 музыкальных мутаций](../../telemetry/p-replicator/20260924T194715Z-music-revert/music-mutations/mutations.json), [21 мутация пэк-шота](../../telemetry/p-replicator/20260924T194715Z-music-revert/pack-mutations/results.json). Для каждой мутации рядом сохранены отдельные red/green JSON и логи, включая реальные FFmpeg-проверки.

Независимое ограниченное ревью тестов и мутационных скриптов — без замечаний. Запрошена `gpt-5.6-sol/high`; Anthropic недоступен, это fallback одного поставщика, не cross-family проверка. Реализация — текущий Codex; точные actual model/effort и usage хостом не раскрыты. Отдельные runtime-идентификаторы не выдумывались.

Профиль `compact-balanced-v1`, тир S: небольшой согласованный откат; один исполнитель и отдельный read-only reviewer. Измеренный интервал от регистрации прогона до отчёта: 768.6 с. Начальное чтение инструкций предшествовало регистрации, поэтому полная длительность задачи неизвестна. Active time, токены и стоимость — `null`; экономия не установлена.

Телеметрия: [`20260924T194715Z-music-revert/run.json`](../../telemetry/p-replicator/20260924T194715Z-music-revert/run.json), журнал `events.jsonl`, снимок `source-files.json` и `source.diff` рядом. Исходная ревизия `c1eccf6eb18cbce594f90013316d172b8925e790`; SHA-256 манифеста изменённых исходников `cc70e94e86c5484e82ece4453891ed0d9ad40b60b13e734484569e6499e05081`.

Границы доказательств: выполнен набор из задания и дополнительные lint/typecheck; полный репозиторный набор, build, БД-интеграции и развёрнутый E2E не запускались. Вкус музыки не оценивается автоматическими тестами. Во время работы появился посторонний untracked `disc.html`; он не изменялся и не включён в снимок этой задачи.

Status: completed
