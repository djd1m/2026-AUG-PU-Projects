# Music library — curated (OWN-014)

Выполнено задание `11_add_curated_codex.md`. Коммит не создавался.

- `MUSIC_TRACKS`: ровно 9 треков, Komiku первый, восемь HoliznaCC0 в порядке задания.
- README: все названия, авторы, альбомы, длительности, SHA-256, источники и CC0; оговорка OWN-014 дословно. Для Komiku сохранён источник Internet Archive (трек 04).
- Страж фиксирует все 9 пар id/SHA-256, порядок, реальные байты и длительность каждого через ffprobe ≥ 75 с. Длительности README округлены до секунд, как в задании.
- Тесты выбора используют прежний `TEST_MUSIC_TRACKS`; удалено устаревшее утверждение, что рабочий каталог всегда возвращает первый трек. Эталоны и MP3 не изменялись.
- Текст источников в загрузчике и его существующем тесте совпадает с заданием.

Проверки:

1. `npx vitest run tests/music.test.ts tests/pack-shot-contract.test.ts tests/pack-shot-uploader.test.ts tests/teaser-contract.test.ts`: 26 passed, 1 failed — старое ожидаемое авторство в тесте загрузчика. Каталог (24 теста music), контракт пэк-шота и эталон тизера прошли.
2. После исправления ожидаемого текста: `npx vitest run tests/pack-shot-uploader.test.ts tests/pack-shot.test.ts --reporter=json --outputFile=docs/telemetry/p-replicator/20260924T204906Z-music-curated/evidence/uploader-packshot.json`: 13 passed, 0 failed, exit 0.
3. `MUSIC_MUTATION_DIR=docs/telemetry/p-replicator/20260924T204906Z-music-curated/evidence/catalogue node tests/run-music-mutations.mjs catalogue`: SHA-256 Bubbles заменён нулями; red exit 1 (1 failed), восстановление в finally; green exit 0 (2 passed). Мутация обнаружена.
4. `git diff --check`: exit 0.

По каждому затронутому набору итог зелёный. Полный suite, build, E2E и развёртывание не запускались: задание явно ограничило прогон затронутыми файлами и мутацией catalogue. Новая независимая проверка лицензий не проводилась: сведения перенесены из принятого владельцем задания. Независимое Anthropic-ревью недоступно в этой сессии и не заявляется выполненным.

Профиль: `compact-quality-first-v2`, один исполнитель Codex; точная actual model/effort не предоставлена хостом. Содержательный тир S: каталог плюс текст авторства, без изменения границ сервисов; механический роутер дал L (exit 1) из-за путей двух сервисов. Применён точный объём и проверки задания владельца.

RUN_ID: `20260924T204906Z-music-curated`. Телеметрия: `docs/telemetry/p-replicator/20260924T204906Z-music-curated/run.json`, `docs/telemetry/p-replicator/20260924T204906Z-music-curated/events.jsonl`. Измеренный интервал после чтения инструкций: 86.0 с; полный elapsed и active неизвестны (начальное чтение не измерено). Токены и стоимость: null, счётчики не доступны; экономия не установлена.

Исходная ревизия: `3e7d4d11b90c92082a44c90a8e82901856705bc6`. Снимок результата: `sha256:64f90d00c6d4b3f76190eacd2615b953e2953bb84d379480acafe5c445368c44`; хеши исходников и всех MP3 — `docs/telemetry/p-replicator/20260924T204906Z-music-curated/evidence/source-sha256.json`.

Status: completed
