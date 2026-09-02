// POST /api/testimonials/video — приём видео-отзыва (FR-003), multipart/form-data.
//
// Отдельный роут, а не ветка в /api/testimonials: тело здесь бинарное и на порядки крупнее,
// смешивать его с JSON-приёмом текста значит заводить один обработчик с двумя парсерами.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { extractClientIP } from '@/lib/client-ip';
import { submitVideoTestimonial } from '@/lib/testimonial';
import { uploadVideo } from '@/lib/storage';
import { MAX_SIZE_BYTES, videoIntakeEnabled } from '@/lib/video';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ errors: ['тело запроса: ожидается multipart/form-data'] }, { status: 400 });
  }

  const slug = form.get('slug');
  if (typeof slug !== 'string' || slug === '') {
    return NextResponse.json({ errors: ['slug: обязателен'] }, { status: 400 });
  }

  // Платный путь закрыт, пока владелец не включил его осознанно. Отказ ЯВНЫЙ и до
  // чтения файла в память: тихая деградация («примем, но не расшифруем») означала бы
  // хранение чужих видео без пользы и без предупреждения.
  if (!videoIntakeEnabled()) {
    return NextResponse.json(
      { errors: ['видео-отзывы сейчас отключены владельцем — оставьте отзыв текстом'] },
      { status: 403 });
  }

  const file = form.get('video');
  if (!(file instanceof File)) {
    return NextResponse.json({ errors: ['video: обязателен для type=video'] }, { status: 400 });
  }
  // Ранний отказ по размеру — ДО чтения файла в память: 100 MB на запрос это потолок,
  // выше которого читать в буфер уже небезопасно.
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ errors: ['video: больше 100 MB'] }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ip = extractClientIP(request);

  const result = await withService((client) =>
    submitVideoTestimonial(
      client,
      slug,
      ip,
      {
        name: form.get('name'),
        role: form.get('role'),
        text_caption: form.get('text_caption'),
        video: {
          bytes,
          mime: file.type,
          duration_sec: Number(form.get('duration_sec')),
        },
      },
      uploadVideo,
    ),
  );

  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ public_id: result.publicId }, { status: 201 });
}
