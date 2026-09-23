import { createHmac, timingSafeEqual } from 'node:crypto';

// This signed URL is on the existing file route. The S3 capability never reaches the guest.
export function guestFileTicket(secret: string, id: string, kind: string, code: string, download: boolean, until: string) {
  return createHmac('sha256', secret).update(JSON.stringify(['guest-file-v1', id, kind, code, download, until])).digest('base64url');
}
export function validGuestFileTicket(signature: string, expected: string, until: string, now: Date) {
  if (!/^\d{13}$/.test(until) || Number(until) <= now.getTime() || Number(until) > now.getTime() + 900_000) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export async function streamGuestFile(url: string, request: Request): Promise<Response> {
  const range = request.headers.get('range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response(null, { status: 416 });
  // URL comes only from our S3 signer; never from request input. No upstream redirect escape.
  const upstream = await fetch(url, { headers: range ? { Range: range } : {}, redirect: 'error',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
  if (![200, 206, 416].includes(upstream.status)) {
    await upstream.body?.cancel(); throw new Error('Storage unavailable');
  }
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff' });
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) {
    const value = upstream.headers.get(key); if (value) headers.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
