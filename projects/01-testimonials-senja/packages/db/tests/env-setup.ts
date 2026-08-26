// packages/db/tests/env-setup.ts
//
// Выполняется vitest ДО импорта любых модулей теста (`setupFiles`) — в этом весь смысл файла.
//
// Зачем (D-008, Phase 3 /start). `src/index.ts` строит пул из `DATABASE_URL` на этапе загрузки
// модуля. Тесты, идущие через `withAccount`/`withService` (rls.test.ts — приоритет №1 по
// testing.md), поднимают именно этот пул. При запуске документированной командой
//
//     TEST_DATABASE_URL=postgres://... npm test          (packages/db/README.md)
//
// `DATABASE_URL` оставался пустым, pg молча уходил на дефолт `localhost:5432`, и 5 тестов RLS
// падали с ECONNREFUSED — при том что остальные 13, работающие через `adminPool` (он читает
// `TEST_DATABASE_URL`), проходили. Расхождение между двумя пулами в одном пакете, а не
// проблема окружения.
//
// Присваивание здесь, а не в `setup.ts`: импорты поднимаются наверх модуля, поэтому строчка
// внутри `setup.ts` выполнилась бы ПОСЛЕ `import ... from '../src/index'` — то есть после того,
// как пул уже создан с пустым connectionString.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
