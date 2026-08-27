// FR-002 — приём текстового отзыва. Источник: Pseudocode §1, Specification FR-002.
//
// ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА (FR-NFR-SEC-002, Specification «Правило по XSS»):
// приём НИЧЕГО не санирует. Текст и имя сохраняются побайтово как присланы — включая
// "<script>alert(1)</script>". Экранирование выполняется при РЕНДЕРЕ (FR-005 стена,
// FR-006 виджет). Любая «очистка» здесь ломает побайтовое совпадение, которого требует
// FR-NFR-SEC-002, и создаёт ложное чувство защиты в местах вывода.

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';
import { sniffContainer, validateVideoConstraints } from './video';
import { validatePhoto } from './photo';

export const RATE_LIMIT_SCOPE = 'form_submission';
export const RATE_LIMIT_THRESHOLD = 5; // FR-002 AC: «не более 5 отправок с одного IP в час на проект»
export const RATE_LIMIT_WINDOW = { seconds: 3600 };

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const TEXT_MIN = 10;
export const TEXT_MAX = 2000;

export interface SubmitInput {
  type?: unknown;
  name?: unknown;
  role?: unknown;
  text?: unknown;
  /**
   * Необязательное фото автора (AC FR-002). Приходит уже прочитанным в память —
   * лимит 5 МБ проверяется роутом ДО чтения, чтобы не тянуть в буфер что угодно.
   */
  photo?: { bytes: Uint8Array; mime: string };
}

export type SubmitResult =
  | { ok: true; status: 201; publicId: string }
  | { ok: false; status: 400; body: { errors: string[] } }
  | { ok: false; status: 404; body: { error: string } }
  | { ok: false; status: 429; body: { error: string } }
  | { ok: false; status: 503; body: { error: string } };

/**
 * Ключ лимита — хеш от ip+project_id (Pseudocode §1 `rl_key = hash(ip + project.id)`).
 * Хеш, а не пара в открытую: rate_limit_events живёт дольше запроса, и сырые IP в нём —
 * персональные данные без нужды. Разделитель '|' обязателен, иначе ip="1.2" + id="3.4"
 * и ip="1.2.3" + id=".4" дали бы один ключ.
 */
export function rateLimitKey(ip: string, projectId: string): string {
  return createHash('sha256').update(`${ip}|${projectId}`).digest('hex');
}

/** Валидация границ. Чистая функция — вызывается ДО списания квоты (W-5). */
export function validateTextSubmission(input: SubmitInput): string[] {
  const errors: string[] = [];

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.push(`name: ${NAME_MIN}-${NAME_MAX} символов`);
  }

  if (input.type !== 'text') {
    // Видео-путь — FR-003; здесь его нет, и притворяться, что есть, нельзя.
    errors.push('type: ожидается text');
    return errors;
  }

  const text = typeof input.text === 'string' ? input.text : '';
  // Длина считается по ИСХОДНОЙ строке, без trim: пробелы — часть того, что прислал автор,
  // а «побайтово как отправлено» касается и границ тоже.
  if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
    errors.push(`text: ${TEXT_MIN}-${TEXT_MAX} символов`);
  }

  if (input.role !== undefined && input.role !== null && typeof input.role !== 'string') {
    errors.push('role: строка или отсутствует');
  }

  return errors;
}

/**
 * Pseudocode §1 submitTestimonial (текстовая ветвь). Выполняется под app_service:
 * путь анонимный, сессии владельца нет. Изоляция арендатора — на явном project_id,
 * полученном резолвом слага здесь же; наружу project_id никогда не принимается.
 */
