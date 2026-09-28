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
// Отказ в сторону СТРОГОСТИ. Пир не прокси, прокси не резолвится, последний элемент не
// адрес — ключом становится адрес пира. Для запроса через прокси это адрес прокси, то есть
// ОДИН ключ на всех гостей: лимит строже, а не шире. Обратная ошибка (неопознанное →
// «ограничений нет») здесь невозможна по построению.
// ─────────────────────────────────────────────────────────────────────────────

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';

function norm(a: string | undefined): string | undefined {
  if (!a) return undefined;
  const s = a.trim().replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = s.startsWith('::ffff:') ? s.slice(7) : s;
  if (isIP(v4) === 4) return v4;
  return isIP(s) ? s : undefined;
}

/** Чистая функция: пир, заголовок, множество адресов прокси → адрес гостя. */
export function pickClientIp(
  peer: string | undefined,
  xff: string | string[] | undefined,
  trusted: ReadonlySet<string>,
): string {
  const p = norm(peer);
  if (!p) return 'unknown';
  if (!trusted.has(p) || xff === undefined) return p;
  const chain = (Array.isArray(xff) ? xff.join(',') : xff).split(',');
  return norm(chain[chain.length - 1]) ?? p;
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
const TTL_MS = 30_000;   // адрес прокси меняется при его пересоздании
let trusted: ReadonlySet<string> = new Set();
let resolvedAt = 0;

async function trustedProxies(): Promise<ReadonlySet<string>> {
  if (!HOST || Date.now() - resolvedAt < TTL_MS) return trusted;
  try {
    const rs = await lookup(HOST, { all: true });
    trusted = new Set(rs.map((r) => norm(r.address)).filter((x): x is string => !!x));
  } catch (e) {
    // Прежнее множество сохраняется; пустое — строже, не шире (см. шапку).
    console.error('trusted_proxy_lookup_failed', { host: HOST, reason: (e as Error).message });
  }
  resolvedAt = Date.now();
  return trusted;
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
  return pickClientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], await trustedProxies());
}
