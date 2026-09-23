import { beforeAll, expect, it } from 'vitest';
import { subprocess } from './fixtures/subprocess';
import { environment } from './fixtures/environment';
import { loadWebConfig, loadWorkerConfig } from '../packages/shared/src/config';
import { CLIP_CODE_ALPHABET } from '../packages/shared/src/clip-code';
import { measureText, watermarkGeometry } from '../packages/shared/src/watermark';

beforeAll(() => {
  for (const config of ['packages/shared/tsconfig.json', 'apps/web/tsconfig.preflight.json', 'apps/worker/tsconfig.json']) {
    const result = subprocess(['node_modules/typescript/bin/tsc', '-p', config]);
    expect(result.status, result.output).toBe(0);
  }
}, 30000);

for (const role of ['web', 'worker-video'] as const) {
  const entry = role === 'web' ? 'apps/web/.next/preflight/preflight.js' : 'apps/worker/dist/workers/render.js';
  it(`SL-006 ${role} startup rejects an added unfit format and names it`, () => {
    // Inject into the compiled authoritative map before loading the real entry point.
    // The extra key is deliberately after portrait: checking only the first entry fails.
    const inject = "require('./packages/shared/dist/formats.js').FORMAT_DIMENSIONS.unfit_test = { width: 540, height: 960 };";
    const env = { ...environment(), N5_PUBLIC_ORIGIN: 'https://clipmkr.ru', N5_SHORT_CODE_LENGTH: '6' };
    const call = role === 'web' ? 'loadWebConfig(process.env)' : "loadWorkerConfig('worker-video', process.env)";
    const config = subprocess(['-e', `${inject} require('./packages/shared/dist/config.js').${call}`], env);
    expect(config.status, config.output).toBe(1);
    expect(config.output).toContain('формат unfit_test');
    const result = subprocess(['-e', `
      ${inject}
      require('./${entry}');
    `], env);
    expect(result.status, result.output).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.output).toContain('формат unfit_test');
    expect(result.output).toContain('не помещается в безопасную область');
  });
  it(`SL-006 ${role} startup configuration passes without the unfit format`, () => {
    const call = role === 'web' ? 'loadWebConfig(process.env)' : "loadWorkerConfig('worker-video', process.env)";
    const result = subprocess(['-e', `require('./packages/shared/dist/config.js').${call}`],
      { ...environment(), N5_PUBLIC_ORIGIN: 'https://clipmkr.ru', N5_SHORT_CODE_LENGTH: '6' });
    expect(result.status, result.output).toBe(0);
  });
  it.each(['6', '10'])(`SL-003 ${role} actual startup rejects oversized origin with price before work (%s)`, length => {
    const result = subprocess([entry], { ...environment(), N5_PUBLIC_ORIGIN: 'https://clipmaker.aicoding.space', N5_SHORT_CODE_LENGTH: length });
    expect(result.status, result.output).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.output).toContain('N5_PUBLIC_ORIGIN');
    expect(result.output).toContain(`N5_SHORT_CODE_LENGTH=${length}`);
    expect(result.output).toContain(`ширина ${length === '6' ? 1190 : 1350} px, предел 972 px`);
    expect(result.output).toMatch(/минуты.*Whisper.*оплачены.*рендер откажет/);
  });
  it(`SL-003 ${role} startup guard rejects configuration in a separate process`, () => {
    const call = role === 'web' ? 'loadWebConfig(process.env)' : "loadWorkerConfig('worker-video', process.env)";
    const result = subprocess(['-e', `require('./packages/shared/dist/config.js').${call}`],
      { ...environment(), N5_PUBLIC_ORIGIN: 'https://clipmaker.aicoding.space' });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('N5_PUBLIC_ORIGIN');
  });
  it(`SL-003 ${role} uses configured length, widest alphabet glyph and default six`, () => {
    const load = (origin: string, length: string | undefined) => {
      const env = { ...environment(), N5_PUBLIC_ORIGIN: origin, N5_SHORT_CODE_LENGTH: length };
      const config = role === 'web' ? loadWebConfig(env) : loadWorkerConfig(role, env);
      if (!('publicOrigin' in config)) throw new Error('Expected render origin');
      return config;
    };
    expect(load('https://clipmkr.ru', undefined).publicOrigin).toBe('https://clipmkr.ru');
    expect(load('https://clipmkr.ru', '6').publicOrigin).toBe('https://clipmkr.ru');
    // A typical 10-character code fits; the worst one does not.
    expect(watermarkGeometry(1080, 1920, 'https://clipmkr.ru', 'AB3XK9AB3X').plateWidth).toBeLessThan(972);
    expect(() => load('https://clipmkr.ru', '10')).toThrow('1035 px');
    expect(load('https://i.io', '10').publicOrigin).toBe('https://i.io');
    for (const length of ['', '7', ' 6']) expect(() => load('https://i.io', length)).toThrow('N5_SHORT_CODE_LENGTH');
    // The runtime safe area is 972; 880 is only a reference-layout test target.
    expect(load('http://localhost:4182', '6').publicOrigin).toBe('http://localhost:4182');
    const widest = Math.max(...[...CLIP_CODE_ALPHABET].map(char => measureText(char, 73)));
    expect(watermarkGeometry(1080, 1920, 'https://clipmkr.ru', 'WWWWWW').codeWidth).toBe(widest * 6);
  });
}
it('SL-003 web preflight accepts a short origin with ten-character codes', () => {
  const result = subprocess(['apps/web/.next/preflight/preflight.js'],
    { ...environment(), N5_PUBLIC_ORIGIN: 'https://i.io', N5_SHORT_CODE_LENGTH: '10' });
  expect(result.status, result.output).toBe(0);
});

it('SL-003 render retains rejection after the startup check is removed', () => {
  expect(() => watermarkGeometry(1080, 1920, 'https://clipmaker.aicoding.space', 'WWWWWW')).toThrow('1190 px, предел 972 px');
});
