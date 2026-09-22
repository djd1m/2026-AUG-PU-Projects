import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('RV-004: отдельная миграция требует префикс двух дедуплицируемых событий', () => {
  const sql = readFileSync('packages/db/migrations/002_growth_event_prefix.sql', 'utf8');
  // Только страж наличия ограничения; реальная семантика проверяется integration-набором.
  expect(sql).toMatch(/ALTER TABLE growth_event ADD CONSTRAINT growth_event_dedup_prefix_required\s+CHECK\s*\(type NOT IN \('link_view', 'guest_opened'\) OR ip_prefix IS NOT NULL\)/);
});
