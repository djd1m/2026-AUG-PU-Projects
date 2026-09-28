// Адрес гостя — ключ лимита приватных обращений (intake) и вход device_hash (журнал).
//
// ─────────────────────────────────────────────────────────────────────────────
// ГРАНИЦА ДОВЕРИЯ. guest стоит за общим TLS-прокси машины (Caddy, сеть talk-ai-public) и
// НЕ публикует порт на хост (docker-compose.yml: только `expose`). Но сеть talk-ai-public
// общая: в ней десяток чужих контейнеров, и любой из них достаёт guest:3000 напрямую с
// любым X-Forwarded-For. Поэтому заголовок читается ТОЛЬКО если сокет пришёл с адреса
// доверенного прокси (TRUSTED_PROXY_HOST, резолвится DNS сети compose).
//
// Какой элемент. Прокси ДОПИСЫВАЕТ адрес своего пира в конец цепочки (Caddy 2.10 без
// trusted_proxies и вовсе ЗАМЕНЯЕТ заголовок клиента одним адресом). Доверять можно только
// ПОСЛЕДНЕМУ элементу — его записал наш прокси. Первый — значение клиента: взять его значит
// обнулить лимит сменой заголовка (урок N1, deployment-seams.md; тот же подход, что
// extractClientIP в N1 и clientIp в N6).
//
// Отказ — в сторону НЕДОВЕРИЯ к заголовку. Пир не прокси, прокси не резолвится, последний
// элемент не адрес — ключом становится адрес пира. Для запроса через прокси это адрес прокси,
// то есть ОДИН ключ на всех гостей. Это не монотонное ужесточение: у ключа прокси свой
// счётчик, и гость, исчерпавший свои 10, на время сбоя DNS получит ещё до 10 под общим
// ключом (вызвать сбой DNS извне нельзя). Неопознанное → «ограничений нет» невозможно.
// ─────────────────────────────────────────────────────────────────────────────

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';

/** КАНОНИЧЕСКАЯ запись адреса: у одного адреса — один ключ. `2001:db8::1` и
 *  `2001:0db8:0:0:0:0:0:1`, `::ffff:192.0.2.1` и `::ffff:c000:201` — один адрес; без
 *  канонизации это разные ключи лимита. IPv6 нормализует WHATWG URL (нули сжаты, нижний
 *  регистр, встроенный IPv4 — в hex), IPv4-mapped сводится к IPv4. Всё, что не адрес, —
 *  undefined. КОПИЯ живёт в services/intake/src/server.ts (другой контейнер, другой образ);
 *  расхождение ловит таблица в seam-guest-ip.test.ts. */
export function canonIp(a: string | undefined): string | undefined {
  if (!a) return undefined;
  // Скобки снимаются только ПАРОЙ: `[192.0.2.1` и `192.0.2.1]` — не адрес.
  const s = a.trim().replace(/^\[(.*)\]$/, '$1');
  const kind = isIP(s);
  if (kind === 4) return s;
  if (kind !== 6) return undefined;
  let h: string;
  try { h = new URL(`http://[${s}]/`).hostname.slice(1, -1); } catch { return undefined; }
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (!m) return h;
  const hi = parseInt(m[1]!, 16), lo = parseInt(m[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Чистая функция: пир, заголовок, множество адресов прокси → адрес гостя. */
export function pickClientIp(
  peer: string | undefined,
  xff: string | string[] | undefined,
  trusted: ReadonlySet<string>,
): string {
  const p = canonIp(peer);
  if (!p) return 'unknown';
  if (!trusted.has(p) || xff === undefined) return p;
  const chain = (Array.isArray(xff) ? xff.join(',') : xff).split(',');
  return canonIp(chain[chain.length - 1]) ?? p;
}

/** Имя прокси без права на дефолт в проде: без него адрес гостя не отличить от адреса
 *  прокси, и лимит «с адреса» снова стал бы лимитом «на всех». Громкий отказ при старте
 *  дешевле тихой склейки, которую заметит только заведение. */
function proxyHost(): string | undefined {
  const v = process.env.TRUSTED_PROXY_HOST?.trim();
  if (v) return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TRUSTED_PROXY_HOST не задан. Без него лимит «10 с адреса» считает всех гостей за одного.');
  }
  return undefined;   // dev/test: заголовок не читается вовсе, ключ — адрес пира
}

const HOST = proxyHost();
const TTL_MS = 30_000;          // адрес прокси меняется при его пересоздании
const LOOKUP_DEADLINE_MS = 1_000;
let trusted: ReadonlySet<string> = new Set();
let resolvedAt = 0;
let inflight: Promise<ReadonlySet<string>> | null = null;

/** Множество адресов прокси. Отказ DNS или дедлайн — ПУСТОЕ множество, а не прежнее:
 *  прежний адрес прокси мог достаться чужому контейнеру сети, и сохранённое доверие
 *  отдало бы ему право выбирать ключ заголовком. Пустое — строже: ключ = адрес пира.
 *  Остаточное окно: переиспользование адреса прокси чужим контейнером внутри TTL (30 с). */
export async function refresh(host: string): Promise<ReadonlySet<string>> {
  try {
    const rs = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('lookup deadline')), LOOKUP_DEADLINE_MS).unref()),
    ]);
    trusted = new Set(rs.map((r) => canonIp(r.address)).filter((x): x is string => !!x));
  } catch (e) {
    trusted = new Set();
    console.error('trusted_proxy_lookup_failed', { host, reason: (e as Error).message });
  }
  resolvedAt = Date.now();
  return trusted;
}

async function trustedProxies(): Promise<ReadonlySet<string>> {
  if (!HOST || Date.now() - resolvedAt < TTL_MS) return trusted;
  // Одновременные запросы после истечения TTL ждут ОДИН резолв, а не порождают свой каждый.
  inflight ??= refresh(HOST).finally(() => { inflight = null; });
  return inflight;
}

/** Проверка при старте в проде: имя прокси обязано резолвиться. Иначе каждый гость
 *  получил бы ключ прокси — тот самый дефект, только тихий. Контейнер перезапустится
 *  (restart: unless-stopped), пока прокси не появится в сети. */
export async function assertProxyResolvable(): Promise<void> {
  if (!HOST) return;
  const set = await trustedProxies();
  if (set.size === 0) throw new Error(`TRUSTED_PROXY_HOST=${HOST} не резолвится: адрес гостя не отличить от адреса прокси`);
}

export async function clientIp(req: IncomingMessage): Promise<string> {
  // Пир и заголовок читаются СИНХРОННО, до ожидания: вызов «отправил и забыл» может
  // завершиться после ответа, когда сокет уже закрыт.
  const peer = req.socket.remoteAddress;
  const xff = req.headers['x-forwarded-for'];
  return pickClientIp(peer, xff, await trustedProxies());
}
