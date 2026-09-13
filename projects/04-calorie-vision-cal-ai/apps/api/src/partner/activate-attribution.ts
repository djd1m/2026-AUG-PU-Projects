// ActivateAttributionOnRecognition — реализация ЖИВЁТ в `@n4/db`
// (`packages/db/src/partner-attribution.ts`), потому что производственный вызывающий —
// `@n4/recognizer` (`apps/recognizer/src/lease.ts`, `recordResult`), а recognizer не
// зависит от `@n4/api` (RV-partner-codes-and-cabinet-01). Этот файл — тонкий ре-экспорт,
// чтобы существующие тесты и импорты внутри `apps/api` не меняли путь.

export { activateAttributionOnRecognition, type ActivateOutcome } from '@n4/db';
