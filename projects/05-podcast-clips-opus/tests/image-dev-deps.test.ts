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
  // Состояние node_modules стадии прослеживается ПО ПОРЯДКУ инструкций (ревью Codex, круги 1–2): `npm prune|ci
  // --omit=dev` делает дерево чистым; `npm ci|install` без него и копия node_modules (или родительского каталога) из
  // нечистой стадии либо из контекста — грязным. Чистота стадии — её КОНЕЧНОЕ состояние, а не наличие одной строки.
  type Tree = 'none' | 'clean' | 'dirty';
  const COPY_JSON = /^COPY\s+((?:--\S+\s+)*)(\[.*\])\s*$/;
  const copyArgs = (copy: string): { from?: string; sources: string[] } => {
    const json = COPY_JSON.exec(copy);
    let flags: string[]; let paths: string[];
    if (json) {
      flags = json[1]!.trim().split(/\s+/).filter(Boolean);
      try { paths = JSON.parse(json[2]!) as string[]; } catch { paths = ['<неразобранная JSON-форма>']; }
    } else {
      const args = copy.replace(/^COPY\s+/, '').split(/\s+/);
      flags = args.filter(a => a.startsWith('--')); paths = args.filter(a => !a.startsWith('--'));
    }
    const from = flags.map(f => /^--from=(\S+)/.exec(f)?.[1]).find(Boolean)?.toLowerCase();
    return { from, sources: paths.slice(0, -1) };
  };
  // node_modules может приехать копией самого каталога ИЛИ его родителя (`/app`, `/`, `.`, `/app/*`), а неразобранная
  // форма считается приезжающей (fail-closed).
  const carries = (sources: string[]) =>
    sources.some(s => /node_modules|неразобранная/.test(s) || /^(\/|\/app\/?|\.\/?|\/app\/\*)$/.test(s));
  const memo = new Map<string, Tree>();
  const treeOf = (name: string, seen = new Set<string>()): Tree => {
    if (memo.has(name)) return memo.get(name)!;
    const stage = byName.get(name);
    if (!stage || seen.has(name)) return 'dirty';
    seen.add(name);
    let tree: Tree = byName.has(stage.from) ? treeOf(stage.from, seen) : 'none';
    for (const line of stage.lines) {
      if (/^RUN\s/.test(line)) {
        for (const m of line.matchAll(/\bnpm\s+(ci|install|i|prune)\b[^&;|]*/g)) {
          if (/--omit=dev\b/.test(m[0]) && /^npm\s+(ci|prune)\b/.test(m[0])) tree = 'clean';
          else if (m[1] !== 'prune') tree = 'dirty';
        }
      } else if (/^COPY\b/.test(line)) {
        const { from, sources } = copyArgs(line);
        if (!carries(sources)) continue;
        if (!from || treeOf(from, seen) !== 'clean') tree = 'dirty';
        else if (tree === 'none') tree = 'clean';
      }
    }
    memo.set(name, tree);
    return tree;
  };
  const problems: string[] = [];
  for (const target of runtime) {
    const stage = byName.get(target);
    if (!stage) { problems.push(`${target}: стадии нет в Dockerfile`); continue; }
    const tree = treeOf(target);
    if (tree === 'none') problems.push(`${target}: node_modules не копируется вовсе — проверять нечего`);
    if (tree === 'dirty') {
      const culprits = stage.lines.filter(l => (/^RUN\s.*\bnpm\s+(ci|install|i)\b/.test(l) && !/--omit=dev/.test(l))
        || (/^COPY\b/.test(l) && carries(copyArgs(l).sources) && treeOf(copyArgs(l).from ?? '') !== 'clean'));
      const from = byName.has(stage.from) && treeOf(stage.from) !== 'clean' ? [`FROM ${stage.from}`] : [];
      problems.push(`${target}: в рантайм попадают dev-зависимости: ${[...from, ...culprits].join(' | ') || 'см. стадию'}`);
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

  // Какие рантайм-цели страж называет нарушителями (сообщения несут строку-виновника, сравниваем по цели).
  const red = (dockerfile: string) => devDepsViolations(dockerfile, RUNTIME).map(problem => problem.split(':')[0]);
  const mutate = (good: string, from: string, to: string) => {
    const bad = good.replace(from, to);
    expect(bad, `мутация не применилась: ${from}`).not.toBe(good);
    return bad;
  };

  it('страж краснеет на прежней форме (node_modules из build) и на подмене стадии без --omit=dev', () => {
    const good = readFileSync('Dockerfile', 'utf8');
    const reverted = good.replaceAll('COPY --from=prod-deps /app/node_modules', 'COPY --from=build /app/node_modules');
    expect(reverted).not.toBe(good);
    expect(red(reverted)).toEqual(['web', 'worker']);
    expect(devDepsViolations(reverted, RUNTIME)[0]).toContain('COPY --from=build /app/node_modules');
    expect(red(mutate(good, 'RUN npm prune --omit=dev', 'RUN true'))).toEqual(['web', 'worker']);
    expect(red(mutate(good, 'FROM node:22.22-alpine AS web', 'FROM build AS web'))).toEqual(['web']);
  });

  it('обходы из ревью Codex (круги 1–2) краснеют', () => {
    const good = readFileSync('Dockerfile', 'utf8');
    const webCopies = 'COPY --from=prod-deps /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./package.json\nCOPY --from=build /app/apps/web/.next';
    // круг 1: npm ci после prune; копия /app целиком; многострочный COPY; npm install в рантайме
    expect(red(mutate(good, 'RUN npm prune --omit=dev', 'RUN npm prune --omit=dev\nRUN npm ci'))).toEqual(['web', 'worker']);
    expect(red(mutate(good, webCopies, webCopies.replace('COPY --from=build /app/package.json ./package.json', 'COPY --from=build /app /app')))).toEqual(['web']);
    expect(red(mutate(good, 'COPY --from=prod-deps /app/node_modules ./node_modules', 'COPY --from=build \\\n  /app/node_modules ./node_modules'))).toEqual(['web']);
    expect(red(mutate(good, 'EXPOSE 3000', 'RUN npm install vitest\nEXPOSE 3000'))).toEqual(['web']);
    // круг 2: копия dev-дерева в prod-deps ПОСЛЕ prune; JSON-форма COPY целого /app
    expect(red(mutate(good, 'RUN npm prune --omit=dev', 'RUN npm prune --omit=dev\nCOPY --from=deps /app/node_modules ./node_modules'))).toEqual(['web', 'worker']);
    expect(red(mutate(good, webCopies, webCopies.replace('COPY --from=build /app/package.json ./package.json', 'COPY --from=build ["/app", "/app"]')))).toEqual(['web']);
    expect(red(mutate(good, webCopies, webCopies.replace('COPY --from=build /app/package.json ./package.json', 'COPY --from=build ["/app/node_modules", "./node_modules"]')))).toEqual(['web']);
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
