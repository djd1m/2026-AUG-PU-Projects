// Это сигнатура контейнера, полную пригодность звука определит ffprobe в worker-stt.
export function isAllowedMedia(bytes: Uint8Array): boolean {
  const b = Buffer.from(bytes);
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp') {
    const size = b.readUInt32BE(0);
    if (size < 16 || size > b.length) return false;
    const allowed = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4A ', 'M4V ', 'qt  ', 'MSNV']);
    const brands = [b.toString('ascii', 8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(b.toString('ascii', i, i + 4));
    return brands.some((brand) => allowed.has(brand));
  }
  // Старый QuickTime может начинаться атомом moov/mdat без ftyp.
  if (b.length >= 8 && ['moov', 'mdat', 'wide'].includes(b.toString('ascii', 4, 8)) && b.readUInt32BE(0) >= 8) return true;
  if (b.length >= 8 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    // DocType EBML: 0x4282, размер 4, "webm"; Matroska не входит в список.
    return b.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]));
  }
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'ID3') {
    return [2, 3, 4].includes(b[3]!) && b.subarray(6, 10).every((v) => v < 128);
  }
  // MPEG audio frame sync, допустимые version/layer/bitrate/sample-rate.
  return b.length >= 4 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0 &&
    (b[1]! & 0x18) !== 0x08 && (b[1]! & 0x06) !== 0 &&
    (b[2]! & 0xf0) !== 0xf0 && (b[2]! & 0xf0) !== 0 && (b[2]! & 0x0c) !== 0x0c;
}
