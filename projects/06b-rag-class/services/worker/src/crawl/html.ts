import { load } from 'cheerio';
import { normalizeSiteUrl } from '@n6b/db';

export const sameHost = (a: URL, b: URL) => a.hostname.toLowerCase().replace(/^www\./, '') === b.hostname.toLowerCase().replace(/^www\./, '');
export function siteLink(raw: string, base: URL): string | null {
  try {
    const url = new URL(raw, base);
    return sameHost(base, url) ? normalizeSiteUrl(url.href) : null;
  } catch { return null; }
}
export function sitemapUrls(xml: string, base: URL): string[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Сущности XML запрещены');
  const $ = load(xml, { xmlMode: true });
  return $('url > loc').toArray().map((el) => siteLink($(el).text().trim(), base)).filter((u): u is string => u !== null);
}
export function extractHtml(html: string, base: URL): { text: string; title: string; links: string[] } {
  const $ = load(html);
  const title = $('title').first().text().trim() || base.hostname;
  $('nav,footer,script,style,noscript,template').remove();
  const links = $('a[href]').toArray().map((el) => siteLink($(el).attr('href')!, base)).filter((u): u is string => u !== null);
  $('p,div,section,article,main,h1,h2,h3,h4,h5,h6,li,br,tr,blockquote,pre').each((_i, el) => { $(el).append('\n'); });
  const text = $('body').text().split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return { text, title, links };
}
