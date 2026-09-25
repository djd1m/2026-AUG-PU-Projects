import type { ClipMusicService } from './clip-music';
import type { ErasureService } from './erasure';
import type { InterestService } from './interest';
import { initTRPC, TRPCError } from '@trpc/server';
import { z, ZodError } from 'zod';
import type { VideoRetryService } from './video-retry';
import type { VideoService } from './video';
import type { ScreenService } from './screen';
import type { ShortLinkService } from './short-link';
import type { GuestPackService } from './guest-pack';
import type { PartnerService } from './partner';
import { createVideoSchema, UploadError } from './upload-contract';
interface Context { music?: Pick<ClipMusicService, 'setMusic'>; referralCookie?: string; erasure?: ErasureService; interest?: Pick<InterestService, 'create'>; partners?: Pick<PartnerService, 'apply' | 'dashboard'>; ipPrefix?: string; account: string; idempotencyKey: string | null; requestId: string; video: Pick<VideoService, 'create'>; retry?: Pick<VideoRetryService, 'retry'>; screen?: ScreenService; links?: Pick<ShortLinkService, 'copy'>; guests?: Pick<GuestPackService, 'create' | 'send' | 'revoke'> }
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
async function readResult<T>(ctx: Context, operation: (service: ScreenService) => Promise<T>) {
  try {
    if (!ctx.screen) throw new Error('Screen runtime unavailable');
    return { data: await operation(ctx.screen), meta: { request_id: ctx.requestId } };
  } catch (cause) {
    throw new TRPCError({ code: cause instanceof UploadError && cause.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
      message: cause instanceof UploadError ? cause.message : 'Не удалось получить данные. Повторите позже', cause });
  }
}
const videoId = z.object({ video_id: z.string().uuid() }).strict();
async function guestResult<T>(ctx: Context, operation: (service: NonNullable<Context['guests']>) => Promise<T>) {
  try {
    if (!ctx.guests) throw new Error('Guest runtime unavailable');
    return { data: await operation(ctx.guests), meta: { request_id: ctx.requestId } };
  } catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 503;
    throw new TRPCError({ code: status === 404 ? 'NOT_FOUND' : status === 422 ? 'UNPROCESSABLE_CONTENT' : status === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
      message: cause instanceof UploadError ? cause.message : 'Пакеты временно недоступны. Повторите позже', cause });
  }
}
async function partnerResult<T>(ctx: Context, operation: (service: NonNullable<Context['partners']>) => Promise<T>) {
  try {
    if (!ctx.partners) throw new Error('Partner runtime unavailable');
    return { data: await operation(ctx.partners), meta: { request_id: ctx.requestId } };
  } catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 503;
    throw new TRPCError({ code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 422 ? 'UNPROCESSABLE_CONTENT' : status === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
      message: cause instanceof UploadError ? cause.message : 'Партнёрские данные временно недоступны. Повторите позже', cause });
  }
}
// Flat key preserves canonical HTTP code.apply; apply is reserved as a standalone router key.
export const appRouter = t.router({
  account: t.router({ delete: validatedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try {
      if (!ctx.erasure) throw new Error('Erasure runtime unavailable');
      return { data: await ctx.erasure.request(ctx.account, input), meta: { request_id: ctx.requestId } };
    } catch (cause) {
      const status = cause instanceof UploadError ? cause.status : 503;
      throw new TRPCError({ code: status === 422 ? 'UNPROCESSABLE_CONTENT' : status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        message: cause instanceof UploadError ? cause.message : 'Не удалось запросить удаление. Повторите позже', cause });
    }
  }) }),
  interest: t.router({ create: validatedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try {
      if (!ctx.interest) throw new Error('Interest runtime unavailable');
      return { data: await ctx.interest.create(ctx.account, input), meta: { request_id: ctx.requestId } };
    } catch (cause) {
      const status = cause instanceof UploadError ? cause.status : 503;
      throw new TRPCError({ code: status === 422 ? 'UNPROCESSABLE_CONTENT' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        message: cause instanceof UploadError ? cause.message : 'Не удалось записать интерес. Повторите позже', cause });
    }
  }) }),
  'code.apply': validatedProcedure.input(z.unknown()).mutation(({ ctx, input }) => partnerResult(ctx, s => {
    if (!ctx.ipPrefix) throw new Error('Client prefix unavailable');
    return s.apply(ctx.account, input, ctx.ipPrefix, ctx.referralCookie);
  })),
