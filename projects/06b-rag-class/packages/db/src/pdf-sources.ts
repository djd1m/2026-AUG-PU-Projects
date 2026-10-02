import { createHash } from 'node:crypto';
import type { Pool } from './pool.js';
import { withTenant } from './tenant.js';
import { planOf } from './enums.js';

export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export class PdfUploadError extends Error {
  constructor(readonly status: 413 | 415 | 422, message: string) { super(message); this.name = 'PdfUploadError'; }
}
export function validatePdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > PDF_MAX_BYTES) throw new PdfUploadError(413, 'PDF должен быть не больше 10 МиБ');
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    throw new PdfUploadError(415, 'Файл должен иметь сигнатуру PDF');
  }
}

/** Bytes are validated before acquiring a connection. The bot lock serializes the Free cap. */
export async function enqueuePdfSource(pool: Pool, accountId: string, botId: string, fileName: string,
  bytes: Uint8Array): Promise<{ jobId: string; sourceId: string } | 'cap' | null> {
  validatePdfBytes(bytes);
  if (!fileName.trim() || fileName.length > 255) throw new PdfUploadError(422, 'Укажите имя файла до 255 символов');
  const hash = createHash('sha256').update(bytes).digest('hex');
  return withTenant(pool, accountId, async (c) => {
    const bot = (await c.query<{ account_id: string }>(
      'SELECT account_id FROM bot WHERE id = $1 FOR NO KEY UPDATE', [botId])).rows[0];
    if (!bot) return null;
    const plan = (await c.query<{ plan: string }>('SELECT plan FROM account WHERE id = $1', [bot.account_id])).rows[0]?.plan;
    if (planOf(plan) === 'free') {
      const count = (await c.query<{ n: string }>(
        "SELECT count(*) AS n FROM source WHERE bot_id = $1 AND kind = 'pdf'", [botId])).rows[0]!;
      if (Number(count.n) >= 3) return 'cap';
    }
    const source = (await c.query<{ id: string }>(
      "INSERT INTO source (bot_id, account_id, kind, file_name) VALUES ($1, $2, 'pdf', $3) RETURNING id",
      [botId, bot.account_id, fileName])).rows[0]!;
    await c.query('INSERT INTO source_file (source_id, account_id, bytes, sha256) VALUES ($1, $2, $3, $4)',
      [source.id, bot.account_id, Buffer.from(bytes), hash]);
    const job = (await c.query<{ id: string }>(
      'INSERT INTO index_job (source_id, account_id) VALUES ($1, $2) RETURNING id', [source.id, bot.account_id])).rows[0]!;
    return { sourceId: source.id, jobId: job.id };
  });
}
