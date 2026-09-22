import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
// Pseudocode CreateClipLink: public 10-character code, approximately 50 bits.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export async function createClipLink(tx: PoolClient, clipId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const result = await tx.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING id', [clipId, code]);
    if (result.rowCount) return;
  }
  throw new Error('Не удалось выделить уникальный код клипа');
}
