// `EvaluateDiscrepancy` (FR-source-and-correct-8, ADR-001 Confirmation (3)). Реальное
// (и ЕДИНСТВЕННОЕ во всей кодовой базе) арифметическое чтение `model_estimate_kcal` живёт
// в `@n4/shared` — `apps/api/src/correct/apply-op.ts` пересчитывает расхождение ПОСЛЕ
// правки той же функцией, а не второй копией арифметики (`security-operation-order.md`:
// два места с одним правилом расходятся молча).

export { evaluateDiscrepancy, type DiscrepancyResult } from '@n4/shared';
