import { remainingLimits } from '../../server/limits';
import { LimitsPanel } from './LimitsPanel';
import { ProInterest } from './ProInterest';
import { PartnerPanel } from './PartnerPanel';
import { z } from 'zod';
import { getScreenRuntime } from '../../server/screen-runtime';
import { pageAccount } from '../../server/page-account';
import { VideoList } from '../videos/VideoList';
import { VideoUploader } from '../upload/Uploader';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const account = await pageAccount();
  const cursor = z.string().uuid().safeParse((await searchParams).cursor);
  const { screen, pool, config } = getScreenRuntime();
  const [result, remaining] = await Promise.all([screen.list(account, { cursor: cursor.success ? cursor.data : undefined }),
    remainingLimits(pool, config.limits, account)]);
  return <><LimitsPanel remaining={remaining} /><VideoUploader /><ProInterest source="partner_dashboard" /><PartnerPanel /><VideoList videos={result.videos} nextCursor={result.next_cursor} /></>;
}
