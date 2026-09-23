import { z } from 'zod';
import { transaction, type Pool } from '@clipmaker/db';
import { UploadError } from './upload-contract';

export class ErasureService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async request(account: string, input: unknown) {
    if (!z.object({ confirm: z.literal(true) }).strict().safeParse(input).success) {
      throw new UploadError('invalid', 'Подтвердите необратимое удаление аккаунта', 422);
    }
    const now = this.clock();
    return transaction(this.pool, async tx => {
      // NO KEY UPDATE blocks new authenticated writes (FOR SHARE), but allows FK checks.
      const row = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id=$1 FOR NO KEY UPDATE', [account])).rows[0];
      if (!row) throw new UploadError('not_found', 'Аккаунт не найден', 404);
      if (row.status !== 'active') throw new UploadError('conflict', 'Удаление уже запущено', 409);
      const deadline = new Date(now.getTime() + 72 * 3600_000);
      await tx.query("UPDATE account SET status='erasing',deletion_requested_at=$2,erase_deadline=$3,updated_at=$2 WHERE id=$1", [account, now, deadline]);
      await tx.query('UPDATE session SET revoked_at=COALESCE(revoked_at,$2) WHERE account_id=$1', [account, now]);
      await tx.query('UPDATE guest_pack SET revoked_at=COALESCE(revoked_at,$2) WHERE account_id=$1', [account, now]);
      await tx.query(`UPDATE clip_link SET revoked_at=COALESCE(revoked_at,$2)
        WHERE clip_id IN (SELECT c.id FROM clip c JOIN video v ON v.id=c.video_id WHERE v.account_id=$1)`, [account, now]);
      // Serialize with worker publication; fences and deleted_at reject all later results.
      await tx.query('UPDATE video SET deleted_at=$2,fence=fence+1 WHERE account_id=$1', [account, now]);
      return { accepted: true as const, erase_deadline: deadline.toISOString() };
    });
  }
}
