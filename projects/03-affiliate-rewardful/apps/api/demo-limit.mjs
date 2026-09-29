// Лимит независимых демосеансов (tenants mode='fixture').
// Правило honest-configuration: переменная НЕ задана → прежний дефолт кода (200);
// задана, но пустая, дробная, в экспоненте, ≤0, выше потолка или мусор → отказ при старте.
export const DEFAULT_MAX_DEMO_RUNS = 200;
export const MAX_DEMO_RUNS_CEILING = 10000;

export function parseMaxDemoRuns(raw) {
  if (raw === undefined) return DEFAULT_MAX_DEMO_RUNS;
  const fail = () => new Error(`N3_MAX_DEMO_RUNS=${JSON.stringify(raw)} недопустим: нужно целое число от 1 до ${MAX_DEMO_RUNS_CEILING} `
    + `(лимит одновременно существующих демосеансов; не задавайте переменную, чтобы оставить ${DEFAULT_MAX_DEMO_RUNS}).`);
  // Пустая строка — не «не задана» (CFG-I2): она не проходит шаблон и отказывает.
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) throw fail();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > MAX_DEMO_RUNS_CEILING) throw fail();
  return value;
}
