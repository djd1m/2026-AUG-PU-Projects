// FR-GROWTH-001 — widget_installed и invite_shown. Источник: Pseudocode §4, PRD §2.4.1,
// Architecture §3.3.
//
// РЕШЕНИЕ, определяющее всю форму этого файла: считаем САЙТЫ, а не людей. Обе метрики
// имеют одну гранулярность — пару (project_id, domain) — и потому живут за счёт ОДНОЙ
// таблицы widget_installs с unique(project_id, domain). Отдельная таблица или столбец
// под invite_shown не нужны.
//
// Дедупликация — на уровне СУБД, а не приложения. "Проверить, есть ли домен, затем
// вставить" оставляет окно между чтением и записью, в котором два конкурентных первых
// рендера ОБА увидят «домена ещё нет» и оба эмитируют invite_shown. ON CONFLICT DO NOTHING
// RETURNING id атомарен: из N параллельных вставок ровно одна получает непустой RETURNING.

import type { PoolClient } from 'pg';

export interface InstallResult {
  /** true ⇒ домен новый ⇒ эмитированы ОБА события и владельцу показывается share-CTA. */
  isNewDomain: boolean;
  domain: string | null;
}

/**
 * Нормализация домена. Приходит он из Referer/Origin браузера, то есть снаружи, и попадает
 * в unique-ключ — значит "Example.com", "example.com:443" и "example.com" обязаны стать
 * одной строкой, иначе один сайт насчитает три установки.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (value === '') return null;
  // Браузер шлёт ЛИТЕРАЛЬНОЕ "null" в Origin для file:// и песочниц (sandboxed iframe,
  // data:). Это не домен, а отсутствие домена — и в метку источника оно попадать
  // не должно ни в каком виде.
  if (value === 'null' || value === 'undefined') return null;
  try {
    // Referer/Origin приходят как URL; голый хост тоже должен приниматься.
    if (value.includes('://')) value = new URL(value).hostname;
    else value = new URL(`https://${value}`).hostname;
  } catch {
    return null;
  }
  value = value.replace(/^www\./, '');
  return value === '' ? null : value;
}

/** Домены, на которых рендер НЕ считается установкой (Pseudocode §4: превью и дашборд). */
export function isOwnDomain(domain: string): boolean {
  const own = normalizeDomain(process.env.APP_DOMAIN ?? process.env.BASE_URL ?? 'localhost');
  return own !== null && (domain === own || domain === 'localhost' || domain === '127.0.0.1');
}

/**
 * Pseudocode §4 recordInstallAndInviteIfNeeded.
 * Вызывается ТОЛЬКО из /api/widget/config, то есть при рендере виджета на чужом сайте;
 * онбординг и дашборд её не вызывают и физически не могут породить события.
 */
export async function recordInstallAndInviteIfNeeded(
  client: PoolClient,
  projectId: string,
  rawDomain: string | null | undefined,
): Promise<InstallResult> {
  const domain = normalizeDomain(rawDomain);
  if (domain === null || isOwnDomain(domain)) return { isNewDomain: false, domain };

  const inserted = await client.query<{ id: string }>(
    `insert into widget_installs (project_id, domain, first_seen_at, last_seen_at)
     values ($1, $2, now(), now())
     on conflict (project_id, domain) do nothing
     returning id`,
    [projectId, domain],
  );

  if ((inserted.rowCount ?? 0) === 0) {
    // Домен уже известен — или гонку выиграл конкурент, эффект тот же. Ни одного события.
    await client.query(
      'update widget_installs set last_seen_at = now() where project_id = $1 and domain = $2',
      [projectId, domain],
    );
    return { isNewDomain: false, domain };
  }

  // Единственная точка эмиссии ОБОИХ событий. Гарантию «ровно один раз на (project, domain)»
  // даёт unique-индекс, а не проверка в коде.
  await emitEvents(client, projectId, domain, ['widget_installed', 'invite_shown']);
  return { isNewDomain: true, domain };
}

export async function emitEvents(
  client: PoolClient,
  projectId: string,
  domain: string | null,
  types: string[],
): Promise<void> {
  if (types.length === 0) return;
  const values = types.map((_, i) => `($1, $${i + 3}, $2, jsonb_build_object('domain', $2::text))`).join(', ');
  await client.query(
    `insert into analytics_events (project_id, event_type, domain, metadata) values ${values}`,
    [projectId, domain, ...types],
  );
}

/** Владельцу показывается share-CTA при КАЖДОЙ новой установке (PRD §2.4.1). */
export async function pendingShareCtaCount(client: PoolClient, projectId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `select count(*)::text as n from analytics_events
      where project_id = $1 and event_type = 'invite_shown'`,
    [projectId],
  );
  return Number(rows[0]?.n ?? 0);
}
