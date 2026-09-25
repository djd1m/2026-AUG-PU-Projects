// Тестовые данные для проверки ВСЕХ экранов (шаг 0 плана mobile UI, OWN-016): аккаунт → загрузка записи со
// всеми галочками → ожидание готовых клипов → гостевой пакет. Через настоящий HTTP изнутри сети стека,
// как scripts/acceptance-upload.mjs (там же — зачем S3_INTERNAL и X-Forwarded-For).
//   docker run --rm --network <проект>_default -v "$PWD:/w" -v <каталог_вывода>:/out -w /w \
//     -e ORIGIN=https://clipmkr.ru -e S3_INTERNAL=http://minio:9000 --entrypoint node <образ web> \
//     scripts/seed-ui-fixture.mjs <файл> /out/ui-fixture.json
// Результат — JSON с почтой, паролем, video_id, адресами экранов; файл создаётся с правами 0600 и НЕ
// коммитится (это учётные данные тестового аккаунта). Коды: 0 — данные готовы; 1 — шаг отказал; 2 — нет входа.
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { request } from 'node:http';

const [file, out] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://proxy:80';
const ORIGIN = process.env.ORIGIN;
const WAIT_MS = Number(process.env.WAIT_MS ?? 20 * 60_000);
if (!file || !out || !ORIGIN) { console.error('НЕ ВЫПОЛНЕНО: нужны файл, путь вывода и ORIGIN'); process.exit(2); }
const fail = (step, detail) => { console.error(`❌ ${step}: ${detail}`); process.exit(1); };
let cookie = '';
async function call(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { origin: ORIGIN, 'x-forwarded-for': process.env.CLIENT_IP ?? '198.51.100.8',
    ...(cookie ? { cookie } : {}), ...init.headers } });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
  const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
const post = (path, body, headers = {}) => call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const query = (method, input) => call(`/api/trpc/${method}?input=${encodeURIComponent(JSON.stringify(input))}`);
const data = r => r.body?.result?.data?.data;
function put(url, body) {
  if (!process.env.S3_INTERNAL) return fetch(url, { method: 'PUT', body }).then(r => ({ status: r.status, etag: r.headers.get('etag') }));
  const signed = new URL(url), internal = new URL(process.env.S3_INTERNAL);
  return new Promise((resolve, reject) => {
    const req = request({ host: internal.hostname, port: internal.port || 80, method: 'PUT', path: signed.pathname + signed.search,
      headers: { host: signed.host, 'content-length': body.length } }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, etag: res.headers.etag })); });
    req.on('error', reject); req.end(body);
  });
}

// Повторный запуск продолжает: учётные данные и video_id пишутся в файл сразу, а не в конце.
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
const email = prior?.email ?? `ui-fixture-${Date.now()}@example.ru`, password = prior?.password ?? randomBytes(18).toString('base64url');
const progress = { ...(prior ?? {}), origin: ORIGIN, email, password };
const save = extra => { Object.assign(progress, extra); return writeFile(out, JSON.stringify(progress, null, 2), { mode: 0o600 }); };
let r;
if (!prior) {
  r = await post('/api/auth/register', { email, password });
  if (r.status >= 300) fail('регистрация', `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  await save({});
}
if (!cookie) { r = await post('/api/auth/login', { email, password }); if (!cookie) fail('вход', String(r.status)); }
console.log(`✅ аккаунт ${email}${prior ? ' (продолжение)' : ''}`);

let upload = prior?.video_id ? { video_id: prior.video_id } : null;
if (!upload) {
const size = (await stat(file)).size;
r = await post('/api/trpc/video.create', { filename: basename(file), declared_bytes: size, source: 'upload', music: true, teaser: true, compact: true },
  { 'idempotency-key': randomUUID() });
upload = data(r);
if (r.status >= 300 || !upload?.video_id) fail('video.create', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
const bytes = await readFile(file), parts = [];
for (const part of upload.parts) {
  const start = (part.part_number - 1) * upload.part_size;
  const { status, etag } = await put(part.url, bytes.subarray(start, Math.min(size, start + upload.part_size)));
  if (status < 200 || status >= 300 || !etag) fail(`часть ${part.part_number}`, `${status}`);
  parts.push({ part_number: part.part_number, etag });
}
r = await post('/api/upload/complete', { video_id: upload.video_id, parts });
if (r.status >= 300) fail('upload/complete', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
await save({ video_id: upload.video_id });
console.log(`✅ загружено, video_id ${upload.video_id}; жду клипы до ${WAIT_MS / 60000} мин`);
}

const deadline = Date.now() + WAIT_MS; let video;
for (;;) {
  video = data(await query('video.get', { video_id: upload.video_id }));
  if (video?.status === 'done') break;
  if (video?.status === 'failed') fail('обработка', JSON.stringify(video).slice(0, 300));
  if (Date.now() > deadline) fail('обработка', `не завершилась за ${WAIT_MS / 60000} мин, статус ${video?.status}`);
  await new Promise(res => setTimeout(res, 10_000));
}
const clips = data(await query('clip.list', { video_id: upload.video_id }));
const list = Array.isArray(clips) ? clips : clips?.clips ?? [];
if (!list.length) fail('clip.list', JSON.stringify(clips).slice(0, 300));
console.log(`✅ клипов: ${list.length}`);

let short_code = prior?.short_code;
if (!short_code) {
  r = await post('/api/trpc/link.create', { clip_id: list[0].clip_id });
  short_code = data(r)?.code;
  if (r.status >= 300 || !short_code) fail('link.create', `HTTP ${r.status}: короткая ссылка не создана`);
  await save({ video_id: upload.video_id, short_code });
}

if (!progress.guest_pack_id) {
  r = await post('/api/trpc/guest.create', { video_id: upload.video_id, clip_ids: list.slice(0, 2).map(c => c.clip_id), guest_name: 'Тестовый гость',
    consent_confirmed: true, consent_version: 'guest-publication-v1',
    consent_text_hash: (await import('node:crypto')).createHash('sha256').update('Гость согласен на публикацию этих клипов').digest('hex') });
  const pack = data(r);
  if (r.status >= 300 || !pack?.guest_pack_id) fail('guest.create', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  await save({ guest_pack_id: pack.guest_pack_id, screens: {} });
}
if (!progress.screens?.guest) {
  r = await post('/api/trpc/guest.send', { guest_pack_id: progress.guest_pack_id, channel: 'copy' });
  const guest = data(r)?.url;
  if (r.status >= 300 || !guest) fail('guest.send', `HTTP ${r.status}: гостевая ссылка не получена`);
  await save({ screens: { guest } });
}

const fixture = { ...progress, created_at: new Date().toISOString(), video_id: upload.video_id, short_code,
  screens: { dashboard: '/dashboard', video: `/dashboard/videos/${upload.video_id}`, guest: progress.screens.guest }, clip_ids: list.map(c => c.clip_id) };
await writeFile(out, JSON.stringify(fixture, null, 2), { mode: 0o600 });
console.log(`✅ гостевая страница ${fixture.screens.guest}`);
console.log(`FIXTURE=${out}`);
