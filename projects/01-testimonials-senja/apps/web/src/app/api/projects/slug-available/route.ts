// GET /api/projects/slug-available?slug=... — AC FR-001 «проверка занятости до сабмита».
//
// Эндпоинт анонимный и по своей природе перечисляющий: он отвечает на вопрос «существует ли
// проект с таким слагом». Скрывать этот факт бессмысленно — /w/<slug> и так публичная
// страница, занятость слага видна и без этого роута. Поэтому здесь нет защиты от
// перебора сверх общего rate limit (FR-NFR-SEC-003) — но и никаких иных данных проекта
// роут не отдаёт: только булев available.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { isValidSlug, normalizeSlugDeterministic } from '@/lib/slug';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get('slug');
  // Нормализация та же, что применит регистрация к явному слагу, — иначе форма показала бы
  // «свободен» для строки, которую сабмит потом отвергнет как невалидную.
  const slug = normalizeSlugDeterministic(raw);

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { available: false, slug, reason: 'формат: ^[a-z0-9-]{3,40}$' },
      { status: 200 },
    );
  }

  const taken = await withService(async (client) => {
    const { rowCount } = await client.query('select 1 from projects where slug = $1', [slug]);
    return (rowCount ?? 0) > 0;
  });

  return NextResponse.json({ available: !taken, slug }, { status: 200 });
}
