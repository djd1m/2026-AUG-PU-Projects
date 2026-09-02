// POST /api/testimonials/platform — отзыв, перенесённый ВЛАДЕЛЬЦЕМ с внешней площадки.
//
// Почему путь владельческий, а не анонимный, как форма сбора. Отзыв с Яндекс.Карт приносит тот,
// у кого он есть, — владелец. Анонимный приём здесь означал бы, что незнакомец грузит нам
// произвольные картинки и произвольные ссылки: класс вопросов про лимиты, расход и подделку,
// который здесь просто не возникает.
//
// Порядок шагов несущий и обратный привычному «сначала сохраним, потом проверим»:
//   1. аутентификация — ДО чтения тела (тело здесь до 5 МБ; читать столько от кого угодно,
//      чтобы затем ответить 401, значит отдать неаутентифицированному право занять память);
//   2. разбор и ВСЕ проверки — ДО загрузки снимка в хранилище;
//   3. загрузка снимка;
//   4. запись в БД.
// Обратный порядок оставлял бы за каждым отвергнутым отзывом файл, который никто не удалит.

import { NextResponse } from 'next/server';

import { currentAccountId } from '@/lib/current-session';
import { MAX_PHOTO_BYTES, validatePhoto } from '@/lib/photo';
import { hasProof, isPlatformKey, validateSourceUrl, type PlatformKey } from '@/lib/platform-proof';
import { uploadPhoto } from '@/lib/storage';
import { withAccount } from '@proofwall/db';

export const dynamic = 'force-dynamic';

const NAME_MAX = 80;
const ROLE_MAX = 120;
const TEXT_MAX = 2000;

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(request: Request): Promise<NextResponse> {
  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.json({ error: 'требуется вход' }, { status: 401 });

  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('multipart/form-data')) {
    return NextResponse.json({ errors: ['тело запроса: ожидается multipart/form-data'] }, { status: 400 });
  }

  const form = await request.formData();
  const slug = str(form, 'slug');
  const name = str(form, 'name');
  const role = str(form, 'role');
  const text = str(form, 'text');
  const platformRaw = str(form, 'platform');
  const sourceUrlRaw = str(form, 'source_url');
  const file = form.get('screenshot');

  const errors: string[] = [];
  if (slug === '') errors.push('slug: обязателен');
  if (name.length < 2 || name.length > NAME_MAX) errors.push(`name: 2-${NAME_MAX} символов`);
  if (role.length > ROLE_MAX) errors.push(`role: не длиннее ${ROLE_MAX}`);
  if (text.length < 2 || text.length > TEXT_MAX) errors.push(`text: 2-${TEXT_MAX} символов`);
  if (!isPlatformKey(platformRaw)) errors.push('platform: неизвестная площадка');

  const platform = platformRaw as PlatformKey;
  let sourceUrl: string | null = null;
  if (sourceUrlRaw !== '' && isPlatformKey(platformRaw)) {
    const v = validateSourceUrl(platform, sourceUrlRaw);
    if (v.ok) sourceUrl = v.url;
    else errors.push(v.error);
  }

  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > MAX_PHOTO_BYTES) errors.push('screenshot: больше 5 MB');

  // Хотя бы одно доказательство. То же требование стоит ограничением в СУБД — код и схема
  // отказывают независимо друг от друга, и снятие одного не открывает путь.
  if (!hasProof(sourceUrl, hasFile)) {
    errors.push('нужна ссылка на отзыв или его снимок экрана — иначе это просто текст');
  }

  if (errors.length > 0) return NextResponse.json({ errors }, { status: 422 });

  // ── всё проверено, только теперь трогаем хранилище
  let screenshotKey: string | null = null;
  let uploadBytes: Uint8Array | null = null;
  let uploadMime = '';
  if (hasFile) {
    uploadBytes = new Uint8Array(await (file as File).arrayBuffer());
    const verdict = validatePhoto(uploadBytes, (file as File).type);
    if (!verdict.ok) return NextResponse.json({ errors: [`screenshot: ${verdict.error}`] }, { status: 422 });
    uploadMime = verdict.mime;
  }

  const created = await withAccount(accountId, async (client) => {
    // Проект берётся по slug И по владельцу из сессии: чужой slug не найдётся.
    const { rows } = await client.query<{ id: string }>(
      'select id from projects where slug = $1 and account_id = $2 and deactivated = false',
      [slug, accountId],
    );
    const project = rows[0];
    if (!project) return null;

    if (uploadBytes !== null) {
      screenshotKey = await uploadPhoto(project.id, uploadBytes, uploadMime);
    }

    const ins = await client.query<{ id: string }>(
      `insert into testimonials
         (project_id, author_name, author_role, text, status, source,
          source_platform, source_url, screenshot_object_key)
       values ($1, $2, $3, $4, 'pending', 'platform', $5, $6, $7)
       returning id`,
      [project.id, name, role === '' ? null : role, text, platform, sourceUrl, screenshotKey],
    );
    return ins.rows[0]?.id ?? null;
  });

  if (created === null) return NextResponse.json({ error: 'проект не найден' }, { status: 404 });
  return NextResponse.json({ id: created }, { status: 201 });
}
