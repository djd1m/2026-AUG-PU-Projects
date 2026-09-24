# music-library — откат каталога к одному треку (OWN-013)

Решение владельца: `docs/decisions-owner.md` OWN-013. Сделать ровно это:

1. `apps/worker/src/render/music.ts`: `MUSIC_TRACKS` — ОДИН элемент `komiku-everything-is-groovy`
   (sha256 и путь прежние). `selectTrack` и сквозная передача индекса остаются.
2. Удалить из `apps/worker/assets/music/` 10 файлов остальных треков; `README.md` — только этот трек
   плюс строка «остальные 10 треков альбома удалены по OWN-013, в истории git — коммит `53f18f7`».
3. Тесты выбора НЕ должны выродиться в тавтологию: `selectTrack` получает необязательный второй
   аргумент — каталог (по умолчанию `MUSIC_TRACKS`); тесты цикла, fail-closed и «выбранный трек
   управляет замером/входом/контрактом» гоняются на ТЕСТОВОМ каталоге из 3+ фиктивных треков
   (без файлов, где файл не нужен) либо через `vi.mock`. Тест каталога: ровно 1 трек, sha256,
   длительность ≥ 75 с. Ни одно утверждение о механизме не ослаблять.
4. `tests/run-music-mutations.mjs` и `tests/run-pack-shot-mutations.mjs`: цели `catalogue`,
   `selected-*` перенацелить так, чтобы каждая мутация по-прежнему ломала продукт и краснела.
5. Эталоны `baseline.json` и `music-only.json` не меняются (первый клип и раньше получал этот трек).
6. Строка источников в `Uploader.tsx`: «Komiku — Everything is groovy · Kenney — Sci-Fi Sounds, CC0».

Прогон: `npx vitest run` по затронутым файлам + мутации. Не коммить. Отчёт —
`docs/features/music-library/10_revert_report.md`, последняя строка `Status: completed`/`failed`.
