// Граница файла POST /api/bots/{bot_id}/sources (CreateSource п.1–2, 4–5; FR-SOURCE-003; SC-US-004-3; ADR-018):
// порядок отказов, размер по Content-Length И по принятым байтам, тип по первым байтам, предел плана ДО приёма
// тела, повтор с тем же ключом, «строка задачи есть ⇒ файл есть», уборка всего, что не стало задачей.
// Зависимости подменены; тот же обработчик на настоящем Postgres — tests/pdf-job.integration.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDF_MAX_BYTES, PDFS_BY_PLAN } from '../packages/rag/src/constants';
import type { AccountPlan } from '../packages/rag/src/enums';
import type { CreatePdfSourceInput, CreatePdfSourceResult } from '../packages/db/src/pdf-sources';
import { createSourceUploadHandler, MAX_UPLOAD_BODY_BYTES, type SourceUploadDependencies } from '../apps/web/src/server/source-upload-handler';
import { BOUNDARY, multipart, normalPdf } from './fixtures/pdf-factory';

const ORIGIN = 'https://sufler.test.invalid';
const BOT = '8d8a3b8e-3c3f-4a8e-9a55-2f3f2d1a0b11';
const ACCOUNT = '1b7f0f6e-8a2c-4a9b-9d7e-6c5b4a3f2e1d';
const TOKEN = 'a'.repeat(43);

// Поток тела, который ведёт счёт прочитанного: «отказ ДО приёма тела» проверяется, а не подразумевается.
function countingBody(body: Buffer, chunk = 64 * 1024) {
  const state = { pulled: 0 };
  let offset = 0;
  // highWaterMark 0: поток не подкачивает впрок — pulled считает только то, что обработчик ПРОЧИТАЛ.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.length) { controller.close(); return; }
      const part = body.subarray(offset, offset + chunk);
      offset += part.length;
      state.pulled += part.length;
      controller.enqueue(new Uint8Array(part));
    },
  }, { highWaterMark: 0 });
  return { stream, state };
}
function request(body: Buffer, headers: Record<string, string | null> = {}, contentLength = body.length) {
  const counted = countingBody(body);
  const base: Record<string, string | null> = { 'x-forwarded-for': '198.51.100.7', origin: ORIGIN, cookie: `__Host-n6_session=${TOKEN}`,
    'idempotency-key': randomUUID(), 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, 'content-length': String(contentLength), ...headers };
  const clean = Object.fromEntries(Object.entries(base).filter((e): e is [string, string] => e[1] !== null));
  const req = new Request(`${ORIGIN}/api/bots/${BOT}/sources`, { method: 'POST', headers: clean, body: counted.stream, duplex: 'half' } as RequestInit);
  return { req, read: counted.state };
}

let dir: string;
let calls: string[];
let created: CreatePdfSourceInput[];
function deps(overrides: Partial<SourceUploadDependencies> = {}, plan: AccountPlan = 'free', pdfCount = 0): SourceUploadDependencies {
  return {
    publicOrigin: ORIGIN, uploadDir: dir, log: () => {},
    authenticate: vi.fn(async (token: string) => (token === TOKEN ? { account_id: ACCOUNT } : null)),
    allowMutation: vi.fn(async () => { calls.push('limit'); return true; }),
    readOwnedBot: vi.fn(async (botId: string, accountId: string) => { calls.push('bot'); return botId === BOT && accountId === ACCOUNT ? { plan, pdfCount } : null; }),
    pdfLimit: (p: AccountPlan) => PDFS_BY_PLAN[p],
    findJob: vi.fn(async () => { calls.push('find'); return null; }),
    createPdfSource: vi.fn(async (input: CreatePdfSourceInput): Promise<CreatePdfSourceResult> => {
      calls.push('create');
      created.push(input);
      // Файл обязан лежать в томе к моменту создания строки задачи.
      expect(readFileSync(join(dir, input.indexJobId)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      return { kind: 'created', indexJobId: input.indexJobId };
    }),
    enqueue: vi.fn(async () => { calls.push('enqueue'); }),
    ...overrides,
  };
}
const files = () => readdirSync(dir);
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'n6-uploads-')); calls = []; created = []; });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Загрузка PDF: успех', () => {
  it('202 { index_job_id }; файл в томе под этим именем, байты совпадают; очередь ПОСЛЕ создания', async () => {
    const pdf = normalPdf();
    const d = deps();
    const { req } = request(multipart(pdf, 'C:\\Users\\me\\прайс#2026.pdf'));
    const response = await createSourceUploadHandler(d)(req, BOT);
    expect(response.status).toBe(202);
    const id = ((await response.json()) as { data: { index_job_id: string } }).data.index_job_id;
    expect(files()).toEqual([id]);
    expect(readFileSync(join(dir, id)).equals(pdf)).toBe(true);
    expect(created[0]).toMatchObject({ accountId: ACCOUNT, botId: BOT, fileName: 'прайс_2026.pdf', indexJobId: id });
    expect(calls).toEqual(['limit', 'bot', 'find', 'create', 'enqueue']);
    expect(d.enqueue).toHaveBeenCalledWith({ index_job_id: id, generation: 0 });
  });
  it('тип — по содержимому, а не по расширению: PDF с именем .txt принят', async () => {
    const response = await createSourceUploadHandler(deps())(request(multipart(normalPdf(), 'notes.txt')).req, BOT);
    expect(response.status).toBe(202);
  });
  it('транспорт очереди недоступен → всё равно 202 (задача queued, сторож доставит)', async () => {
    const response = await createSourceUploadHandler(deps({ enqueue: async () => { throw new Error('redis'); } }))(request(multipart(normalPdf())).req, BOT);
    expect(response.status).toBe(202);
    expect(files()).toHaveLength(1);
  });
});

