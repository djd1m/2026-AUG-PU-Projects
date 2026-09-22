import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../../../../server/trpc';
import { getUploadRuntime } from '../../../../server/upload-runtime';
import { authorizeUpload, readUploadJson, uploadFailure } from '../../../../server/upload-handler';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const deps = getUploadRuntime();
    const account = await authorizeUpload(request, deps); // До чтения тела, в том числе tRPC batching.
    const body = await readUploadJson(request);
    const bounded = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) });
    return await fetchRequestHandler({ endpoint: '/api/trpc', req: bounded, router: appRouter, allowBatching: false,
      createContext: () => ({ account, idempotencyKey: request.headers.get('idempotency-key'), requestId, video: deps.video }),
      responseMeta: ({ errors }) => ({ status: errors.length ? undefined : 202 }) });
  } catch (error) { return uploadFailure(error, requestId); }
}
