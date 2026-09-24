// Приёмка шага 8 REPRODUCE.md через настоящий HTTP: регистрация → video.create → части в S3 по
// подписанным ссылкам → завершение. Запускается ВНУТРИ сети стека (адрес прокси и хранилища по
// именам сервисов), поэтому ни MinIO, ни база наружу не публикуются.
//   docker run --rm --network <проект>_default -v "$PWD:/w" -w /w --entrypoint node <образ web> \
//     scripts/acceptance-upload.mjs <файл> [--music] [--teaser]
// Переменные: BASE (по умолчанию http://proxy:80), ORIGIN (обязательна — N5_PUBLIC_ORIGIN стека),
// S3_INTERNAL (необязательна, например http://minio:9000): когда S3_PUBLIC_ENDPOINT — внешнее имя, до
// которого из сети стека не дотянуться, части шлются во внутренний адрес с заголовком Host из
// подписанной ссылки. Подпись SigV4 привязана к Host, поэтому хранилище её принимает.
// CLIENT_IP (по умолчанию 198.51.100.7, TEST-NET-2): приложение за прокси без X-Forwarded-For
// не знает адреса клиента и отказывает (fail-closed, 503); в бою заголовок добавляет внешний
// TLS-прокси, здесь его изображает этот скрипт.
// Коды: 0 — файл принят, печатается video_id; 1 — шаг отказал (назван); 2 — не выполнено (нет входа).
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { request } from 'node:http';

const [file, ...flags] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://proxy:80';
const ORIGIN = process.env.ORIGIN;
if (!file || !ORIGIN) { console.error('НЕ ВЫПОЛНЕНО: нужен путь к файлу и ORIGIN'); process.exit(2); }
const fail = (step, detail) => { console.error(`❌ ${step}: ${detail}`); process.exit(1); };
let cookie = '';
async function call(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { origin: ORIGIN, 'x-forwarded-for': process.env.CLIENT_IP ?? '198.51.100.7', ...(cookie ? { cookie } : {}), ...init.headers } });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
const json = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const size = (await stat(file)).size;
const email = `acceptance-${Date.now()}@example.ru`, password = `acc-${randomUUID()}`;
let r = await call('/api/auth/register', json({ email, password }));
if (r.status >= 300) fail('регистрация', `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
if (!cookie) { r = await call('/api/auth/login', json({ email, password })); if (!cookie) fail('вход', `${r.status}`); }
console.log(`✅ аккаунт ${email}`);

const input = { filename: basename(file), declared_bytes: size, source: 'upload',
  ...(flags.includes('--music') ? { music: true } : {}), ...(flags.includes('--teaser') ? { teaser: true } : {}) };
r = await call('/api/trpc/video.create', { ...json(input), headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() } });
const upload = r.body?.result?.data?.data;
if (r.status >= 300 || !upload?.video_id) fail('video.create', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
console.log(`✅ video_id ${upload.video_id}, частей ${upload.parts.length} по ${upload.part_size} байт`);

async function put(url, body) {
  if (!process.env.S3_INTERNAL) {
    const res = await fetch(url, { method: 'PUT', body });
    return { status: res.status, etag: res.headers.get('etag') };
  }
  const signed = new URL(url), internal = new URL(process.env.S3_INTERNAL);
  return new Promise((resolve, reject) => {
    const req = request({ host: internal.hostname, port: internal.port || 80, method: 'PUT',
      path: signed.pathname + signed.search, headers: { host: signed.host, 'content-length': body.length } },
    res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, etag: res.headers.etag })); });
    req.on('error', reject); req.end(body);
  });
}
const data = await readFile(file);
const parts = [];
for (const part of upload.parts) {
  const start = (part.part_number - 1) * upload.part_size;
  const body = data.subarray(start, Math.min(size, start + upload.part_size));
  const { status, etag } = await put(part.url, body);
  if (status < 200 || status >= 300 || !etag) fail(`часть ${part.part_number}`, `${status} etag=${etag}`);
  parts.push({ part_number: part.part_number, etag });
}
console.log(`✅ части загружены: ${parts.length}`);
r = await call('/api/upload/complete', json({ video_id: upload.video_id, parts }));
if (r.status >= 300) fail('upload/complete', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
console.log(`✅ загрузка завершена: ${r.status}`);
console.log(`VIDEO_ID=${upload.video_id}`);
