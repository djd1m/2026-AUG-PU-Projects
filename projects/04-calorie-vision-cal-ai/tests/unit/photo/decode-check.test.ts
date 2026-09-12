// FR-scan-pipeline-17, AC-scan-pipeline-24: недекодируемый файл с валидной сигнатурой
// контейнера отвергается ОТДЕЛЬНОЙ, дешёвой проверкой (`isDecodable`) — не полагается на
// полную нормализацию. Не требует базы/сети: `sharp` работает над буфером в памяти.

import { describe, expect, it } from 'vitest';
import { isDecodable } from '../../../apps/api/src/photo/decode-check.js';
import { corruptedHeicLikeFixture, makeJpegFixture } from '../../helpers/image-fixtures.js';

describe('isDecodable (AC-scan-pipeline-24)', () => {
  it('декодируемый JPEG — true', async () => {
    const jpeg = await makeJpegFixture();
    expect(await isDecodable(jpeg)).toBe(true);
  });

  it('правдоподобная сигнатура HEIC-контейнера с битым битстримом — false, без исключения наружу', async () => {
    const corrupted = corruptedHeicLikeFixture();
    await expect(isDecodable(corrupted)).resolves.toBe(false);
  });

  it('усечённый JPEG (валидные первые байты, тело обрезано) — false', async () => {
    const jpeg = await makeJpegFixture(800, 600);
    const truncated = jpeg.subarray(0, Math.floor(jpeg.byteLength / 3));
    expect(await isDecodable(truncated)).toBe(false);
  });
});
