type RpcMethod = 'video.get' | 'video.list' | 'clip.list' | 'video.create' | 'video.retry' | 'clip.markDownloaded';
export async function rpc<T>(method: RpcMethod, input: object, mutation = false, key?: string, signal?: AbortSignal): Promise<T> {
  const url = `/api/trpc/${method}${mutation ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
  const deadline = AbortSignal.timeout(mutation ? 360000 : 4500);
  const response = await fetch(url, { method: mutation ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    ...(mutation ? { headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(input) } : {}) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message ?? 'Не удалось получить ответ. Повторите позже');
  return body.result.data.data as T;
}
