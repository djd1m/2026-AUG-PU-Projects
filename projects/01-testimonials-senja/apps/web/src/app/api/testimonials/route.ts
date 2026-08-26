// POST /api/testimonials — приём отзыва с публичной формы /f/<slug> (FR-002).
// Регистрация не требуется (AC FR-002 «Без регистрации»).

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { extractClientIP } from '@/lib/client-ip';
import { submitTextTestimonial, type SubmitInput } from '@/lib/testimonial';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ['тело запроса: ожидается JSON'] }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ errors: ['тело запроса: ожидается объект'] }, { status: 400 });
  }

  const { slug, ...input } = body as { slug?: unknown } & SubmitInput;
  if (typeof slug !== 'string' || slug === '') {
    return NextResponse.json({ errors: ['slug: обязателен'] }, { status: 400 });
  }

  const ip = extractClientIP(request);

  // Одна транзакция на весь приём: проверка лимита, списание квоты, вставка отзыва и
  // запись аудита должны быть согласованы между собой (client передаётся и в rate-limit).
  const result = await withService((client) => submitTextTestimonial(client, slug, ip, input));

  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ public_id: result.publicId }, { status: 201 });
}
