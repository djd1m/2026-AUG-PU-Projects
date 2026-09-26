// Мутации прибора адаптивности и каркаса design-shell (guard-must-be-able-to-fail): каждое правило R1/R2/R4/R5/R8/R9
// выключается в scripts/responsive/rules.mjs ИЛИ дефект вносится в настоящий globals.css — и браузерный набор обязан
// покраснеть на НАЗВАННОМ тесте. Образец — N5 scripts/test-*-mutations.mjs. Исходный файл восстанавливается в finally.
// Запуск из корня проекта: node scripts/test-design-shell-mutations.mjs [id…]  → 0 все красные, 1 выжившая, 2 не выполнено.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RULES = 'scripts/responsive/rules.mjs', CSS = 'apps/web/src/app/globals.css';
const MUTATIONS = [
  { id: 'R1-rule', file: RULES, from: "if (enabled.includes('R1') && document.documentElement.scrollWidth > innerWidth)", to: "if (false && enabled.includes('R1'))", expect: /R1: внедрённый дефект/ },
  { id: 'R2-rule', file: RULES, from: "if (enabled.includes('R2') && !inline(el))", to: "if (false && !inline(el))", expect: /R2: внедрённый дефект/ },
  { id: 'R4-rule', file: RULES, from: "severity: !v.incomplete && ['serious', 'critical'].includes(v.impact) ? 'error' : 'warning',", to: "severity: 'warning',", expect: /R4: контраст/ },
  { id: 'R5-rule', file: RULES, from: "if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)", to: "if (false)", expect: /R5: внедрённый дефект/ },
  { id: 'R8-rule', file: RULES, from: 'if (after / before[i] < 1.8)', to: 'if (after / before[i] < 0)', expect: /R8: px не растёт/ },
  { id: 'R9-rule', file: RULES, from: 'if (rect.top >= 0 && rect.bottom <= innerHeight) return [];', to: 'return [];', expect: /R9 below/ },
  // Дефекты в НАСТОЯЩЕМ продукте: те же правила обязаны поймать их на разметке страниц N6.
  { id: 'css-R1-url-form', file: CSS, from: '.url-form { max-width:40rem;', to: '.url-form { min-width:40rem;', expect: /landing (dark|light) 390: R1/ },
  { id: 'css-R2-toggle', file: CSS, from: '.theme-toggle { width:2.75rem; min-width:2.75rem; min-height:2.75rem;', to: '.theme-toggle { width:2rem; min-width:2rem; min-height:2rem; max-height:2rem;', expect: /390: R1\/R2\/R5/ },
  { id: 'css-R4-muted', file: CSS, from: '--muted:#9aa5b1;', to: '--muted:#4a525c;', expect: /dark 390: R1\/R2\/R5, axe/ },
  { id: 'css-R5-field', file: CSS, from: 'input, select, textarea { font:inherit; font-size:max(1rem, 16px); }', to: 'input, select, textarea { font:inherit; font-size:14px !important; }', expect: /390: R1\/R2\/R5/ },
  { id: 'css-R8-h1-px', file: CSS, from: 'h1 { font-size:clamp(2.5rem,5vw,4rem);', to: 'h1 { font-size:40px;', expect: /R8 без отказов/ },
  { id: 'css-R9-hero', file: CSS, from: '.hero { padding-block:var(--space-6) var(--space-10); }', to: '.hero { padding-block:40rem var(--space-10); }', expect: /R9 \/ (dark|light)/ },
];
const selected = process.argv.slice(2);
const run = selected.length ? MUTATIONS.filter(m => selected.includes(m.id)) : MUTATIONS;
if (!run.length || run.length !== (selected.length || MUTATIONS.length)) { console.error('НЕ ВЫПОЛНЕНО: неизвестный id мутации'); process.exit(2); }
const OUT = 'tests/artifacts/design-shell/mutations';
mkdirSync(OUT, { recursive: true });
// Мутация правила гоняет набор правил, мутация CSS — набор страниц; базовая линия после восстановления — оба.
const suite = (files = []) => spawnSync('bash', ['scripts/check-responsive.sh', '--test', ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tally = text => (text.match(/^\s*Tests\s+\d[^\n]*/gm) ?? []).pop()?.trim() ?? 'нет строки Tests';
let survived = 0, notRun = 0;
for (const m of run) {
  const original = readFileSync(m.file, 'utf8');
  if (original.split(m.from).length !== 2) { console.error(`НЕ ВЫПОЛНЕНО ${m.id}: образец не найден ровно один раз в ${m.file}`); notRun++; continue; }
  let result;
  try { writeFileSync(m.file, original.replace(m.from, m.to)); result = suite([m.file === RULES ? 'tests/browser/responsive-check.test.ts' : 'tests/browser/design-shell.test.ts']); }
  finally { writeFileSync(m.file, original); }
  const text = `${result.stdout}\n${result.stderr}`;
  const failedLines = text.split('\n').filter(line => /^\s*(×|FAIL)/.test(line));
  const named = failedLines.some(line => m.expect.test(line));
  const verdict = result.status === 2 || result.status === null ? 'НЕ ВЫПОЛНЕНО' : result.status !== 0 && named ? 'УБИТА' : 'ВЫЖИЛА';
  if (verdict === 'ВЫЖИЛА') survived++; if (verdict === 'НЕ ВЫПОЛНЕНО') notRun++;
  const receipt = `${m.id}: ${verdict}; код ${result.status}; ${tally(text)}\nожидался красный: ${m.expect}\n${failedLines.slice(0, 12).join('\n')}\n`;
  writeFileSync(`${OUT}/${m.id}.txt`, receipt);
  console.log(receipt);
}
const baseline = suite();
const baseText = `${baseline.stdout}\n${baseline.stderr}`;
writeFileSync(`${OUT}/baseline.txt`, `baseline: код ${baseline.status}; ${tally(baseText)}\n`);
console.log(`baseline после восстановления: код ${baseline.status}; ${tally(baseText)}`);
process.exitCode = notRun || baseline.status !== 0 ? 2 : survived ? 1 : 0;
