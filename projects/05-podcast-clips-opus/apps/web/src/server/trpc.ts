import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import type { VideoService } from './video';
import { createVideoSchema, UploadError } from './upload-contract';
interface Context { account: string; idempotencyKey: string | null; requestId: string; video: Pick<VideoService, 'create'> }
const t = initTRPC.context<Context>().create({ errorFormatter({ shape, error }) {
  const cause = error.cause;
  return { ...shape, data: { ...shape.data, ...(cause instanceof UploadError ? { upload: { code: cause.code, message: cause.message, ...cause.details } } : {}) } };
} });
const validatedProcedure = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof ZodError) {
    const cause = new UploadError('invalid', 'Проверьте имя, размер файла и источник загрузки', 422);
    throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: cause.message, cause });
  }
  return result;
});
export const appRouter = t.router({ video: t.router({ create: validatedProcedure.input(createVideoSchema).mutation(async ({ ctx, input }) => {
  try { return { data: await ctx.video.create(ctx.account, ctx.idempotencyKey, input), meta: { request_id: ctx.requestId } }; }
  catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 503;
    const code = status === 429 ? 'TOO_MANY_REQUESTS' : status === 422 ? 'UNPROCESSABLE_CONTENT' :
      status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR';
    throw new TRPCError({ code, message: cause instanceof UploadError ? cause.message : 'Загрузка временно недоступна', cause });
  }
}) }) });
export type AppRouter = typeof appRouter;
