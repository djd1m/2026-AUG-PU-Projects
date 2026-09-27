// /account/erased — состояние удаления без сессии, по подписанной квитанции (фича account-erasure; N5 erasure-page.ts —
// ПЕРЕНЕСЕНО). Квитанция даёт ТОЛЬКО право видеть статус и срок своего аккаунта.
import { cookies } from 'next/headers';
import { ERASURE_COOKIE, readErasureReceipt } from '../../../server/erasure-receipt';
import { getRuntime } from '../../../server/runtime';
import { SiteHeader } from '../../SiteHeader';
import { requestTheme } from '../../theme-server';
import { ErasureStatus, type ErasureState } from './ErasureStatus';
export const dynamic = 'force-dynamic';

async function erasureState(): Promise<ErasureState> {
  const runtime = getRuntime();
  const account = readErasureReceipt((await cookies()).get(ERASURE_COOKIE)?.value, runtime.config.sessionSecret);
  if (!account) return null;
  const row = (await runtime.pool.query<{ status: 'erasing' | 'deleted'; erase_deadline: Date; overdue: boolean }>(`SELECT status, erase_deadline,
    erase_deadline < now() AS overdue FROM account WHERE id = $1 AND status IN ('erasing', 'deleted')`, [account])).rows[0];
  return row ? { status: row.status, deadline: row.erase_deadline.toISOString(), overdue: row.status === 'erasing' && row.overdue } : null;
}

export default async function ErasedPage() {
  return <><SiteHeader theme={await requestTheme()} /><main className="center container"><ErasureStatus state={await erasureState()} /></main></>;
}
