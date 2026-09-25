import { remainingLimits } from '../../../../server/limits';
import { LimitsPanel } from '../../LimitsPanel';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { pageAccount } from '../../../../server/page-account';
import { getScreenRuntime } from '../../../../server/screen-runtime';
import { UploadError } from '../../../../server/upload-contract';
import { VideoDetail } from '../../../videos/[videoId]/VideoDetail';
import { GuestPackService, consentHash } from '../../../../server/guest-pack';
export default async function DetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const account = await pageAccount(), { videoId } = await params;
  if (!z.string().uuid().safeParse(videoId).success) notFound();
  try {
    const { screen, pool, config } = getScreenRuntime();
    const [video, { clips }, packs, remaining] = await Promise.all([screen.get(account, videoId), screen.clips(account, videoId), new GuestPackService(pool).list(account, videoId), remainingLimits(pool, config.limits, account)]);
    return <><VideoDetail videoId={videoId} initialVideo={video} initialClips={clips}
      initialPacks={packs.map(pack => ({ ...pack, url: new URL(pack.url, config.publicOrigin).href }))} consentHash={consentHash} /><LimitsPanel remaining={remaining} /></>;
  } catch (cause) { if (cause instanceof UploadError && cause.status === 404) notFound(); throw cause; }
}
