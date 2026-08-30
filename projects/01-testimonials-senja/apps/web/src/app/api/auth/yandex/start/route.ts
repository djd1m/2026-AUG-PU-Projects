// GET /api/auth/yandex/start — FR-016, шаг 1.
//
// Выдаёт cookie с состоянием попытки и уводит на страницу согласия Яндекса.
// Транзакции здесь нет вовсе: в БД на этом шаге писать нечего.

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import {
  authorizeUrl,
  generateVerifier,
  packState,
  SSO_STATE_COOKIE,
  SsoNotConfiguredError,
  STATE_TTL_MS,
  stateCookieOptions,
} from '@/lib/sso';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(32).toString('base64url');
  const verifier = generateVerifier();

  let target: string;
  try {
    // authorizeUrl требует YANDEX_CLIENT_ID и бросит, если его нет. Отказ ЗДЕСЬ, до
    // редиректа: иначе человек ушёл бы на Яндекс и получил невнятную ошибку провайдера
    // вместо нашей внятной (silent-fallbacks.md — тихий фолбэк переносит обнаружение
    // на того, кто не дождался).
    target = authorizeUrl(state, verifier);
  } catch (error) {
    if (error instanceof SsoNotConfiguredError) {
      return NextResponse.json(
        { error: 'вход через Яндекс не настроен на этом стенде' },
        { status: 503 },
      );
    }
    throw error;
  }

  const response = NextResponse.redirect(target, { status: 302 });
  response.cookies.set(
    SSO_STATE_COOKIE,
    packState({ state, verifier, expiresAt: Date.now() + STATE_TTL_MS }),
    stateCookieOptions(),
  );
  return response;
}
