import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { DomainError } from '@n8/domain/common';
export const PEER_HEADER = 'x-n8-peer';
export const CLIENT_PEER_HEADER = 'x-n8-client-ip';
export function normalizePeer(peer: string | undefined | null): string {
  if (!peer || peer.includes('%') || !isIP(peer)) throw new DomainError(400, 'INVALID_PEER', 'Некорректное соединение');
  const normalized = peer.toLowerCase();
  if (normalized.startsWith('::ffff:') && isIP(normalized.slice(7)) === 4) return normalized.slice(7);
  // Canonicalize equivalent IPv6 forms, including hex-encoded IPv4 mapped addresses.
  if (isIP(normalized) === 6) {
    const canonical = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
    if (mapped) { const a = parseInt(mapped[1], 16), b = parseInt(mapped[2], 16); return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
    return canonical;
  }
  return normalized;
}
const reserved = (name: string) => name.startsWith('x-n8-') || name.startsWith('x-forwarded-') || name === 'content-security-policy' || name === 'x-nonce' || name === 'forwarded' || name === 'x-real-ip'
  || name.startsWith('x-middleware-') || name.startsWith('x-nextjs-') || name === 'x-invoke-path' || name === 'x-invoke-query' || name === 'x-invoke-status';
/** Called at the sole Node HTTP listener before Next creates a web Request. */
export function sanitizeIngress(req: IncomingMessage, trustedProxyIP?: string): void {
  const peer = normalizePeer(req.socket.remoteAddress);
  const counts = new Map<string, number>();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase(); counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const name of ['origin', 'host', 'cookie', 'if-match', 'content-type', 'content-length', 'idempotency-key']) {
    if ((counts.get(name) ?? 0) > 1) throw new DomainError(400, 'DUPLICATE_HEADER', 'Повтор заголовка');
  }
  let clientPeer: string | undefined;
  if (trustedProxyIP && peer === trustedProxyIP) {
    const raw = req.headers[CLIENT_PEER_HEADER];
    if (counts.get(CLIENT_PEER_HEADER) !== 1 || typeof raw !== 'string') throw new DomainError(400, 'INVALID_PROXY_CLIENT', 'Некорректный заголовок шлюза');
    clientPeer = normalizePeer(raw);
  }
  for (const name of Object.keys(req.headers)) if (reserved(name.toLowerCase())) delete req.headers[name];
  const cleaned: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) if (!reserved(req.rawHeaders[i].toLowerCase())) cleaned.push(req.rawHeaders[i], req.rawHeaders[i + 1]);
  cleaned.push(PEER_HEADER, peer); req.headers[PEER_HEADER] = peer;
  if (clientPeer) { cleaned.push(CLIENT_PEER_HEADER, clientPeer); req.headers[CLIENT_PEER_HEADER] = clientPeer; }
  req.rawHeaders = cleaned;
}
export function requestPeer(request: Request): string { return normalizePeer(request.headers.get(PEER_HEADER)); }

/** Only auth/share rate identity; payment verification always uses requestPeer. */
export function requestClientPeer(request: Request): string { return normalizePeer(request.headers.get(CLIENT_PEER_HEADER) ?? request.headers.get(PEER_HEADER)); }
