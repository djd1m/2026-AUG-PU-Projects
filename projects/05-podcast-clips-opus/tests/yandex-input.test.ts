import { afterEach, expect, it, vi } from 'vitest';
import { createYandexTranscriber, type YandexConnect } from '../apps/worker/src/stt/yandex';
const files = vi.hoisted(() => ({ statSize: 1, readSize: 1 }));
vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({ size: files.statSize })), readFile: vi.fn(async () => Buffer.alloc(files.readSize)) }));
afterEach(() => { files.statSize = files.readSize = 1; });
it.each([0, 10_000_001, 25_000_001])('rejects changed read size %s despite valid pre-read stat', async size => {
  files.readSize = size;
  const open = vi.fn<YandexConnect>();
  await expect(createYandexTranscriber('synthetic', open).transcribe('unused', 6, new AbortController().signal)).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});
it.each([0, 10_000_001, 25_000_001])('rejects invalid stat size %s despite a valid read size', async size => {
  files.statSize = size;
  const open = vi.fn<YandexConnect>();
  await expect(createYandexTranscriber('synthetic', open).transcribe('unused', 6, new AbortController().signal)).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});
