// FR-006 — серверная конфигурация виджета. Источник: Pseudocode §5.1, ADR-001/ADR-002.
//
// ИНВАРИАНТ, ради которого этот код существует (ADR-002): решение о видимости badge
// принимает СЕРВЕР. В ответ уходит уже вычисленный `badge_required`, а поле `tier`
// не уходит НИКОГДА — иначе клиент получил бы то, из чего решение выводится, и мог бы
// вывести другое. Любой параметр запроса вида hide_badge/tier/badge игнорируется:
// функция их даже не читает.

import type { PoolClient } from 'pg';
import { badgeRequiredFor } from './tariff';
import { buildBadgeUrl } from './badge';
import { baseUrl } from './urls';

export const TESTIMONIAL_LIMIT = 50; // Pseudocode §5.1

export interface WidgetTestimonial {
  id: string;
  author_name: string;
  author_role: string | null;
  text: string;
  transcript: string | null;
  transcript_source: 'machine' | null;
  photo_url: string | null;
}

export interface WidgetConfigResponse {
  testimonials: WidgetTestimonial[];
  badge_required: boolean;
  project_slug: string;
  /**
   * Куда ведёт badge. Строится на сервере (FR-GROWTH-003): виджет живёт на чужом домене
   * и не знает наш публичный адрес. Присутствует только когда badge требуется —
   * на paid-тарифе поле отсутствует, и рисовать нечего.
   */
  badge_url?: string;
}

/**
 * Безопасный дефолт для неизвестного/выключенного проекта: 200 с пустым списком и
 * badge_required = true, а НЕ 404. Виджет стоит на чужом сайте — ошибка не должна
 * выглядеть там сломанным блоком; а badge по умолчанию требуется, потому что
 * «не смогли проверить тариф» обязано означать самый строгий вариант, а не самый мягкий.
 */
export function safeDefault(slug: string, domain?: string | null): WidgetConfigResponse {
  return {
    testimonials: [],
    badge_required: true,
    project_slug: slug,
    badge_url: buildBadgeUrl(baseUrl(), slug, domain),
  };
}

export async function buildWidgetConfig(
  client: PoolClient,
  slug: string,
  domain?: string | null,
): Promise<WidgetConfigResponse> {
  const projectRes = await client.query<{ id: string; slug: string; tier: string }>(
    'select id, slug, tier from projects where slug = $1 and deactivated = false',
    [slug],
  );
  const project = projectRes.rows[0];
  if (!project) return safeDefault(slug, domain);

  // Тариф читается ИЗ БД и нигде больше. Ни query, ни заголовки, ни тело не участвуют.
  // Само правило — в lib/tariff.ts: один источник на всё приложение (FR-007).
  const badgeRequired = badgeRequiredFor(project.tier);

  const items = await client.query<WidgetTestimonial>(
    // Анонимный путь под app_service (BYPASSRLS): фильтр по project_id обязателен в коде.
    `select id, author_name, author_role, text, transcript, photo_url,
            case when transcript is not null then transcript_source else null end as transcript_source
       from testimonials
      where project_id = $1 and status = 'approved'
      order by created_at desc
      limit ${TESTIMONIAL_LIMIT}`,
    [project.id],
  );

  return {
    testimonials: items.rows,
    badge_required: badgeRequired,
    project_slug: project.slug,
    // Только при badge_required: на paid ссылка не нужна и не должна утекать в ответ.
    ...(badgeRequired ? { badge_url: buildBadgeUrl(baseUrl(), project.slug, domain) } : {}),
  };
}
