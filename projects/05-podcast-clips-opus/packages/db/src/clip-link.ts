import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
// Default remains the canonical 10 characters; 6 is an owner-controlled experiment.
export function clipCodeLength(value = process.env.N5_SHORT_CODE_LENGTH): 6 | 10 {
  if (value === undefined || value === '10') return 10;
  if (value === '6') return 6;
  throw new Error('N5_SHORT_CODE_LENGTH: expected 6 or 10');
}
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export async function createClipLink(tx: PoolClient, clipId: string): Promise<void> {
  const length = clipCodeLength();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const result = await tx.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING id', [clipId, code]);
    if (result.rowCount) return;
  }
  throw new Error('Не удалось выделить уникальный код клипа');
}
