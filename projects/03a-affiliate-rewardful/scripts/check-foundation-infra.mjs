import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function checkInfrastructure(config, projectRoot) {
  const problems = [];
  if (!config?.services?.db || !config?.services?.web || !config?.services?.test) return ['required_services_missing'];
  const base = realpathSync(projectRoot);
  for (const [name, service] of Object.entries(config.services)) {
    if (service.network_mode || service.privileged || service.pid === 'host') problems.push(`${name}:unsafe_namespace`);
    if (name !== 'web' && service.ports?.length) problems.push(`${name}:published_port`);
    for (const port of service.ports ?? []) if (port.host_ip !== '127.0.0.1') problems.push(`${name}:nonloopback_port`);
    for (const volume of service.volumes ?? []) {
      if (volume.type === 'bind') {
        const source = realpathSync(volume.source);
        if (source !== base && !source.startsWith(`${base}${path.sep}`)) problems.push(`${name}:foreign_mount`);
      }
    }
    const expectedNetworks = name === 'web' ? ['ingress', 'private'] : ['private'];
    if (JSON.stringify(Object.keys(service.networks ?? {}).sort()) !== JSON.stringify(expectedNetworks)) problems.push(`${name}:foreign_network`);
    if (!name.startsWith('web') && !/@sha256:[a-f0-9]{64}$/.test(service.image ?? '')) problems.push(`${name}:unpinned_image`);
  }
  if (config.networks?.private?.internal !== true || config.networks?.private?.external) problems.push('private_network_required');
  if (config.networks?.ingress?.external || config.networks?.ingress?.internal || !config.networks?.ingress) problems.push('own_ingress_network_required');
  if (Object.keys(config.networks ?? {}).some(name => !['private', 'ingress'].includes(name))) problems.push('foreign_network');
  for (const volume of Object.values(config.volumes ?? {})) if (volume.external) problems.push('external_volume');
  const app = config.services.web.environment ?? {};
  if (Object.keys(app).some((key) => /MIGRAT|ADMIN|POSTGRES_PASSWORD/.test(key))) problems.push('web_privileged_credentials');
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync('docker', ['compose', '--profile', 'app', '--profile', 'test', 'config', '--format', 'json'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) { console.error('infra_configuration_unavailable'); process.exitCode = 2; }
  else {
    try {
      const problems = checkInfrastructure(JSON.parse(result.stdout), fileURLToPath(new URL('../', import.meta.url)));
      console.log(problems.length ? problems.join('\n') : 'PASS isolated infrastructure');
      process.exitCode = problems.length ? 1 : 0;
    } catch { console.error('infra_configuration_invalid'); process.exitCode = 2; }
  }
}
