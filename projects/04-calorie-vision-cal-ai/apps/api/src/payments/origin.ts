// Адрес источника уведомления ЮKassa.
//
// ПОРТИРОВАНО из `projects/01-testimonials-senja/apps/web/src/lib/payment.ts` (список сетей) и
// общего снаряжения `.claude/snippets/typescript/cidr-match.ts` (проверка принадлежности).
// Список — КОД-ВЛАДЕЕМЫЙ закрытый набор, не переменная окружения (`fail-closed-defaults.md`,
// правило 3): вынесенный наружу список однажды приедет пустым, и пустой список читается как
// «ограничений нет» ровно там, где он единственная защита.
//
// ⚠️ Совпадение адреса САМО ПО СЕБЕ не доказывает подлинность — адрес подделываем, а за
// прокси он вообще берётся из заголовка. Применяется В ПАРЕ с перезапросом статуса у
// провайдера (`yookassa.ts`, `verifyNotification`), и ни одна из двух проверок другую не
// заменяет.

import { ipInAnyCidr } from './cidr-match.js';

/** Сети ЮKassa. Проверено на живом стенде N1; включает IPv6-диапазон. */
export const YOOKASSA_NETWORKS: readonly string[] = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

export type OriginVerdict =
  | { readonly ok: true; readonly ip: string }
  | { readonly ok: false; readonly reason: 'no_ip' | 'foreign_ip' };

/** Пустой и неизвестный адрес — ОТКАЗ, а не «проверить не смогли, пропустим». */
export function verifyYooKassaOrigin(ip: string | null | undefined): OriginVerdict {
  const value = (ip ?? '').trim();
  if (value === '' || value === 'unknown') return { ok: false, reason: 'no_ip' };
  if (!ipInAnyCidr(value, YOOKASSA_NETWORKS)) return { ok: false, reason: 'foreign_ip' };
  return { ok: true, ip: value };
}
