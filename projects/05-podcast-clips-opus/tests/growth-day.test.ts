import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { ScreenService } from '../apps/web/src/server/screen';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'dist', '.next', 'artifacts'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:[cm]?[jt]sx?|sql)$/.test(file) ? [file] : [];
  });
}

it('каждая вставка growth_event явно задаёт day', () => {
  let inserts = 0;
  for (const file of ['apps', 'packages', 'scripts', 'tests'].flatMap(sourceFiles)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bINSERT\s+INTO\s+(?:"?\w+"?\.)?"?growth_event"?\b/gi)) {
      inserts++;
      const columns = source.slice(match.index + match[0].length).match(/^\s*\(([^)]*)\)/)?.[1];
      expect(columns, `${file}: вставка без явных колонок`).toBeDefined();
      expect(columns?.split(',').map(column => column.trim().replaceAll('"', '').toLowerCase()),
        `${file}: вставка growth_event без day`).toContain('day');
    }
  }
  expect(inserts, 'Не найдено ни одной вставки growth_event').toBeGreaterThan(0);
});

it.each([
  ['2026-09-22T20:59:59.999Z', '2026-09-22'],
  ['2026-09-22T21:00:00.000Z', '2026-09-23'],
])('download использует московские сутки в %s', async (instant, day) => {
  const query = vi.fn().mockResolvedValue({ rowCount: 1 });
  const screen = new ScreenService({ query } as unknown as Pool, () => new Date(instant));
  expect(await screen.markDownloaded('owner', 'clip')).toEqual({ recorded: true });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT 'download',$1,c.id,$3::date"), ['owner', 'clip', day]);
});
