import { describe, it, expect } from 'vitest';
// @ts-expect-error Node script is deliberately executable without a TS loader.
import { checkInfrastructure } from '../scripts/check-foundation-infra.mjs';

function fixture() {
  const common = { networks: { private: null }, image: `postgres@sha256:${'a'.repeat(64)}` };
  return { services: { db: { ...common }, test: { ...common }, web: { ...common, networks: { private: null, ingress: null }, environment: {}, ports: [{ host_ip: '127.0.0.1' }] } }, networks: { private: { internal: true }, ingress: { driver: 'bridge' } }, volumes: {} };
}
describe('isolated infrastructure', () => {
  it('refuses published database ports and donor resources', () => {
    expect(checkInfrastructure(fixture(), process.cwd())).toEqual([]);
    const published = fixture();
    Object.assign(published.services.db, { ports: [{ host_ip: '127.0.0.1', target: 5432 }] });
    expect(checkInfrastructure(published, process.cwd())).toContain('db:published_port');
    const foreign = fixture();
    Object.assign(foreign.services.db, { volumes: [{ type: 'bind', source: '/tmp' }] });
    expect(checkInfrastructure(foreign, process.cwd())).toContain('db:foreign_mount');
    const exposedDb = fixture();
    Object.assign(exposedDb.services.db.networks, { ingress: null });
    expect(checkInfrastructure(exposedDb, process.cwd())).toContain('db:foreign_network');
    const external = fixture();
    Object.assign(external.networks.ingress, { external: true });
    expect(checkInfrastructure(external, process.cwd())).toContain('own_ingress_network_required');
    const privileged = fixture();
    Object.assign(privileged.services.web.environment, { DATABASE_URL_MIGRATE: 'sensitive-sentinel' });
    expect(checkInfrastructure(privileged, process.cwd())).toContain('web_privileged_credentials');
  });
});
