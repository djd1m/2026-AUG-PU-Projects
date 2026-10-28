import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { privacyDocument, termsDocument, legalOperator } from '../apps/web/src/lib/legal-documents';
import { LegalDocument } from '../apps/web/src/app/legal/LegalDocument';
import { SupportLauncher } from '../apps/web/src/app/SupportLauncher';
import { LEGAL_FOOTER_CSS, legalFooterHtml } from '../apps/web/src/lib/legal-footer';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
import { createGuestPageHandler } from '../apps/web/src/server/guest-page';
const fixture = JSON.parse(readFileSync('tests/artifacts/legal-pages/document-content.json', 'utf8')) as Record<string, { docx_sha256: string; paragraphs: [string, string][] }>;
const replacements = JSON.parse(readFileSync('tests/artifacts/legal-pages/approved-replacements.json', 'utf8')) as { document: string; index: number; old: string; new: string }[];
it.each([['privacy', privacyDocument, 62], ['terms', termsDocument, 87]] as const)('preserves every supplied %s paragraph except explicit owner-approved replacements', (kind, document, count) => {
  const source = fixture[kind]!;
  const expected = source.paragraphs.map(([style, text], index) => {
    const change = replacements.find(item => item.document === kind && item.index === index);
    if (change) expect(change.old).toBe(text);
    return [style, change?.new ?? text];
  });
  expect(document.docx_sha256).toBe(source.docx_sha256);
  expect(document.paragraphs).toHaveLength(count);
  expect(document.paragraphs.map(p => [p.style, p.text])).toEqual(expected);
  const html = renderToStaticMarkup(createElement(LegalDocument, { document }));
  let position = -1;
  for (const p of document.paragraphs) {
    const escaped = renderToStaticMarkup(createElement('span', null, p.text)).slice(6, -7);
    const next = html.indexOf(escaped, position + 1); expect(next).toBeGreaterThan(position); position = next;
  }
});
it('escapes legal document text as React nodes', () => {
  const html = renderToStaticMarkup(createElement(LegalDocument, { document: { docx_sha256: '', paragraphs: [{ style: 'BodyText', text: '<script>"&' }] } }));
  expect(html).toContain('&lt;script&gt;&quot;&amp;'); expect(html).not.toContain('<script>');
});
function assertFooter(html: string) {
  expect(html.match(/aria-label="Документы и реквизиты"/g)).toHaveLength(1);
  for (const href of ['/legal/privacy', '/legal/terms', '/support', `mailto:${legalOperator.email}`]) expect(html).toContain(`href="${href}"`);
  const details = html.match(/<details([^>]*)>([\s\S]*?)<\/details>/);
  expect(details, 'requisites use native disclosure').not.toBeNull();
  expect(details![1]).not.toMatch(/\bopen(?:\s|=|$)/);
  expect(details![2]).toMatch(/^<summary>Реквизиты<\/summary>/);
  for (const value of Object.values(legalOperator)) expect(details![2]).toContain(value);
  const nav = html.match(/<nav aria-label="Документы и поддержка">([\s\S]*?)<\/nav>/)!;
  expect(html.indexOf(nav[0])).toBeLessThan(html.indexOf(details![0]));
  for (const href of ['/legal/privacy', '/legal/terms', '/support']) expect(nav[1]).toContain(`href="${href}"`);
}
it('renders one global footer with every exact requisite and both legal links', () => {
  assertFooter(renderToStaticMarkup(createElement(SupportLauncher)));
  assertFooter(legalFooterHtml());
  const html = legalFooterHtml({ ...legalOperator, name: '<script>"&', email: '" onmouseover="attack' });
  expect(html).toContain('&lt;script&gt;&quot;&amp;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('href="mailto:" onmouseover=');
});
it('shares the footer styles across React and standalone pages', () => {
  expect(readFileSync('apps/web/src/app/globals.css', 'utf8')).toContain(LEGAL_FOOTER_CSS);
});
it('standalone clip and guest HTML include legal footer while retaining original actions', async () => {
  const common = { referralSecret: 'test-secret', trustedProxyHops: 1, allowRead: async () => true, auth: { authenticate: vi.fn() } };
  const short = createShortLinkHandler({ ...common, links: { find: vi.fn().mockResolvedValue({ id: 'link', code: 'ABC123', title: 'Clip', account_id: 'owner', status: 'done', thumbnail_key: null, expires_at: null, retention_from: new Date(), plan: 'free' }), recordView: vi.fn() }, preview: async () => null });
  const guest = createGuestPageHandler({ ...common, guests: { find: vi.fn().mockResolvedValue({ guest_name: 'Guest', clips: [], expires_at: new Date(), partner_code: null, account_id: 'owner', code: 'ABC123' }), recordOpen: vi.fn() } });
  for (const handler of [short, guest]) {
    const response = await handler(new Request('https://example.test/c/ABC123', { headers: { 'x-forwarded-for': '192.0.2.1, 127.0.0.1' } }), 'ABC123');
    expect(response.status).toBe(200); const html = await response.text(); assertFooter(html); expect(html).toContain('Сделать свои клипы');
  }
});
