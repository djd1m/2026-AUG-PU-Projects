import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Страж BACKLOG §5 п. 17: рантайм-образы (web, worker) не несут devDependencies. Статическая половина — по
// Dockerfile, идёт в каждом `npm test`; вторая половина смотрит в собранный образ —
// scripts/check-image-dev-deps.mjs (там же положительный контроль и три кода возврата).
interface Stage { name: string; from: string; lines: string[] }
export function parseStages(dockerfile: string): Stage[] {
  const stages: Stage[] = [];
  // Инструкция с `\` на конце продолжается следующей физической строкой: склеиваем, иначе многострочный COPY
  // (`COPY --from=build \` + `/app/node_modules ./node_modules`) проходит мимо разбора (ревью Codex, круг 1).
  const logical: string[] = [];
  let pending = '';
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim();
    if (!pending && line.startsWith('#')) continue;
    if (line.endsWith('\\')) { pending += line.slice(0, -1) + ' '; continue; }
    logical.push((pending + line).trim());
    pending = '';
  }
  if (pending) logical.push(pending.trim());
  for (const line of logical) {
    if (!line || line.startsWith('#')) continue;
    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) { stages.push({ name: (from[2] ?? '').toLowerCase(), from: from[1]!.toLowerCase(), lines: [] }); continue; }
    stages.at(-1)?.lines.push(line);
  }
  return stages;
}
/** Нарушения для рантайм-стадии: откуда в неё приходят node_modules и не наследует ли она dev-стадию. */
export function devDepsViolations(dockerfile: string, runtime: readonly string[]): string[] {
  const stages = parseStages(dockerfile);
  const byName = new Map(stages.map(stage => [stage.name, stage]));
  // Стадия «без dev»: ПОСЛЕДНЯЯ npm-команда, меняющая дерево (ci/install/prune), — с `--omit=dev`. Иначе
  // `RUN npm prune --omit=dev` и следом `RUN npm ci` вернули бы dev, а страж видел бы первую строку (ревью Codex, круг 1).
  // Стадия, наследующая другую стадию сборки, не «чистая» сама по себе — только если чистая её последняя команда.
  const omitsDev = (name: string): boolean => {
    const npm = (byName.get(name)?.lines ?? []).flatMap(l => /^RUN\s/.test(l)
      ? [...l.matchAll(/\bnpm\s+(ci|install|i|prune)\b[^&;|]*/g)].map(m => m[0]) : []);
    const last = npm.at(-1);
    return last !== undefined && /\b(ci|prune)\b/.test(last) && /--omit=dev\b/.test(last);
  };
  // Откуда в рантайм могут приехать node_modules: копия самого node_modules ИЛИ родительского каталога (`/app`, `/`, `.`).
  const carriesNodeModules = (copy: string) => {
    const args = copy.replace(/^COPY\s+/, '').split(/\s+/).filter(a => !a.startsWith('--'));
    const sources = args.slice(0, -1);
    return sources.some(s => /node_modules/.test(s) || /^(\/|\/app\/?|\.\/?|\/app\/\*)$/.test(s));
  };
  const problems: string[] = [];
  for (const target of runtime) {
    const stage = byName.get(target);
    if (!stage) { problems.push(`${target}: стадии нет в Dockerfile`); continue; }
    if (byName.has(stage.from)) problems.push(`${target}: FROM ${stage.from} наследует node_modules стадии сборки`);
    if (stage.lines.some(l => /^RUN\s.*\bnpm\s+(ci|install|i)\b/.test(l))) problems.push(`${target}: npm ставит пакеты прямо в рантайм-стадии`);
    const copies = stage.lines.filter(l => /^COPY\b/.test(l) && carriesNodeModules(l));
    if (!copies.some(l => /node_modules/.test(l))) problems.push(`${target}: node_modules не копируется вовсе — проверять нечего`);
    for (const copy of copies) {
      const source = /--from=(\S+)/.exec(copy)?.[1]?.toLowerCase();
      if (!source) problems.push(`${target}: node_modules из контекста сборки: ${copy}`);
      else if (!omitsDev(source)) problems.push(`${target}: node_modules из стадии ${source}, где dev-зависимости не удалены`);
    }
    if (stage.lines.some(l => /^COPY\s+\.\s/.test(l))) problems.push(`${target}: COPY . . везёт весь контекст`);
  }
  return problems;
}

