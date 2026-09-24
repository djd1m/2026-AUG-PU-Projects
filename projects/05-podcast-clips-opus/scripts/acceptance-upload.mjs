// Приёмка шага 8 REPRODUCE.md через настоящий HTTP: регистрация → video.create → части в S3 по
// подписанным ссылкам → завершение. Запускается ВНУТРИ сети стека (адрес прокси и хранилища по
// именам сервисов), поэтому ни MinIO, ни база наружу не публикуются.
//   docker run --rm --network <проект>_default -v "$PWD:/w" -w /w --entrypoint node <образ web> \
//     scripts/acceptance-upload.mjs <файл> [--music] [--teaser]
// Переменные: BASE (по умолчанию http://proxy:80), ORIGIN (обязательна — N5_PUBLIC_ORIGIN стека).
// Коды: 0 — файл принят, печатается video_id; 1 — шаг отказал (назван); 2 — не выполнено (нет входа).
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

const [file, ...flags] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://proxy:80';
const ORIGIN = process.env.ORIGIN;
if (!file || !ORIGIN) { console.error('НЕ ВЫПОЛНЕНО: нужен путь к файлу и ORIGIN'); process.exit(2); }
const fail = (step, detail) => { console.error(`❌ ${step}: ${detail}`); process.exit(1); };
let cookie = '';
async function call(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...init.headers } });
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

const data = await readFile(file);
const parts = [];
for (const part of upload.parts) {
  const start = (part.part_number - 1) * upload.part_size;
  const res = await fetch(part.url, { method: 'PUT', body: data.subarray(start, Math.min(size, start + upload.part_size)) });
  const etag = res.headers.get('etag');
  if (!res.ok || !etag) fail(`часть ${part.part_number}`, `${res.status} etag=${etag}`);
  parts.push({ part_number: part.part_number, etag });
}
console.log(`✅ части загружены: ${parts.length}`);
r = await call('/api/upload/complete', json({ video_id: upload.video_id, parts }));
if (r.status >= 300) fail('upload/complete', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
console.log(`✅ загрузка завершена: ${r.status}`);
console.log(`VIDEO_ID=${upload.video_id}`);
