import { transaction, type Pool } from '@clipmaker/db';
import { SOURCE_SCREEN } from '@clipmaker/shared/enums';
import { moscowDay } from '@clipmaker/shared/upload';
import { z } from 'zod';
import { UploadError } from './upload-contract';

export const interestSchema = z.object({ source_screen: z.enum(SOURCE_SCREEN),
  contact: z.string().trim().email().max(254).optional() }).strict();
export class InterestService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async create(account: string, input: unknown) {
    const parsed = interestSchema.safeParse(input);
    if (!parsed.success) throw new UploadError('invalid', 'Проверьте контакт и источник интереса', 422);
    const { source_screen, contact } = parsed.data, now = this.clock();
    return transaction(this.pool, async tx => {
      const owner = (await tx.query<{ email: string }>(
        "SELECT email FROM account WHERE id=$1 AND status='active' FOR SHARE", [account])).rows[0];
      if (!owner) throw new UploadError('not_found', 'Аккаунт не найден', 404);
      await tx.query(`INSERT INTO pro_interest(account_id,contact,source_screen,last_pressed_at)
        VALUES($1,$2,$3,$4) ON CONFLICT(account_id) DO UPDATE
        SET contact=EXCLUDED.contact,last_pressed_at=EXCLUDED.last_pressed_at`,
      [account, contact ?? owner.email, source_screen, now]);
      await tx.query(`INSERT INTO growth_event(type,account_id,source_screen,day,created_at)
        VALUES('interest',$1,$2,$3::date,$4)`, [account, source_screen, moscowDay(now), now]);
      return { recorded: true };
    });
  }
}
