// POST /api/bots/{bot_id}/sources с multipart PDF — CreateSource (Pseudocode п.1, 2, 4, 5; FR-SOURCE-003,
// SC-US-004-3, ADR-018). Граница файла адаптирована из N5 apps/web/src/server/upload-* (двойная проверка
// размера: заявленный Content-Length и фактически принятые байты); S3 не переносится — файл ложится в
// том uploads под именем index_job_id.
// Порядок — это защита (security-operation-order): лимит частоты → Origin → владение ботом → ключ
// повторности → повтор той же задачи → вид тела → заявленный размер → предел плана → ТОЛЬКО ПОТОМ чтение
// тела с обрывом на потолке → тип по первым байтам → файл на диск → строка задачи (атомарный предел) →
// очередь после коммита → 202. Файл пишется ДО коммита: «строка задачи есть ⇒ файл есть»; всё, что
// не стало задачей, удаляется здесь же, остальное — подметанием тома воркером.
import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isPdfMagic, PDF_MAX_BYTES, type AccountPlan } from '@n6/rag';
import type { CreatePdfSourceInput, CreatePdfSourceResult, OwnedBot } from '@n6/db';
import { readSessionCookie } from './auth-handler';
import { clientIp } from './ip';
import { MultipartError, parseSingleFile, readBoundary, sanitizeFileName } from './multipart';

// Накладные multipart сверх самого файла: граница, заголовки части (≤ 8 КиБ), завершение.
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const MAX_UPLOAD_BODY_BYTES = PDF_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_NAME: Readonly<Record<AccountPlan, string>> = { free: 'free', nobadge: 'nobadge', studio: 'studio' };

export interface SourceUploadDependencies {
  publicOrigin: string;
  uploadDir: string;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  readOwnedBot: (botId: string, accountId: string) => Promise<OwnedBot | null>;
  pdfLimit: (plan: AccountPlan) => number;
  findJob: (botId: string, idempotencyKey: string) => Promise<string | null>;
  createPdfSource: (input: CreatePdfSourceInput) => Promise<CreatePdfSourceResult>;
  enqueue: (message: { index_job_id: string; generation: number }) => Promise<void>;
  newId?: () => string;
  log?: (line: string) => void;
}

const json = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const accepted = (indexJobId: string) => json({ data: { index_job_id: indexJobId } }, 202);
const notFound = () => fail(404, 'not_found', 'Бот не найден');
const tooLarge = () => fail(413, 'too_large', 'Файл больше 10 МБ — это предел загрузки PDF');
const planLimit = (plan: AccountPlan, limit: number) =>
  fail(403, 'plan_limit', `На плане ${PLAN_NAME[plan]} — не больше ${limit} PDF на бота. Удалите ненужный PDF или смените план`);

// Тело читается потоком с обрывом: ни заявленный размер, ни его отсутствие не дают принять больше потолка.
async function readBounded(request: Request, declared: number): Promise<Buffer | 'too_large' | 'short'> {
  const reader = request.body?.getReader();
  if (!reader) return 'short';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > declared || size > MAX_UPLOAD_BODY_BYTES) { await reader.cancel().catch(() => {}); return 'too_large'; }
    chunks.push(value);
  }
  return size === declared ? Buffer.concat(chunks, size) : 'short';
}

