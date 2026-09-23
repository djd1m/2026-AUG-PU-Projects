import { createS3Client, generateDownloadUrl, headObject } from '@clipmaker/s3';
import { getRuntime } from '../../../server/runtime';
import { ShortLinkService } from '../../../server/short-link';
import { createShortLinkHandler } from '../../../server/short-link-handler';
import { allowRead } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { config, pool, auth, redis } = getRuntime();
  const ctx = { client: createS3Client(config.s3), bucket: config.s3.bucket };
  try {
    return await createShortLinkHandler({ links: new ShortLinkService(pool), auth,
      trustedProxyHops: config.trustedProxyHops, referralSecret: config.sessionSecret,
      allowRead: (ip, account) => allowRead(redis, ip, config.sessionSecret, account),
      preview: async key => {
        try { await headObject(ctx, key); }
        catch (error) {
          if (error instanceof Error && ['NotFound', 'NoSuchKey'].includes(error.name)) return null;
          throw error;
        }
        return generateDownloadUrl(ctx, key);
      },
    })(request, (await params).code);
  } finally { ctx.client.destroy(); }
}
