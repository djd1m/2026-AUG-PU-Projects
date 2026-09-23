import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CLIP_CODE_ALPHABET as ALPHABET, clipCodeLength as parseClipCodeLength } from '@clipmaker/shared/clip-code';
export function clipCodeLength(value = process.env.N5_SHORT_CODE_LENGTH): 6 | 10 {
  return parseClipCodeLength(value);
}
export async function createClipLink(tx: PoolClient, clipId: string): Promise<void> {
  const length = clipCodeLength();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const result = await tx.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING id', [clipId, code]);
    if (result.rowCount) return;
  }
  throw new Error('Не удалось выделить уникальный код клипа');
}
