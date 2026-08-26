// FR-005 — публичная «Стена любви». Источник: Pseudocode §6, Specification FR-005.

import { withService } from '@proofwall/db';

export interface WallItem {
  id: string;
  author_name: string;
  author_role: string | null;
  text: string;
  transcript: string | null;
  has_video: boolean;
  created_at: string;
}

/**
 * Инвариант FR-004: только approved публичен. Путь анонимный → app_service (BYPASSRLS),
 * поэтому фильтр по project_id ОБЯЗАН быть в коде — RLS здесь не подстрахует
 * (предупреждение packages/db/src/tenant.ts). project_id берётся резолвом слага в этом
 * же запросе и никогда не принимается снаружи.
 */
export async function getApprovedTestimonials(projectId: string): Promise<WallItem[]> {
  return withService(async (client) => {
    const { rows } = await client.query<WallItem>(
      `select id, author_name, author_role, text, transcript,
              (video_object_key is not null) as has_video, created_at
         from testimonials
        where project_id = $1 and status = 'approved'
        order by created_at desc`,
      [projectId],
    );
    return rows;
  });
}

/**
 * JSON-LD для schema.org/Review.
 *
 * ЕДИНСТВЕННОЕ место всего приложения, где авторский текст попадает внутрь <script>.
 * React здесь не защищает: содержимое ставится через dangerouslySetInnerHTML, иначе
 * поисковик получит экранированные сущности вместо JSON. А значит побайтово сохранённый
 * на приёме "</script><script>alert(1)</script>" закрыл бы тег и выполнился.
 *
 * JSON.stringify от этого НЕ спасает: он экранирует кавычки, но '<' и '/' оставляет как есть.
 * Поэтому после сериализации подменяем символы на \u-последовательности — внутри JSON-строки
 * они означают ровно то же самое, но парсер HTML в них тега уже не видит.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    // U+2028/U+2029 — валидны в JSON, но обрывают строку в JS-парсере.
    // Сами эти символы в регэксп-литерале писать НЕЛЬЗЯ: они — разделители строк
    // в JS, и литерал обрывается прямо на них (поймано сборкой).
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildReviewJsonLd(
  slug: string,
  pageUrl: string,
  items: WallItem[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: pageUrl,
    name: `Отзывы — ${slug}`,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Review',
        // Транскрипт в reviewBody НЕ идёт: это расшифровка речи, а не написанный автором
        // отзыв (FR-NFR-SEC-002 держит их разными полями — здесь граница видна наружу).
        reviewBody: item.text,
        datePublished: new Date(item.created_at).toISOString().slice(0, 10),
        author: {
          '@type': 'Person',
          name: item.author_name,
          ...(item.author_role ? { jobTitle: item.author_role } : {}),
        },
      },
    })),
  };
}
