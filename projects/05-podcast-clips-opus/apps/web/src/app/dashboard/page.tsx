import { PartnerPanel } from './PartnerPanel';
import { z } from 'zod';
import { getScreenRuntime } from '../../server/screen-runtime';
import { pageAccount } from '../../server/page-account';
import { VideoList } from '../videos/VideoList';
import { VideoUploader } from '../upload/Uploader';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const account = await pageAccount();
  const cursor = z.string().uuid().safeParse((await searchParams).cursor);
  const result = await getScreenRuntime().screen.list(account, { cursor: cursor.success ? cursor.data : undefined });
  return <><VideoUploader /><PartnerPanel /><VideoList videos={result.videos} nextCursor={result.next_cursor} /></>;
}
