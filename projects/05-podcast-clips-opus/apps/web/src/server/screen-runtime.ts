import { createS3Client, generateDownloadUrl } from '@clipmaker/s3';
import { getRuntime } from './runtime';
import { ScreenService } from './screen';
import { createClipFileHandler } from './clip-file';
import { streamGuestFile } from './guest-file';
export function getScreenRuntime() {
  const runtime = getRuntime();
  return { ...runtime, screen: new ScreenService(runtime.pool) };
}
export function clipRoute(kind: 'file' | 'thumbnail') {
  return async (request: Request, { params }: { params: Promise<{ clipId: string }> }) => {
    const runtime = getRuntime();
    const ctx = { client: createS3Client(runtime.config.s3), bucket: runtime.config.s3.bucket };
    try {
      return await createClipFileHandler({ pool: runtime.pool, auth: runtime.auth,
        guestSecret: runtime.config.sessionSecret, stream: streamGuestFile,
        sign: (key, filename) => generateDownloadUrl(ctx, key, filename) }, kind)(request, (await params).clipId);
    } finally { ctx.client.destroy(); }
  };
}
