// Уборщик зависших задач (Pseudocode «Worker lease loop» шаг 8). Перенос N4 #13 —
// projects/04-calorie-vision-cal-ai/apps/recognizer/src/recognize/sweep-stuck-scans.ts, адаптирован:
//   * правило А (N4 «queued без аренды дольше бюджета») не перенесено: здесь очередь без бюджета от создания — задача,
//     ждущая исполнителя, не зависла, а ждёт; её честное состояние — «выполняется» (в хранилище queued);
//   * правило «исчерпаны захваты» — running, аренда истекла, attempts ≥ 3: такую задачу больше не предложат ни одному
//     исполнителю (предикат захвата attempts < 3), и без уборщика она висела бы «выполняется» вечно;
//   * правило «потолок» — running, аренда истекла, от run_started_at прошло > 15 мин: захват её всё равно бы закрыл.
// Как и у N4, уборщик трогает ТОЛЬКО строки с истёкшей арендой: задачу живого исполнителя (аренда продлена) он не закроет.
// fence уборщик не повышает; исполнитель, чью строку он закрыл, упирается в state = 'running' своей записи.

import { JOB_CEILING_MINUTES, JOB_MAX_ATTEMPTS, type Pool, withService } from '@n6b/db';

export const SWEEP_EVERY_MS = 60_000;
export const TEXT_WORKER_GONE = 'Исполнитель не отвечает: задача трижды прервалась. Нажмите «Повторить» — обработанное сохранится.';
export const TEXT_CEILING = `Превышено время задачи (${JOB_CEILING_MINUTES} мин). Нажмите «Повторить» — продолжим с того же места.`;

export const SWEEP_SQL = `
  UPDATE index_job
  SET state = 'failed', finished_at = now(), leased_until = NULL,
      error = CASE WHEN attempts >= $1 THEN $3 ELSE $4 END
  WHERE state = 'running' AND leased_until < now()
    AND (attempts >= $1 OR now() - run_started_at > make_interval(mins => $2))
  RETURNING id`;

export async function sweepStuckJobs(pool: Pool): Promise<string[]> {
  const res = await withService(pool, (c) => c.query<{ id: string }>(SWEEP_SQL,
    [JOB_MAX_ATTEMPTS, JOB_CEILING_MINUTES, TEXT_WORKER_GONE, TEXT_CEILING]));
  return res.rows.map((r) => r.id);
}