partner: t.router({
  dashboard: validatedProcedure.input(z.object({ code_id: z.string().uuid().optional() }).strict())
    .query(({ ctx, input }) => partnerResult(ctx, s => s.dashboard(ctx.account, input.code_id))),
}), video: t.router({
  get: validatedProcedure.input(videoId).query(({ ctx, input }) => readResult(ctx, s => s.get(ctx.account, input.video_id))),
  list: validatedProcedure.input(z.object({ cursor: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).optional() }).strict())
    .query(({ ctx, input }) => readResult(ctx, s => s.list(ctx.account, input))),
  create: validatedProcedure.input(createVideoSchema).mutation(async ({ ctx, input }) => {
  try { return { data: await ctx.video.create(ctx.account, ctx.idempotencyKey, input), meta: { request_id: ctx.requestId } }; }
  catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 503;
    const code = status === 429 ? 'TOO_MANY_REQUESTS' : status === 422 ? 'UNPROCESSABLE_CONTENT' :
      status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR';
    throw new TRPCError({ code, message: cause instanceof UploadError ? cause.message : 'Загрузка временно недоступна', cause });
  }
}), retry: validatedProcedure.input(z.object({ video_id: z.string().uuid() }).strict()).mutation(async ({ ctx, input }) => {
  try {
    if (!ctx.retry) throw new Error('Retry runtime unavailable');
    return { data: await ctx.retry.retry(ctx.account, input.video_id), meta: { request_id: ctx.requestId } };
  } catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 503;
    throw new TRPCError({ code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
      message: cause instanceof UploadError ? cause.message : 'Повтор временно недоступен', cause });
  }
}) }), clip: t.router({
  setMusic: validatedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
    try {
      if (!ctx.music) throw new Error('Music runtime unavailable');
      return { data: await ctx.music.setMusic(ctx.account, input), meta: { request_id: ctx.requestId } };
    } catch (cause) {
      const status = cause instanceof UploadError ? cause.status : 503;
      throw new TRPCError({ code: status === 404 ? 'NOT_FOUND' : status === 422 ? 'UNPROCESSABLE_CONTENT'
        : status === 409 ? 'CONFLICT' : status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        message: cause instanceof UploadError ? cause.message : 'Не удалось сменить музыку', cause });
    }
  }),
  list: validatedProcedure.input(videoId).query(({ ctx, input }) => readResult(ctx, s => s.clips(ctx.account, input.video_id))),
  markDownloaded: validatedProcedure.input(z.object({ clip_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) => readResult(ctx, s => s.markDownloaded(ctx.account, input.clip_id))),
}), link: t.router({
  create: validatedProcedure.input(z.object({ clip_id: z.string().uuid() }).strict()).mutation(async ({ ctx, input }) => {
    try {
      if (!ctx.links) throw new Error('Link runtime unavailable');
      return { data: await ctx.links.copy(ctx.account, input.clip_id), meta: { request_id: ctx.requestId } };
    } catch (cause) {
      throw new TRPCError({ code: cause instanceof UploadError && cause.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        message: cause instanceof UploadError ? cause.message : 'Не удалось скопировать ссылку. Повторите позже', cause });
    }
  }),
}), guest: t.router({
  create: validatedProcedure.input(z.unknown()).mutation(({ ctx, input }) => guestResult(ctx, s => s.create(ctx.account, input))),
  send: validatedProcedure.input(z.object({ guest_pack_id: z.string().uuid(), channel: z.enum(['copy', 'telegram']) }).strict())
    .mutation(({ ctx, input }) => guestResult(ctx, s => s.send(ctx.account, input.guest_pack_id))),
  revoke: validatedProcedure.input(z.object({ guest_pack_id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) => guestResult(ctx, s => s.revoke(ctx.account, input.guest_pack_id))),
}) });
export type AppRouter = typeof appRouter;
