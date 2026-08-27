// GET /api/photo/<objectKey> — отдача фото, приложенного к отзыву (FR-002).
//
// Фото отдаётся ЧЕРЕЗ НАС, а не прямой ссылкой на хранилище. Это не лишний слой:
// прямая ссылка означала бы либо публичный бакет (в который тогда может писать не
// только наш код), либо presigned-ссылку — а она истекает, и витрина через час
// показывала бы битые картинки.
//
// Заголовки ниже — не гигиена, а защита. Файл прислал посторонний человек, и браузер
// решает, что с ним делать, ровно по тому, что мы скажем.

import { NextResponse } from 'next/server';
import { readPhoto, StorageError } from '@/lib/storage';
import { sniffImage } from '@/lib/photo';

export const dynamic = 'force-dynamic';

// Ключ выдаём мы сами: projectId/uuid.ext. Ничего другого принимать нельзя —
// иначе через ../ можно попросить чужой объект.
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<NextResponse> {
  const { key } = await params;
  const objectKey = (key ?? []).join('/');

  if (!KEY.test(objectKey)) {
    return NextResponse.json({ error: 'не найдено' }, { status: 404 });
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readPhoto(objectKey);
  } catch (err) {
    if (err instanceof StorageError) {
      console.error('photo_read_failed', { objectKey, err });
      return NextResponse.json({ error: 'хранилище недоступно' }, { status: 503 });
    }
    throw err;
  }
  if (!bytes) return NextResponse.json({ error: 'не найдено' }, { status: 404 });

  // Тип определяется ЗАНОВО по содержимому, а не берётся из хранилища и не из ключа.
  // Если в бакет когда-нибудь попадёт не изображение — мимо этого кода, руками,
  // через другой сервис — оно не будет отдано как картинка.
  const mime = sniffImage(bytes);
  if (mime === null) {
    console.error('photo_not_an_image', { objectKey });
    return NextResponse.json({ error: 'не найдено' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': mime,
      // Браузер НЕ должен угадывать тип сам: без nosniff он может решить, что
      // файл — HTML, и выполнить его в контексте нашего домена.
      'X-Content-Type-Options': 'nosniff',
      // Даже если тип угадан неверно — не рендерить как документ.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
      // Имя объекта содержит uuid, поэтому содержимое по ключу неизменно.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
