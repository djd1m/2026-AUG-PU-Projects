# teaser-headline — правки после REVIEW и прогона в образе

Код в `e4d06ba`. Полный набор в образе 8.1: **684/684**. Ревью Anthropic: APPROVE WITH FIXES.

1. **[high, найдено координатором в образе] Выражение исчезновения не зависит от `TEASER_SECONDS`.**
   `alpha='if(lt(t,2.2),1,max(0,(2.5-t)/0.3))'` записано числами, поэтому мутация
   `TEASER_SECONDS = 25` в образе ВЫЖИЛА (red-фаза: exit 0, passed 1) — заголовок всё равно гас в 2,5 с.
   Вывести из констант: `TEASER_FADE_SECONDS = 0.3`, `alpha='if(lt(t,S−F),1,max(0,(S−t)/F))'` с
   `S = TEASER_SECONDS`. После правки мутация `window-pixels` обязана покраснеть (проверит координатор
   в образе); строковый тест: выражение содержит значения из констант.
2. **[medium] `tests/run-teaser-mutations.mjs`:** при любом `NOT_EXECUTED` — `process.exitCode ||= 2`.
3. **[low] `ffmpeg.ts:50`:** `music_track_fallback` только при `options.music`; тест — с `music: true`.
4. **[low] `tests/teaser.test.ts:65-70`:** граница из экспортируемых констант (`TEASER_MAX_LINES`,
   `TEASER_FONT_SIZE`, ширина рамки), убрать `expect(TEASER_Y).toBe(0.17)`.
5. **[low] `tests/teaser-media.test.ts`:** добавить кадр в t≈2,4 (подложка и текст частично
   прозрачны: Δ между t=1 и t=2,4 заметен) — на ffmpeg < 6.1 тест по-прежнему «НЕ ВЫПОЛНЕН» громко.

Прогон: `npx vitest run` по затронутым файлам. Не коммить. Дописать раздел «Правки после REVIEW» в
`07_code_report.md`; последняя строка — `Status: completed` либо `Status: failed`.
