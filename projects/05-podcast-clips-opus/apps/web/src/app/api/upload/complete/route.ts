import { getUploadRuntime } from '../../../../server/upload-runtime';
import { createCompleteHandler } from '../../../../server/upload-handler';
export const runtime = 'nodejs';
export async function POST(request: Request) { return createCompleteHandler(getUploadRuntime())(request); }
