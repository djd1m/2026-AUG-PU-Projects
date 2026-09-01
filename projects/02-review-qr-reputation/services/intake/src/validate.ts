// Валидация тела. Выполняется ПОСЛЕ лимита — иначе лимит не защищает: перебор мусорными
// телами до счётчика не доходил бы и был бы бесплатным.

export interface Payload { slug?: unknown; body?: unknown; rating?: unknown; contact?: unknown; }
export interface Clean { slug: string; body: string; rating: number | null; contact: string | null; }

export const BODY_MIN = 2;
export const BODY_MAX = 2000;
export const CONTACT_MAX = 200;

export function validate(p: Payload): { ok: true; value: Clean } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
  if (!slug) errors.push('slug: обязателен');

  // ТЕКСТ ОБЯЗАТЕЛЕН, оценка опциональна — и это не симметрия ради симметрии.
  // Приватная дверь существует ради СОДЕРЖАНИЯ: «две звезды без слов» дают владельцу
  // сигнал, на который нечем ответить, — у ответа не будет предмета.
  const bodyRaw = typeof p.body === 'string' ? p.body : '';
  const bodyLen = bodyRaw.trim().length;
  if (bodyLen === 0) errors.push('body: текст обязателен');
  // Нижняя граница 2, а не 10: «Спасибо!» — восемь знаков и правдоподобное сообщение.
  // Мусор отсекается ЧАСТОТОЙ, а не длиной: длина — плохой фильтр спама и хороший
  // фильтр живой речи, притом в неверную сторону.
  else if (bodyLen < BODY_MIN || bodyLen > BODY_MAX) errors.push(`body: ${BODY_MIN}-${BODY_MAX} символов`);

  // Неопознанное значение — ОТКАЗ, а не подстановка умолчания.
  let rating: number | null = null;
  if (p.rating !== undefined && p.rating !== null && p.rating !== '') {
    if (typeof p.rating !== 'number' || !Number.isInteger(p.rating) || p.rating < 1 || p.rating > 5) {
      errors.push('rating: целое 1-5 либо отсутствует');
    } else rating = p.rating;
  }

  let contact: string | null = null;
  if (p.contact !== undefined && p.contact !== null && p.contact !== '') {
    if (typeof p.contact !== 'string' || p.contact.length > CONTACT_MAX) errors.push(`contact: до ${CONTACT_MAX}`);
    else contact = p.contact;
  }

  if (errors.length) return { ok: false, errors };
  // ВВОД НЕ САНИРУЕТСЯ: текст сохраняется побайтово. Экранирование — при рендере
  // владельцу. Санитайзер на приёме уничтожает улику необратимо.
  return { ok: true, value: { slug, body: bodyRaw, rating, contact } };
}
