import { planOf } from '@n6b/db';
import { normalizeOrigin } from './origin';

export const PRIVACY_NOTICE = 'Вопросы обрабатывает внешняя модель через OpenRouter (OpenAI). Не сообщайте персональные данные';
export { PUBLIC_ID_RE } from '../lib/referral-cookie';

/** Origin headers are serialized origins, unlike publication form URLs. Reject path/query/fragment. */
export function requestOrigin(raw: string | null): string | null {
  if (!raw || raw !== raw.trim() || /[\\\s]/u.test(raw) || !/^https?:\/\/[^/?#]+$/i.test(raw)) return null;
  return normalizeOrigin(raw);
}

export function badgeRequired(plan: unknown, removal: unknown): boolean {
  const value = planOf(plan);
  return !((value === 'start' || value === 'studio') && removal === 'active');
}
