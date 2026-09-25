// Feature 26 clip-card: score plate on the frame, actions «Скачать · Ссылка · Гостю» under it, explanations in <details>.
// No DOM in this stack: the «Гостю» mark is a pure function (mutated by the guard), markup via renderToStaticMarkup.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { presentClip, type ClipRow } from '../apps/web/src/server/screen';
import { ClipCard } from '../apps/web/src/app/clips/ClipCard';
import { revealGuestForm } from '../apps/web/src/app/clips/GuestPacks';
import { addGuestPreselect } from '../apps/web/src/lib/guest-contract';

const now = new Date('2026-09-22T12:00:00Z');
const id = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const row: ClipRow = { id, index: 1, start_seconds: '2', end_seconds: '31.2', title: 'Сильный момент', status: 'done',
  watermarked: true, object_key: 'file', expires_at: null, score: 85, score_hook: 29, score_completeness: 29, score_length: 27,
  explain_hook: 'Вопрос с первых слов', explain_completeness: 'Есть законченный ответ', explain_length: 'Нет лишних слов' };
const video = { plan: 'paid', finished_at: now };
const ready = presentClip(row, video, now);
const card = (extra: Partial<Parameters<typeof ClipCard>[0]> = {}) => renderToStaticMarkup(createElement(ClipCard, { clip: ready, ...extra }));
const button = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? '';

describe('addGuestPreselect — «Гостю» marks the clip in the guest form', () => {
  it('marks an offered clip', () => {
    expect(addGuestPreselect([], id, [id, other])).toEqual([id]);
    expect(addGuestPreselect([other], id, [id, other])).toEqual([other, id]);
  });
  it('a repeated press does not duplicate the mark', () => {
    expect(addGuestPreselect([id], id, [id])).toEqual([id]);
  });
  it('fail-closed: a clip the form does not offer (not available, unknown) is not marked', () => {
    expect(addGuestPreselect([], id, [])).toEqual([]);
    expect(addGuestPreselect([other], 'nope', [id, other])).toEqual([other]);
  });
  it('does not mutate the previous state', () => {
    const before = Object.freeze([other]) as readonly string[];
    expect(addGuestPreselect(before, id, [id, other])).not.toBe(before);
    expect(before).toEqual([other]);
  });
});

