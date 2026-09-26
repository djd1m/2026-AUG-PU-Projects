// Разбор ответов API N6 в браузере: { data } | { error: { code, message, field? } }. Непригодная форма — null, а не
// «успех без данных» (экран показывает ошибку, а не пустоту).
export interface ApiError { code: string; message: string; field?: string }
export function errorOf(body: unknown): ApiError | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message, field } = error as { code?: unknown; message?: unknown; field?: unknown };
  return typeof code === 'string' && typeof message === 'string' ? { code, message, ...(typeof field === 'string' ? { field } : {}) } : null;
}
export const dataOf = <T,>(body: unknown): T | null => (typeof body === 'object' && body !== null && 'data' in body ? (body as { data: T }).data : null);
export async function send(url: string, method: 'POST' | 'PATCH', payload: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
