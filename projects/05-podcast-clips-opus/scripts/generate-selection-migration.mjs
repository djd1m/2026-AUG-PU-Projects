import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// Generated once before applying 007. Never regenerate an applied migration.
export function selectionMigration() {
  const schema = JSON.parse(readFileSync(new URL('../packages/shared/src/fragments-schema.json', import.meta.url), 'utf8'));
  const fields = schema.properties.fragments.items.properties;
  const checks = Object.entries(fields).map(([name, rule]) => {
    if (rule.type === 'string') return `${name} IS NOT NULL AND btrim(${name}) <> ''${rule.pattern ? ` AND ${name} ~ '${rule.pattern}'` : ''}`;
    return `${name} IS NOT NULL AND ${name} >= ${rule.minimum}${rule.maximum === undefined ? '' : ` AND ${name} <= ${rule.maximum}`}`;
  });
  return `-- Generated from shared/fragments-schema.json by scripts/generate-selection-migration.mjs.
-- Preserve exact word timestamps; numeric(10,1) would round them into words.
ALTER TABLE clip ALTER COLUMN start_seconds TYPE numeric, ALTER COLUMN end_seconds TYPE numeric;
ALTER TABLE clip ADD CONSTRAINT clip_selection_contract CHECK (
  end_seconds - start_seconds BETWEEN ${schema.$defs.duration.minimum} AND ${schema.$defs.duration.maximum}
  AND (score IS NULL OR (${checks.join('\n    AND ')}
    AND score = score_hook + score_completeness + score_length))
);
-- Durable one-shot dispatch; unit_count=1 may already be paid by video.retry.
ALTER TABLE job_attempt ADD COLUMN llm_dispatched boolean NOT NULL DEFAULT false;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = new URL('../packages/db/migrations/007_selection.sql', import.meta.url);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== selectionMigration()) process.exitCode = 1;
  } else writeFileSync(path, selectionMigration(), { flag: 'wx' });
}
