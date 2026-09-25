// Гигиена compose и образов — слой 1 (compose-hygiene.md, docker-ports.md): то, что проверяется
// чтением файлов. Полный разбор публикаций делает ../../.claude/hooks/check-ports.cjs по `docker compose config`.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const files = ['docker-compose.yml', 'compose.test.yml'];
function services(text: string): Map<string, string> {
  const body = text.split(/^services:\n/m)[1]!.split(/^\S/m)[0]!;
  return new Map([...body.matchAll(/^ {2}([a-z-]+):\n((?: {4,}.*\n|\n)*)/gm)].map((m) => [m[1]!, m[2]!]));
}
describe.each(files)('%s', (file) => {
  const text = readFileSync(file, 'utf8');
  const map = services(text);
  it('объявляет name: (иначе стеки вытесняют друг друга)', () => { expect(text).toMatch(/^name: \S+/m); });
  it('образы только с явным тегом', () => {
    for (const [, body] of map) for (const m of body.matchAll(/^\s+image:\s+(\S+)/gm)) expect(m[1]).toMatch(/:[^/]+$/);
  });
  it('хранилища без ports: и без network_mode: host', () => {
    for (const name of ['db', 'redis']) {
      expect(map.get(name), name).toBeDefined();
      expect(map.get(name)).not.toMatch(/^\s+ports:/m);
      expect(map.get(name)).not.toMatch(/network_mode:\s*host/);
    }
  });
  it('каждый хостовый порт — ${VAR:-default} и только на петлю', () => {
    for (const m of text.matchAll(/^\s+- "([^"]*:\d+)"$/gm)) expect(m[1]).toMatch(/^127\.0\.0\.1:\$\{[A-Z0-9_]+:-\d+\}:\d+$/);
  });
  it('у каждого сервиса явная политика перезапуска', () => {
    for (const [name, body] of map) expect(body, name).toMatch(/^\s+restart: /m);
  });
});
describe('docker-compose.yml: ровно 6 сервисов канона §6, дверь — единственная публикация', () => {
  const map = services(readFileSync('docker-compose.yml', 'utf8'));
  it('proxy, web, worker-index, migrate, db, redis', () => {
    expect([...map.keys()].sort()).toEqual(['db', 'migrate', 'proxy', 'redis', 'web', 'worker-index']);
  });
  it('ports: только у proxy', () => {
    for (const [name, body] of map) if (name !== 'proxy') expect(body, name).not.toMatch(/^\s+ports:/m);
  });
  it('db — pgvector/pgvector:0.8.6-pg16 (ADR-001)', () => { expect(map.get('db')).toContain('image: pgvector/pgvector:0.8.6-pg16'); });
});
describe('Dockerfile: монорепо npm workspaces (compose-hygiene правило 5)', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  it('deps копирует манифест КАЖДОГО workspace (иначе npm ci: Exit handler never called)', () => {
    for (const root of ['apps', 'packages']) for (const name of readdirSync(root)) {
      if (existsSync(`${root}/${name}/package.json`)) expect(dockerfile).toContain(`COPY ${root}/${name}/package.json ./${root}/${name}/`);
    }
  });
  it('CMD ссылается на существующие файлы, не на `npm start` в корне', () => {
    expect(dockerfile).toContain('node apps/web/.next/preflight/preflight.js');
    expect(dockerfile).toContain('CMD ["node", "apps/worker/dist/index.js"]');
    expect(dockerfile).toContain('CMD ["node", "packages/db/dist/migrate.js"]');
  });
  it('.dockerignore пускает в контекст то, что читают стражи', () => {
    const ignore = readFileSync('.dockerignore', 'utf8').trim().split('\n');
    expect(ignore).toContain('!.env.example');
    expect(ignore.at(-1)).toBe('!docs/canon.md');
  });
});
