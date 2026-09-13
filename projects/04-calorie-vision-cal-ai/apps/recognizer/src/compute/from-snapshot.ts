// `ComputeFromSnapshot` (FR-source-and-correct-6/7). Реальная арифметика живёт в
// `@n4/shared` (`packages/shared/src/domain/food-compute.ts`) — та же функция нужна
// `apps/api` при пересчёте после правки, и два места с одним правилом расходятся молча.
// Этот файл — точка использования в `recognizer`, названная `03_architecture.md`.

export { computeItemFromSnapshot, sumMatchedKcal, type ComputedItemNumbers, type ComputableItem } from '@n4/shared';
