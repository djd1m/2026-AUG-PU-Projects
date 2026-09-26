// Экран предпросмотра /preview/{index_job_id} (SC-US-001-1: index_job_id в адресе; FR-PREVIEW-001). Доступ решает
// сервер по HttpOnly cookie предпросмотра (маршруты /api/preview/*); страница знает только, вошёл ли владелец —
// от этого зависит «Сохранить»: claim сразу или через регистрацию.
import { cookies } from 'next/headers';
import { SiteHeader } from '../../SiteHeader';
import { requestTheme } from '../../theme-server';
import { COOKIE_NAME } from '../../../server/auth-handler';
import { getRuntime } from '../../../server/runtime';
import { PreviewScreen } from './PreviewScreen';
export const dynamic = 'force-dynamic';
export default async function PreviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  let signedIn = false;
  try { signedIn = Boolean(token && await getRuntime().auth.authenticate(token)); } catch { signedIn = false; }
  return <><SiteHeader theme={await requestTheme()} /><main className="center container"><PreviewScreen jobId={jobId} signedIn={signedIn} /></main></>;
}
