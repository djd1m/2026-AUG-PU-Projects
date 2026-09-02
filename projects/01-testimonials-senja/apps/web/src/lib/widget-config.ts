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

import { platformFrom } from './platform-proof';

export const TESTIMONIAL_LIMIT = 50; // Pseudocode §5.1

export interface WidgetTestimonial {
  id: string;
  author_name: string;
  author_role: string | null;
  text: string;
  transcript: string | null;
  transcript_source: 'machine' | null;
  photo_url: string | null;
  /** Подпись площадки-первоисточника, уже готовая к показу; null — отзыв не перенесённый. */
  source_label: string | null;
  /** Ссылка на публичный отзыв у площадки; может отсутствовать при наличии снимка. */
  source_url: string | null;
  /** Путь нашего роута отдачи снимка, не адрес хранилища. */
  screenshot_url: string | null;
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

  const items = await client.query<WidgetTestimonial & {
    source: string; source_platform: string | null; screenshot_object_key: string | null;
  }>(
    // Анонимный путь под app_service (BYPASSRLS): фильтр по project_id обязателен в коде.
    `select id, author_name, author_role, text, transcript, photo_url,
            source, source_platform, source_url, screenshot_object_key,
            case when transcript is not null then transcript_source else null end as transcript_source
       from testimonials
      where project_id = $1 and status = 'approved'
      order by created_at desc
      limit ${TESTIMONIAL_LIMIT}`,
    [project.id],
  );

  // Подпись площадки собирается НА СЕРВЕРЕ и уезжает готовой строкой. Виджету не передаётся
  // ни ключ площадки, ни таблица соответствий: клиент не должен решать, как назвать источник,
  // — по той же причине, по которой он не решает, показывать ли бренд-строку.
  const testimonials: WidgetTestimonial[] = items.rows.map((r) => ({
    id: r.id,
    author_name: r.author_name,
    author_role: r.author_role,
    text: r.text,
    transcript: r.transcript,
    transcript_source: r.transcript_source,
    photo_url: r.photo_url,
    source_label: r.source === 'platform'
      ? (platformFrom(r.source_platform) ?? 'внешней площадки') : null,
    source_url: r.source === 'platform' ? r.source_url : null,
    screenshot_url: r.screenshot_object_key ? `/api/photo/${r.screenshot_object_key}` : null,
  }));

  return {
    testimonials,
    badge_required: badgeRequired,
    project_slug: project.slug,
    // Только при badge_required: на paid ссылка не нужна и не должна утекать в ответ.
    ...(badgeRequired ? { badge_url: buildBadgeUrl(baseUrl(), project.slug, domain) } : {}),
  };
}
