// Шаги прохода сторожа worker-index изолированы друг от друга (повторное ревью account-erasure, находка 4): сбой одного
// шага — журнал и переход к следующему, а не конец прохода. Иначе один неудаляемый файл в томе uploads (sweepUploads)
// каждый проход обрывал бы цепочку до erasureTick — очередь стирания и наблюдение просрочки 72 ч стояли бы для всех.
export interface WatchdogStep { name: string; run: () => Promise<unknown> }

export async function runIsolatedSteps(steps: readonly WatchdogStep[], log: (line: string) => void = (line) => console.error(line)): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  for (const step of steps) {
    try { await step.run(); }
    catch (error) {
      failed.push(step.name);
      log(`worker-index: шаг сторожа «${step.name}» не выполнен (${error instanceof Error ? error.name : 'ошибка'}) — остальные шаги продолжаются`);
    }
  }
  return { failed };
}
