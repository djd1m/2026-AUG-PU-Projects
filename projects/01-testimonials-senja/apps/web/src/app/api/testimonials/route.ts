// POST /api/testimonials — приём отзыва с публичной формы /f/<slug> (FR-002).
// Регистрация не требуется (AC FR-002 «Без регистрации»).
//
// Принимает две формы тела: JSON (отзыв без фото) и multipart/form-data (с фото).
// Разделять их на два роута было бы хуже: правила приёма — лимит, валидация границ,
// порядок списания квоты — одни и те же, а два обработчика однажды разъедутся.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { extractClientIP } from '@/lib/client-ip';
import { submitTextTestimonial, type SubmitInput } from '@/lib/testimonial';
import { uploadPhoto } from '@/lib/storage';
import { MAX_PHOTO_BYTES } from '@/lib/photo';

export const dynamic = 'force-dynamic';

type Parsed = { slug: string; input: SubmitInput } | { error: string };

async function parseBody(request: Request): Promise<Parsed> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: 'тело запроса: не удалось разобрать multipart/form-data' };
    }
    const slug = form.get('slug');
    if (typeof slug !== 'string' || slug === '') return { error: 'slug: обязателен' };

    const input: SubmitInput = {
      type: form.get('type') ?? 'text',
      name: form.get('name'),
      role: form.get('role'),
      text: form.get('text'),
    };

    const file = form.get('photo');
    if (file instanceof File && file.size > 0) {
      // Отказ по размеру — ДО чтения в память. Читать в буфер что угодно только
      // затем, чтобы узнать длину, значит принять эту длину на веру.
      if (file.size > MAX_PHOTO_BYTES) return { error: 'photo: больше 5 MB' };
      input.photo = { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type };
    }
    return { slug, input };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: 'тело запроса: ожидается JSON или multipart/form-data' };
  }
  if (typeof body !== 'object' || body === null) return { error: 'тело запроса: ожидается объект' };

  const { slug, ...input } = body as { slug?: unknown } & SubmitInput;
  if (typeof slug !== 'string' || slug === '') return { error: 'slug: обязателен' };
  // Фото через JSON не принимается: base64 в теле раздувает запрос на треть и
  // обходит ранний отказ по размеру, который даёт multipart.
  delete (input as { photo?: unknown }).photo;
  return { slug, input };
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await parseBody(request);
  if ('error' in parsed) return NextResponse.json({ errors: [parsed.error] }, { status: 400 });

  const ip = extractClientIP(request);

  // Одна транзакция на весь приём: проверка лимита, списание квоты, вставка отзыва и
  // запись аудита должны быть согласованы между собой (client передаётся и в rate-limit).
  const result = await withService((client) =>
    submitTextTestimonial(client, parsed.slug, ip, parsed.input, uploadPhoto),
  );

  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ public_id: result.publicId }, { status: 201 });
}
