// FR-002, фото к отзыву. Фото — единственный пользовательский ввод, который отдаётся
// браузеру как КОНТЕНТ, а не как текст. Экранирование тут не работает в принципе,
// поэтому вся защита — на приёме и на отдаче.

import { describe, expect, it } from 'vitest';
import { ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES, sniffImage, validatePhoto } from '../src/lib/photo';

const jpeg = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff], 0); return b; };
const png = (n = 64) => {
  const b = new Uint8Array(n);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
};
const webp = (n = 64) => {
  const b = new Uint8Array(n);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  return b;
};
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffImage — тип определяется содержимым', () => {
  it('распознаёт разрешённые растровые форматы', () => {
    expect(sniffImage(jpeg())).toBe('image/jpeg');
    expect(sniffImage(png())).toBe('image/png');
    expect(sniffImage(webp())).toBe('image/webp');
  });

  it('ИНВАРИАНТ: SVG не распознаётся как изображение НИКОГДА', () => {
    // SVG формально картинка, но это XML-документ, который умеет <script> и onload.
    // Открытый на нашем домене, он выполнил бы код в контексте Proofwall.
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<?xml version="1.0"?><svg onload="alert(1)"/>',
      '   <svg/>',
      '<SVG XMLNS="http://www.w3.org/2000/svg"/>',
    ]) {
      expect(sniffImage(text(svg)), svg.slice(0, 30)).toBeNull();
    }
  });

  it('HTML под видом картинки не проходит', () => {
    expect(sniffImage(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(text('<html><body onload=alert(1)>'))).toBeNull();
  });

  it('GIF не в списке разрешённых — молча не пропускается', () => {
    const gif = new Uint8Array(32);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
    expect(sniffImage(gif)).toBeNull();
  });

  it('не падает на коротком и пустом буфере', () => {
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(new Uint8Array([0xff]))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it('почти-совпадение сигнатуры не проходит', () => {
    const almostPng = png();
    almostPng[7] = 0x09; // последний байт сигнатуры испорчен
    expect(sniffImage(almostPng)).toBeNull();
  });
});

describe('validatePhoto — заявленное обязано совпасть с содержимым', () => {
  it('корректное фото проходит', () => {
    expect(validatePhoto(jpeg(), 'image/jpeg')).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(validatePhoto(png(), 'image/png')).toEqual({ ok: true, mime: 'image/png' });
    expect(validatePhoto(webp(), 'image/webp')).toEqual({ ok: true, mime: 'image/webp' });
  });

  it('заголовок с параметрами и регистром разбирается', () => {
    expect(validatePhoto(jpeg(), 'IMAGE/JPEG; charset=binary')).toMatchObject({ ok: true });
  });

  it('ИНВАРИАНТ: PNG, выданный за JPEG, отклоняется', () => {
    const v = validatePhoto(png(), 'image/jpeg');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('не соответствует заявленному формату');
  });

  it('ИНВАРИАНТ: SVG отклоняется, даже если заявлен как SVG', () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    // Сначала на allowlist типов — image/svg+xml там нет.
    const v = validatePhoto(svg, 'image/svg+xml');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('JPEG, PNG и WebP');
  });

  it('ИНВАРИАНТ: SVG, выданный за PNG, отклоняется по содержимому', () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const v = validatePhoto(svg, 'image/png');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('не является изображением');
  });

  it.each(['image/gif', 'image/svg+xml', 'text/html', 'application/pdf', '', 'image/*'])(
    'тип %j не в списке разрешённых', (mime) => {
      const v = validatePhoto(jpeg(), mime);
      expect(v.ok).toBe(false);
    },
  );

  it('пустой файл и превышение размера', () => {
    expect(validatePhoto(new Uint8Array(), 'image/png')).toMatchObject({ ok: false });
    const big = png(MAX_PHOTO_BYTES + 1);
    expect(validatePhoto(big, 'image/png')).toMatchObject({ ok: false });
  });

  it('ровно на границе размера проходит', () => {
    expect(validatePhoto(png(MAX_PHOTO_BYTES), 'image/png')).toMatchObject({ ok: true });
  });

  it('список разрешённых форматов зафиксирован и НЕ содержит svg', () => {
    expect(ALLOWED_PHOTO_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(ALLOWED_PHOTO_MIME as readonly string[]).not.toContain('image/svg+xml');
    expect(ALLOWED_PHOTO_MIME as readonly string[]).not.toContain('image/gif');
  });
});
