import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, lstat, rm, realpath, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
export function privateFixtureOrigin(base) {
  const u = new URL(base), host = u.hostname;
  return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash &&
    (host === 'localhost' || host === '[::1]' || (isIP(host) === 4 && (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host))));
}
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Операция существующего браузерного контейнера не выполнена');
  return result.stdout.trim();
}
async function rejectSymlinks(path) {
  for (let part = resolve(path); part !== dirname(part); part = dirname(part)) {
    try { if ((await lstat(part)).isSymbolicLink()) throw new Error('Symlink path refused'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function runContainer(kind, args) {
  let host, remote, stage = 'arguments';
  const container = process.env.N5_PLAYWRIGHT_CONTAINER ?? '';
  try {
    if (!['responsive', 'support'].includes(kind) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container)) throw new Error('Invalid container');
    const values = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--base', '--fixture', '--out', '--engines', '--widths'].includes(args[i]) || !args[i + 1] || Object.hasOwn(values, args[i])) throw new Error('Invalid args');
      values[args[i]] = args[i + 1];
    }
    if (!values['--base'] || !values['--fixture'] || !values['--out']) throw new Error('Missing explicit arguments');
    const fixturePath = resolve(values['--fixture']), output = resolve(values['--out']);
    await rejectSymlinks(fixturePath); await rejectSymlinks(output);
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    if (fixture.synthetic !== true) throw new Error('Only synthetic fixture allowed');
    const ignoreHTTPSErrors = process.env.N5_LOCAL_FIXTURE_TLS === '1';
    if (ignoreHTTPSErrors && !privateFixtureOrigin(values['--base'])) throw new Error('TLS exception requires private HTTPS fixture');
    stage = 'container';
    if (docker(['inspect', '-f', '{{.State.Running}}', container]) !== 'true') throw new Error('Container not running');
    host = await mkdtemp(join(tmpdir(), 'n5-browser-copy-'));
    remote = docker(['exec', container, 'mktemp', '-d', '/tmp/n5-support-browser-XXXXXXXX']);
    if (!/^\/tmp\/n5-support-browser-[a-zA-Z0-9]+$/.test(remote)) throw new Error('Invalid private path');
    stage = 'source-copy';
    const root = await realpath('.');
    const files = ['scripts/check-responsive.mjs', 'scripts/check-support.mjs', 'scripts/responsive/input.mjs', 'scripts/responsive/rules.mjs', 'scripts/responsive/container-run.mjs',
      'apps/web/src/app/globals.css', 'apps/web/src/server/guest-page.ts', 'apps/web/src/server/short-link-handler.ts'];
    for (const file of files) {
      await mkdir(join(host, dirname(file)), { recursive: true });
      await writeFile(join(host, file), await readFile(join(root, file)));
    }
    await writeFile(join(host, 'fixture.json'), JSON.stringify(fixture), { mode: 0o600 });
    await mkdir(join(host, 'node_modules/@axe-core'), { recursive: true });
    stage = 'dependencies';
    await cp('node_modules/axe-core', join(host, 'node_modules/axe-core'), { recursive: true, dereference: true });
    await cp('node_modules/@axe-core/playwright', join(host, 'node_modules/@axe-core/playwright'), { recursive: true, dereference: true });
    await writeFile(join(host, 'runner.mjs'), `import { main } from './scripts/check-${kind}.mjs';\nprocess.exitCode = await main(${JSON.stringify(args.map((arg, i) => args[i - 1] === '--fixture' ? 'fixture.json' : args[i - 1] === '--out' ? 'out' : arg))}, { contextOptions: { ignoreHTTPSErrors: ${ignoreHTTPSErrors} } });\n`);
    stage = 'container-copy';
    docker(['cp', host + '/.', container + ':' + remote]);
    const uid = docker(['exec', container, 'id', '-u']), gid = docker(['exec', container, 'id', '-g']);
    if (!/^\d+$/.test(uid) || !/^\d+$/.test(gid)) throw new Error('Invalid container uid');
    docker(['exec', '--user', '0', container, 'chown', '-R', `${uid}:${gid}`, remote]);
    stage = 'link-playwright';
    docker(['exec', container, 'ln', '-s', '/opt/browser/node_modules/playwright', remote + '/node_modules/playwright']);
    stage = 'link-playwright-core';
    docker(['exec', container, 'ln', '-s', '/opt/browser/node_modules/playwright-core', remote + '/node_modules/playwright-core']);
    stage = 'execute';
    const run = spawnSync('docker', ['exec', '-w', remote, container, 'node', 'runner.mjs'], { stdio: 'inherit' });
    if (run.error || run.status === null || run.status > 2) throw new Error('Browser execution failed');
    stage = 'collect';
    await mkdir(output, { recursive: true });
    docker(['cp', container + ':' + remote + '/out/.', output]);
    return run.status;
  } catch { console.error(`НЕ ВЫПОЛНЕНО: проверка контейнера/аргументов/зависимостей/копирования (${stage})`); return 2; }
  finally { if (remote && /^\/tmp\/n5-support-browser-[a-zA-Z0-9]+$/.test(remote)) { try { docker(['exec', '--user', '0', container, 'rm', '-rf', remote]); } catch {} } if (host) await rm(host, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runContainer(process.argv[2], process.argv.slice(3));
