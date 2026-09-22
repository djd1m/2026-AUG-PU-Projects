import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRuntime } from './runtime';
export async function pageAccount() {
  const token = (await cookies()).get('__Host-n5_session')?.value;
  const session = token ? await getRuntime().auth.authenticate(token) : null;
  if (!session) redirect('/');
  return session.account_id;
}