export async function submitTextTestimonial(
  client: PoolClient,
  slug: string,
  ip: string,
  input: SubmitInput,
  uploadPhoto?: (projectId: string, bytes: Uint8Array, mime: string) => Promise<string>,
): Promise<SubmitResult> {
  const projectRes = await client.query<{ id: string }>(
    'select id from projects where slug = $1 and deactivated = false',
    [slug],
  );
  const project = projectRes.rows[0];
  // 404 без пояснений: ответ не должен различать «нет такого слага» и «проект выключен».
  if (!project) return { ok: false, status: 404, body: { error: 'не найдено' } };

  const key = rateLimitKey(ip, project.id);

  // Проверка ДО валидации — иначе перебор невалидными телами обходил бы лимит бесплатно.
  if (await rateLimit.exceeded(RATE_LIMIT_SCOPE, key, RATE_LIMIT_WINDOW, RATE_LIMIT_THRESHOLD, client)) {
    // Без счётчика и времени сброса — anti-enumeration (Pseudocode §1 «без деталей о лимите»).
    return { ok: false, status: 429, body: { error: 'слишком много отправок, попробуйте позже' } };
  }

  const errors = validateTextSubmission(input);

  // Фото проверяется ДО списания квоты, как и всё остальное (W-5). Чистая функция,
  // без побочных эффектов — в хранилище пока ничего не уходит.
  if (input.photo) {
    const verdict = validatePhoto(input.photo.bytes, input.photo.mime);
    if (!verdict.ok) errors.push(verdict.error);
  }

  if (errors.length > 0) return { ok: false, status: 400, body: { errors } };

  // W-5: квота списывается ТОЛЬКО после успешной валидации — это исключает гонку и двойной
  // откат на параллельных невалидных запросах.
  const rlEventId = await rateLimit.record(RATE_LIMIT_SCOPE, key, client);

  const role = typeof input.role === 'string' && input.role.trim() !== '' ? input.role : null;

  // Фото кладётся в хранилище ПОСЛЕ списания квоты — как и видео, и по той же причине:
  // сбой хранилища не вина автора, но и бесплатных попыток он давать не должен.
  let photoUrl: string | null = null;
  if (input.photo && uploadPhoto) {
    try {
      const key = await uploadPhoto(project.id, input.photo.bytes, input.photo.mime);
      // В колонке лежит ПУТЬ НАШЕГО РОУТА, а не адрес хранилища. Прямая ссылка
      // означала бы публичный бакет либо presigned-ссылку, которая истекает —
      // и витрина через час показывала бы битые картинки.
      photoUrl = `/api/photo/${key}`;
    } catch (err) {
      await rateLimit.revoke(rlEventId, client);
      console.error('photo_storage_failed', { projectId: project.id, err });
      return { ok: false, status: 503, body: { error: 'сервис временно недоступен, попробуйте ещё раз' } } as SubmitResult;
    }
  }

  const inserted = await client.query<{ id: string }>(
    `insert into testimonials (project_id, author_name, author_role, text, photo_url, status)
     values ($1, $2, $3, $4, $5, 'pending') returning id`,
    // Ни trim, ни escape, ни strip тегов: см. правило в шапке файла.
    [project.id, input.name as string, role, input.text as string, photoUrl],
  );
  const testimonialId = inserted.rows[0]!.id;

  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action)
     values ($1, 'testimonial', $2, 'public', 'testimonial_created')`,
    [project.id, testimonialId],
  );

  // public_id трактуется как id (см. комментарий в 003_core.sql) — uuid непоследователен.
  return { ok: true, status: 201, publicId: testimonialId };
}

// ───────────────────────────── FR-003: видео-отзыв ─────────────────────────────

export interface VideoSubmitInput {
  name?: unknown;
  role?: unknown;
  text_caption?: unknown;
  video: { bytes: Uint8Array; mime: string; duration_sec: number };
}

export type VideoSubmitResult =
  | SubmitResult
  | { ok: false; status: 503; body: { error: string } };

/**
 * Pseudocode §1 + §1.1, видео-ветвь. Порядок шагов тот же, что у текста, и по той же
 * причине; отличие одно — единственный легитимный откат квоты (W-5): сбой ХРАНИЛИЩА
 * происходит уже после списания, и вины автора в нём нет.
 */
export async function submitVideoTestimonial(
  client: PoolClient,
  slug: string,
  ip: string,
  input: VideoSubmitInput,
  upload: (projectId: string, bytes: Uint8Array, mime: string) => Promise<string>,
): Promise<VideoSubmitResult> {
  const projectRes = await client.query<{ id: string }>(
    'select id from projects where slug = $1 and deactivated = false',
    [slug],
  );
  const project = projectRes.rows[0];
  if (!project) return { ok: false, status: 404, body: { error: 'не найдено' } };

  const key = rateLimitKey(ip, project.id);
  if (await rateLimit.exceeded(RATE_LIMIT_SCOPE, key, RATE_LIMIT_WINDOW, RATE_LIMIT_THRESHOLD, client)) {
    return { ok: false, status: 429, body: { error: 'слишком много отправок, попробуйте позже' } };
  }

  const errors: string[] = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.push(`name: ${NAME_MIN}-${NAME_MAX} символов`);
  }
  errors.push(
    ...validateVideoConstraints({
      duration_sec: input.video.duration_sec,
      size_bytes: input.video.bytes.byteLength,
      mime: input.video.mime,
    }),
  );
  // Заявленный тип обязан совпадать с содержимым — иначе в хранилище уедет что угодно
  // под видом видео, и воркер получит его на распаковку.
  const sniffed = sniffContainer(input.video.bytes);
  if (sniffed === null || sniffed !== input.video.mime) {
    errors.push('video: содержимое файла не соответствует заявленному формату');
  }
  if (errors.length > 0) return { ok: false, status: 400, body: { errors } };

  const rlEventId = await rateLimit.record(RATE_LIMIT_SCOPE, key, client);

  let objectKey: string;
  try {
    objectKey = await upload(project.id, input.video.bytes, input.video.mime);
  } catch (err) {
    // ЕДИНСТВЕННЫЙ легитимный откат квоты (W-5): инфраструктурный сбой после списания.
    await rateLimit.revoke(rlEventId, client);
    console.error('testimonial_storage_failed', { projectId: project.id, err });
    return { ok: false, status: 503, body: { error: 'сервис временно недоступен, попробуйте ещё раз' } };
  }

  const role = typeof input.role === 'string' && input.role.trim() !== '' ? input.role : null;
  // Подпись автора — это НЕ транскрипт: FR-NFR-SEC-002 требует, чтобы расшифровка речи
  // жила отдельным полем и никогда не попадала в text.
  const caption = typeof input.text_caption === 'string' ? input.text_caption : '';

  const inserted = await client.query<{ id: string }>(
    `insert into testimonials
       (project_id, author_name, author_role, text, video_object_key,
        transcript, transcript_status, transcript_source, status)
     values ($1, $2, $3, $4, $5, null, 'pending', 'machine', 'pending')
     returning id`,
    [project.id, input.name as string, role, caption, objectKey],
  );
  const testimonialId = inserted.rows[0]!.id;

  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action)
     values ($1, 'testimonial', $2, 'public', 'testimonial_created')`,
    [project.id, testimonialId],
  );

  return { ok: true, status: 201, publicId: testimonialId };
}