describe('Загрузка PDF: отказы и их порядок', () => {
  it('SC-US-004-3: 11 МБ по Content-Length → 413 с названием предела ДО приёма тела', async () => {
    const d = deps();
    const { req, read } = request(Buffer.alloc(1024), {}, 11 * 1000 * 1000);
    const response = await createSourceUploadHandler(d)(req, BOT);
    expect(response.status).toBe(413);
    expect(JSON.stringify(await response.json())).toContain('10 МБ');
    expect(read.pulled).toBe(0);
    expect(files()).toEqual([]);
  });
  it('файл 10 МБ + 1 байт при честном Content-Length → 413, файла нет', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(PDF_MAX_BYTES + 1 - 9, 0x20)]);
    const body = multipart(pdf);
    expect(body.length).toBeLessThanOrEqual(MAX_UPLOAD_BODY_BYTES);
    const response = await createSourceUploadHandler(deps())(request(body).req, BOT);
    expect(response.status).toBe(413);
    expect(files()).toEqual([]);
  });
  it('Content-Length лжёт (заявлено 1 КБ, прислано 3 МБ) → чтение оборвано, 413, файла нет', async () => {
    const body = multipart(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024, 0x20)]));
    const { req, read } = request(body, {}, 1024);
    const response = await createSourceUploadHandler(deps())(req, BOT);
    expect(response.status).toBe(413);
    expect(read.pulled).toBeLessThanOrEqual(128 * 1024);
    expect(files()).toEqual([]);
  });
  it('принято меньше заявленного → 400, файла нет', async () => {
    const body = multipart(normalPdf());
    const response = await createSourceUploadHandler(deps())(request(body, {}, body.length + 100).req, BOT);
    expect(response.status).toBe(400);
    expect(files()).toEqual([]);
  });
  it.each([
    ['PNG с расширением .pdf', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)])],
    ['текст с «%PDF-» не в начале', Buffer.from(' %PDF-1.4\nтекст')],
    ['«%PDF» без дефиса', Buffer.from('%PDF1.4\n')],
  ])('не PDF (%s) → 415 not_pdf, файла нет, задача не создана', async (_title, file) => {
    const response = await createSourceUploadHandler(deps())(request(multipart(file, 'price.pdf')).req, BOT);
    expect(response.status).toBe(415);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('not_pdf');
    expect(files()).toEqual([]);
    expect(created).toEqual([]);
  });
  it('пустой файл → 400', async () => {
    expect((await createSourceUploadHandler(deps())(request(multipart(Buffer.alloc(0))).req, BOT)).status).toBe(400);
  });
  it('SC-US-004-3: четвёртый PDF на free → 403 plan_limit с названием предела ДО приёма тела', async () => {
    const { req, read } = request(multipart(normalPdf()));
    const response = await createSourceUploadHandler(deps({}, 'free', 3))(req, BOT);
    expect(response.status).toBe(403);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('plan_limit');
    expect(body).toContain('free');
    expect(body).toContain('3 PDF');
    expect(read.pulled).toBe(0);
  });
  it('на nobadge 4-й PDF принят, 11-й — нет (предел 10)', async () => {
    expect((await createSourceUploadHandler(deps({}, 'nobadge', 3))(request(multipart(normalPdf())).req, BOT)).status).toBe(202);
    expect((await createSourceUploadHandler(deps({}, 'nobadge', 10))(request(multipart(normalPdf())).req, BOT)).status).toBe(403);
  });
  it('предел, исчерпанный параллельной загрузкой (атомарная проверка в транзакции) → 403, принятый файл удалён', async () => {
    const d = deps({ createPdfSource: async () => ({ kind: 'plan_limit', plan: 'free', limit: 3 }) });
    const response = await createSourceUploadHandler(d)(request(multipart(normalPdf())).req, BOT);
    expect(response.status).toBe(403);
    expect(files()).toEqual([]);
  });
  it('повтор с тем же Idempotency-Key → тот же 202, тело не читается, файла нет', async () => {
    const id = randomUUID();
    const { req, read } = request(multipart(normalPdf()));
    const response = await createSourceUploadHandler(deps({ findJob: async () => id }))(req, BOT);
    expect(response.status).toBe(202);
    expect(((await response.json()) as { data: { index_job_id: string } }).data.index_job_id).toBe(id);
    expect(read.pulled).toBe(0);
    expect(files()).toEqual([]);
  });
  it('одновременный повтор, выигравший вставку первым → 202 его задачи, свой файл удалён', async () => {
    const id = randomUUID();
    const response = await createSourceUploadHandler(deps({ createPdfSource: async () => ({ kind: 'existing', indexJobId: id }) }))(request(multipart(normalPdf())).req, BOT);
    expect(((await response.json()) as { data: { index_job_id: string } }).data.index_job_id).toBe(id);
    expect(files()).toEqual([]);
  });
  it('сбой БД при создании → 503, принятый файл удалён', async () => {
    const response = await createSourceUploadHandler(deps({ createPdfSource: async () => { throw new Error('db down'); } }))(request(multipart(normalPdf())).req, BOT);
    expect(response.status).toBe(503);
    expect(files()).toEqual([]);
  });
  it('лимит частоты — первым: 429 до Origin, владения и тела', async () => {
    const d = deps({ allowMutation: async () => false });
    const { req, read } = request(multipart(normalPdf()), { origin: 'https://evil.example' });
    expect((await createSourceUploadHandler(d)(req, BOT)).status).toBe(429);
    expect(d.readOwnedBot).not.toHaveBeenCalled();
    expect(read.pulled).toBe(0);
  });
  it.each([['чужой Origin', { origin: 'https://evil.example' }], ['без Origin', { origin: null }]])('%s → 403 до владения ботом', async (_t, headers) => {
    const d = deps();
    expect((await createSourceUploadHandler(d)(request(multipart(normalPdf()), headers).req, BOT)).status).toBe(403);
    expect(d.readOwnedBot).not.toHaveBeenCalled();
  });
  it('без сессии, чужой или несуществующий бот, непригодный bot_id — одинаковый 404', async () => {
    const handler = createSourceUploadHandler(deps());
    const answers = [
      await handler(request(multipart(normalPdf()), { cookie: null }).req, BOT),
      await handler(request(multipart(normalPdf())).req, randomUUID()),
      await handler(request(multipart(normalPdf())).req, 'not-a-uuid'),
    ];
    for (const response of answers) expect([response.status, await response.json()]).toEqual([404, { error: { code: 'not_found', message: 'Бот не найден' } }]);
    expect(files()).toEqual([]);
  });
  it.each([
    ['Idempotency-Key не UUID', { 'idempotency-key': 'abc' }, 400],
    ['без Content-Length', { 'content-length': null }, 400],
    ['JSON с url (сайт — не этим маршрутом пока)', { 'content-type': 'application/json' }, 422],
    ['не multipart', { 'content-type': 'application/pdf' }, 415],
  ] as Array<[string, Record<string, string | null>, number]>)('%s → отказ, тело не читается', async (_t, headers, status) => {
    const { req, read } = request(multipart(normalPdf()), headers);
    expect((await createSourceUploadHandler(deps())(req, BOT)).status).toBe(status);
    expect(read.pulled).toBe(0);
    expect(files()).toEqual([]);
  });
  it('поле не «file» или две части → 400, файла нет', async () => {
    expect((await createSourceUploadHandler(deps())(request(multipart(normalPdf(), 'a.pdf', 'document')).req, BOT)).status).toBe(400);
    const two = Buffer.concat([multipart(normalPdf()).subarray(0, -4), Buffer.from('\r\nContent-Disposition: form-data; name="x"\r\n\r\ny\r\n--' + BOUNDARY + '--\r\n')]);
    expect((await createSourceUploadHandler(deps())(request(two).req, BOT)).status).toBe(400);
    expect(files()).toEqual([]);
  });
});
