import { enqueuePdfSource, PDF_MAX_BYTES, PdfUploadError, validatePdfBytes, withTenant } from '@n6b/db';
import { readSessionCookie } from './auth-handler';
import type { JobsDeps } from './jobs-handler';

// The bounded multipart envelope is parsed only after the stream has reached EOF.
export const PDF_MULTIPART_OVERHEAD = 64 * 1024;
export const PDF_BODY_MAX = PDF_MAX_BYTES + PDF_MULTIPART_OVERHEAD;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, message: string) => Response.json(
  { error: { code: 'pdf_upload_failed', message } }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function readPdfUpload(request: Request): Promise<{ name: string; bytes: Uint8Array }> {
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > PDF_BODY_MAX) {
    await request.body?.cancel().catch(() => undefined);
    throw new PdfUploadError(413, 'PDF должен быть не больше 10 МиБ');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PdfUploadError(422, 'Выберите один PDF-файл');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PDF_BODY_MAX) {
        await reader.cancel().catch(() => undefined);
        throw new PdfUploadError(413, 'PDF должен быть не больше 10 МиБ');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks, size), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch { throw new PdfUploadError(422, 'Неверная загрузка: выберите один PDF-файл'); }
  const fields = [...form.entries()];
  const entry = fields[0];
  if (fields.length !== 1 || entry?.[0] !== 'file' || typeof entry[1] === 'string') {
    throw new PdfUploadError(422, 'Загрузите один файл в поле file');
  }
  const file = entry[1];
  if (file.size > PDF_MAX_BYTES) throw new PdfUploadError(413, 'PDF должен быть не больше 10 МиБ');
  if (!file.name.trim() || file.name.length > 255) throw new PdfUploadError(422, 'Укажите имя файла до 255 символов');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validatePdfBytes(bytes);
  return { name: file.name, bytes };
}

export function createPdfSourceHandler(deps: JobsDeps) {
  return async (request: Request, botId: string): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== new URL(deps.publicBaseUrl).origin) return fail(403, 'Источник запроса не разрешён');
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'Войдите в кабинет');
      if (!UUID.test(botId)) return fail(404, 'Не найдено');
      const visible = await withTenant(deps.tenantPool, accountId, async (c) =>
        (await c.query('SELECT 1 FROM bot WHERE id = $1', [botId])).rowCount === 1);
      if (!visible) return fail(404, 'Не найдено');
      const file = await readPdfUpload(request);
      const result = await enqueuePdfSource(deps.tenantPool, accountId, botId, file.name, file.bytes);
      if (result === 'cap') return fail(409, 'На Free можно добавить не больше 3 PDF на бота');
      if (!result) return fail(404, 'Не найдено');
      return Response.json({ data: { job_id: result.jobId } }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof PdfUploadError) return fail(error.status, error.message);
      (deps.log ?? console.error)(`pdf upload: ${(error as Error).name}`);
      return fail(503, 'Сервис временно недоступен. Повторите позже');
    }
  };
}
