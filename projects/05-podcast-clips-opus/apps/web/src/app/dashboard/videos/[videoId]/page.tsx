import { notFound } from 'next/navigation';
import { z } from 'zod';
import { pageAccount } from '../../../../server/page-account';
import { getScreenRuntime } from '../../../../server/screen-runtime';
import { UploadError } from '../../../../server/upload-contract';
import { VideoDetail } from '../../../videos/[videoId]/VideoDetail';
export default async function DetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const account = await pageAccount(), { videoId } = await params;
  if (!z.string().uuid().safeParse(videoId).success) notFound();
  try {
    const screen = getScreenRuntime().screen;
    const [video, { clips }] = await Promise.all([screen.get(account, videoId), screen.clips(account, videoId)]);
    return <VideoDetail videoId={videoId} initialVideo={video} initialClips={clips} />;
  } catch (cause) { if (cause instanceof UploadError && cause.status === 404) notFound(); throw cause; }
}