export function createSourceUploadHandler(deps: SourceUploadDependencies) {
  const log = deps.log ?? ((line: string) => console.error(line));
  const newId = deps.newId ?? randomUUID;
  return async (request: Request, botId: string): Promise<Response> => {
    let written: string | null = null;
    try {
      const ip = clientIp(request.headers);
      const token = readSessionCookie(request);
      const session = token ? await deps.authenticate(token) : null;
      if (!await deps.allowMutation(ip, session?.account_id)) return fail(429, 'limit', 'Слишком много запросов. Повторите через минуту');
      // Мутация кабинета: Origin обязателен и равен нашему (без него — отказ, а не «видимо, свой»).
      if (request.headers.get('origin') !== new URL(deps.publicOrigin).origin) return fail(403, 'origin_not_allowed', 'Источник запроса не разрешён');
      if (!session || !UUID.test(botId)) return notFound();
      const bot = await deps.readOwnedBot(botId, session.account_id);
      if (!bot) return notFound();
      const idempotencyKey = request.headers.get('idempotency-key') ?? '';
      if (!UUID.test(idempotencyKey)) return fail(400, 'invalid', 'Заголовок Idempotency-Key обязан быть UUID');
      // Повтор того же запроса — та же задача и тот же ответ, тело не читается повторно.
      const existing = await deps.findJob(botId, idempotencyKey);
      if (existing) return accepted(existing);
      const contentType = request.headers.get('content-type');
      if (contentType?.toLowerCase().startsWith('application/json')) {
        return fail(422, 'invalid', 'Добавление сайта этим маршрутом ещё не подключено: здесь принимается только PDF');
      }
      const boundary = readBoundary(contentType);
      if (!boundary) return fail(415, 'not_pdf', 'Ожидается PDF в теле multipart/form-data');
      const declaredRaw = request.headers.get('content-length');
      if (declaredRaw === null || !/^[0-9]{1,12}$/.test(declaredRaw)) return fail(400, 'invalid', 'Укажите размер тела (Content-Length)');
      const declared = Number(declaredRaw);
      if (declared > MAX_UPLOAD_BODY_BYTES) return tooLarge(); // отказ ДО приёма тела (SC-US-004-3)
      if (bot.pdfCount >= deps.pdfLimit(bot.plan)) return planLimit(bot.plan, deps.pdfLimit(bot.plan)); // тоже до приёма
      const body = await readBounded(request, declared);
      if (body === 'too_large') return tooLarge();
      if (body === 'short') return fail(400, 'invalid', 'Тело запроса оборвано: принято меньше заявленного');
      let file;
      try { file = parseSingleFile(body, boundary); }
      catch (error) {
        if (error instanceof MultipartError) return fail(400, 'invalid', `Непригодное тело загрузки: ${error.message}`);
        throw error;
      }
      if (file.fieldName !== 'file') return fail(400, 'invalid', 'Файл ожидается в поле «file»');
      if (file.data.length === 0) return fail(400, 'invalid', 'Файл пустой');
      if (file.data.length > PDF_MAX_BYTES) return tooLarge();
      if (!isPdfMagic(file.data)) return fail(415, 'not_pdf', 'Файл не является PDF: тип определяется по содержимому, а не по расширению');
      const indexJobId = newId();
      const path = join(deps.uploadDir, indexJobId);
      const handle = await open(path, 'wx', 0o600); // wx: никогда не переписать чужой файл
      written = path;
      try { await handle.writeFile(file.data); await handle.sync(); } finally { await handle.close(); }
      const result = await deps.createPdfSource({ accountId: session.account_id, botId, fileName: sanitizeFileName(file.fileName),
        idempotencyKey, indexJobId });
      if (result.kind !== 'created') {
        await unlink(path).catch(() => {});
        written = null;
        if (result.kind === 'existing') return accepted(result.indexJobId);
        if (result.kind === 'plan_limit') return planLimit(result.plan, result.limit);
        return notFound();
      }
      written = null; // файл принадлежит задаче: удаляет воркер после done/failed (ADR-018)
      // Очередь — ПОСЛЕ коммита. Сбой транспорта не теряет задачу: она queued, сторож доставит её снова.
      try { await deps.enqueue({ index_job_id: result.indexJobId, generation: 0 }); }
      catch { log('Загрузка PDF: транспорт заданий недоступен — задача останется queued до повторной доставки сторожем'); }
      return accepted(result.indexJobId);
    } catch (error) {
      if (written) await unlink(written).catch(() => {});
      log(`Загрузка PDF не завершена: ${error instanceof Error ? error.name : 'ошибка'}`);
      return fail(503, 'unavailable', 'Загрузка временно недоступна. Повторите позже');
    }
  };
}
