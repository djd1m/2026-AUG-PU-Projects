import { readFile } from 'node:fs/promises';
export function parseArgs(args) {
  const options = { base: '', fixture: '', out: '.responsive-artifacts', engines: ['chromium', 'webkit'], widths: [320, 360, 390, 414, 768, 1024, 1440] };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Неверные аргументы');
    options[key] = ['engines', 'widths'].includes(key) ? args[i + 1].split(',') : args[i + 1];
  }
  let url;
  try { url = new URL(options.base); } catch { throw new Error('Нужен --base <origin>'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('--base должен быть origin без credentials');
  options.base = url.origin;
  if (!options.fixture) throw new Error('Нужен --fixture');
  if (!options.engines.length || options.engines.some(e => !['chromium', 'webkit'].includes(e))) throw new Error('Неизвестный движок');
  options.engines = [...new Set(options.engines)];
  options.widths = [...new Set(options.widths.map(Number))];
  if (!options.widths.length || options.widths.some(w => !Number.isInteger(w) || w < 320 || w > 3840)) throw new Error('Некорректные ширины');
  return options;
}
export function validateFixture(f, base) {
  if (!f || ['email', 'password', 'video_id', 'short_code'].some(k => typeof f[k] !== 'string' || !f[k].trim()) || !Array.isArray(f.clip_ids) || !f.clip_ids.length) throw new Error('Фикстура непригодна: нужны email, password, video_id, short_code, clip_ids');
  if (!/^[\w-]+$/.test(f.video_id) || !/^[\w-]+$/.test(f.short_code)) throw new Error('Фикстура непригодна: идентификаторы');
  let guest;
  try { guest = new URL(f.screens?.guest, base); } catch { throw new Error('Фикстура непригодна: гостевая ссылка'); }
  if ((f.origin && f.origin !== base) || guest.origin !== base || !/^\/g\/[\w-]+$/.test(guest.pathname) || guest.search || guest.hash || guest.username || guest.password) throw new Error('Фикстура непригодна: origin или гостевой маршрут');
  return { email: f.email, password: f.password, routes: ['/', `/c/${f.short_code}`, guest.pathname, '/dashboard', `/dashboard/videos/${f.video_id}`] };
}
export async function loadFixture(file, base) {
  let f;
  try { f = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Фикстура отсутствует или не является JSON'); }
  return validateFixture(f, base);
}
export async function preflight(engines, launchOptions = {}) {
  let playwright;
  try { playwright = await import('playwright'); } catch { throw new Error(`Браузер ${engines[0]} недоступен: пакет playwright отсутствует`); }
  for (const engine of engines) {
    let browser;
    try { browser = await playwright[engine].launch({ headless: true, ...launchOptions }); }
    catch { throw new Error(`Браузер ${engine} недоступен`); }
    finally { await browser?.close(); }
  }
}
export const exitCode = report => report.errors.length ? 2 : report.findings.some(f => f.severity === 'error') ? 1 : 0;