const RUNTIME = ['web', 'worker'] as const;

describe('рантайм-образы без devDependencies (BACKLOG §5 п. 17)', () => {
  it('Dockerfile: web и worker берут node_modules только из стадии с --omit=dev', () => {
    expect(devDepsViolations(readFileSync('Dockerfile', 'utf8'), RUNTIME)).toEqual([]);
  });

  it('страж краснеет на прежней форме (node_modules из build) и на подмене стадии без --omit=dev', () => {
    const good = readFileSync('Dockerfile', 'utf8');
    const reverted = good.replaceAll('COPY --from=prod-deps /app/node_modules', 'COPY --from=build /app/node_modules');
    expect(reverted).not.toBe(good);
    expect(devDepsViolations(reverted, RUNTIME)).toEqual([
      'web: node_modules из стадии build, где dev-зависимости не удалены',
      'worker: node_modules из стадии build, где dev-зависимости не удалены',
    ]);
    const noPrune = good.replace('RUN npm prune --omit=dev', 'RUN true');
    expect(noPrune).not.toBe(good);
    expect(devDepsViolations(noPrune, RUNTIME)).toHaveLength(2);
    const inherits = good.replace('FROM node:22.22-alpine AS web', 'FROM build AS web');
    expect(devDepsViolations(inherits, RUNTIME)).toContain('web: FROM build наследует node_modules стадии сборки');
  });

  it('обходы из ревью Codex (круг 1) краснеют: npm ci после prune, копия /app целиком, многострочный COPY', () => {
    const good = readFileSync('Dockerfile', 'utf8');
    const reinstall = good.replace('RUN npm prune --omit=dev', 'RUN npm prune --omit=dev\nRUN npm ci');
    expect(reinstall).not.toBe(good);
    expect(devDepsViolations(reinstall, RUNTIME)).toHaveLength(2);
    const wholeApp = good.replace('COPY --from=prod-deps /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./package.json\nCOPY --from=build /app/apps/web/.next',
      'COPY --from=prod-deps /app/node_modules ./node_modules\nCOPY --from=build /app /app\nCOPY --from=build /app/apps/web/.next');
    expect(wholeApp).not.toBe(good);
    expect(devDepsViolations(wholeApp, RUNTIME)).toEqual(['web: node_modules из стадии build, где dev-зависимости не удалены']);
    const multiline = good.replace('COPY --from=prod-deps /app/node_modules ./node_modules', 'COPY --from=build \\\n  /app/node_modules ./node_modules');
    expect(multiline).not.toBe(good);
    expect(devDepsViolations(multiline, RUNTIME)).toContain('web: node_modules из стадии build, где dev-зависимости не удалены');
    const installInRuntime = good.replace('EXPOSE 3000', 'RUN npm install vitest\nEXPOSE 3000');
    expect(devDepsViolations(installInRuntime, RUNTIME)).toEqual(['web: npm ставит пакеты прямо в рантайм-стадии']);
  });

  it('пустой вход и пропавшая стадия — отказ, а не «нарушений нет»', () => {
    expect(devDepsViolations('', RUNTIME)).toEqual(['web: стадии нет в Dockerfile', 'worker: стадии нет в Dockerfile']);
    expect(devDepsViolations('FROM node:22 AS web\nCMD ["node"]\n', ['web'])).toEqual(['web: node_modules не копируется вовсе — проверять нечего']);
  });

  it('тестовая цель по-прежнему несёт dev-зависимости: она наследует build, где стоит vitest', () => {
    const test = parseStages(readFileSync('Dockerfile', 'utf8')).find(stage => stage.name === 'test');
    expect(test?.from).toBe('build');
  });
});