describe('revealGuestForm — scroll respects reduced motion in code, focus goes to «Имя гостя»', () => {
  const targets = () => ({ section: { scrollIntoView: vi.fn() }, field: { focus: vi.fn() } });
  it.each([[true, 'auto'], [false, 'smooth']] as const)('reduce=%s → behavior %s', (reduce, behavior) => {
    const t = targets(), media = vi.fn().mockReturnValue({ matches: reduce });
    revealGuestForm(t.section, t.field, media);
    expect(media).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(t.section.scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'start' });
    expect(t.field.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('no matchMedia and missing nodes do not throw', () => {
    const t = targets();
    revealGuestForm(t.section, null, undefined);
    expect(t.section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(() => revealGuestForm(null, null, undefined)).not.toThrow();
  });
});

describe('ClipCard markup', () => {
  it('three actions with full accessible names; short visible texts', () => {
    const html = card({ onSendToGuest: vi.fn() });
    expect(html).toContain('class="clip-actions" role="group" aria-label="Действия с клипом"');
    for (const [label, text] of [['Скачать клип', '↓ Скачать'], ['Ссылка на клип — скопировать', 'Ссылка'], ['Отправить клип гостю', 'Гостю']] as const) {
      expect(button(html, label), label).not.toBe('');
      expect(html).toMatch(new RegExp(`aria-label="${label}"[^>]*>\\s*${text}</button>`));
    }
  });
  it('«Гостю» is disabled without the guest form and for a clip that is not available', () => {
    expect(button(card(), 'Отправить клип гостю')).toContain('disabled=""');
    const pending = presentClip({ ...row, status: 'rendering' }, video, now);
    expect(pending.available).toBe(false);
    expect(button(renderToStaticMarkup(createElement(ClipCard, { clip: pending, onSendToGuest: vi.fn() })), 'Отправить клип гостю')).toContain('disabled=""');
    expect(button(card({ onSendToGuest: vi.fn() }), 'Отправить клип гостю')).not.toContain('disabled');
  });
  it('the card never creates a guest pack; the form marks the clip through addGuestPreselect only on a new nonce', () => {
    const cardSource = readFileSync('apps/web/src/app/clips/ClipCard.tsx', 'utf8');
    expect(cardSource).not.toContain('guest.create');
    expect(cardSource).toContain('onClick={() => onSendToGuest?.(clip.clip_id)}');
    const form = readFileSync('apps/web/src/app/clips/GuestPacks.tsx', 'utf8');
    const effect = /useEffect\(\(\) => \{([\s\S]*?)\}, \[preselect, clips\]\);/.exec(form)?.[1] ?? '';
    expect(effect).toContain('addGuestPreselect(old, preselect.clip_id, selectable)');
    expect(effect).toContain('preselect.nonce === handled.current');
    expect(effect).not.toMatch(/rpc|guest\.create|create\(/);
    const detail = readFileSync('apps/web/src/app/videos/[videoId]/VideoDetail.tsx', 'utf8');
    expect(detail).toContain('const sendToGuest = consentHash ?');
    expect(detail).toContain('preselect={guestPreselect}');
  });
  it('score plate only with a score, aria-hidden; the readable score stays in the text', () => {
    const html = card();
    expect(html).toContain('<span class="score-badge" aria-hidden="true">85</span>');
    expect(html).toContain('Оценка 85 из 99');
    expect(html).toContain('Цепкость 29 · Самодостаточность 29 · Длина 27');
    const unscored = renderToStaticMarkup(createElement(ClipCard, { clip: presentClip({ ...row, score: null }, video, now) }));
    expect(unscored).not.toContain('score-badge'); expect(unscored).toContain('Без оценки');
  });
  it('explanations live inside a closed <details> «Почему такая оценка»', () => {
    const html = card();
    const details = /<details class="score-why">([\s\S]*?)<\/details>/.exec(html)?.[1] ?? '';
    expect(html).not.toMatch(/<details class="score-why" open/);
    expect(details).toContain('<summary>Почему такая оценка</summary>');
    for (const text of ['Вопрос с первых слов', 'Есть законченный ответ', 'Нет лишних слов', 'Цепкость · 29/33']) expect(details).toContain(text);
  });
  it('order: frame → actions → title → score → retention/music → Pro', () => {
    const html = card({ onSendToGuest: vi.fn() });
    const at = (s: string) => { const i = html.indexOf(s); expect(i, s).toBeGreaterThanOrEqual(0); return i; };
    const order = ['<video', 'score-badge', 'clip-actions', '<h3>', 'Оценка 85 из 99', 'Музыка клипа', 'Интерес к тарифу'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('clip-card CSS', () => {
  const css = readFileSync('apps/web/src/app/globals.css', 'utf8');
  const tokens = (selector: RegExp) => Object.fromEntries([...(selector.exec(css)?.[1] ?? '').matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2]!.trim()]));
  const dark = tokens(/:root\s*\{([^}]*)\}/), light = tokens(/:root\[data-theme=light\]\s*\{([^}]*)\}/);
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  it.each([['dark', dark], ['light', light]] as const)('%s: score plate contrast ≥ 4.5:1 (axe skips aria-hidden)', (_, t) => {
    expect(t['score-bg']).toMatch(/^#[0-9a-f]{6}$/i); expect(t['score-fg']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ratio(t['score-bg']!, t['score-fg']!)).toBeGreaterThanOrEqual(4.5);
  });
  it('plate anchored to the preview; action row not forced to 100 % width; card is a size container', () => {
    expect(css).toMatch(/\.clip-preview \{ position:relative;/);
    expect(css).toMatch(/\.score-badge \{ position:absolute;[^}]*background:var\(--score-bg\); color:var\(--score-fg\);/);
    expect(css).toMatch(/\.clip-body \.clip-actions \{ display:flex; flex-wrap:wrap;/);
    expect(css).toMatch(/\.clip-body \.clip-actions button \{ width:auto;/);
    expect(css).toMatch(/\.clip-card \{ container-type:inline-size; \}/);
    expect(css).toMatch(/@container \(min-width:22rem\)/);
  });
});
