// Подменный сайт по образцу aicoding.space (дефект стенда 28.09, crawl-coverage A-N6-070): 5 прочих страниц (главная,
// «обо мне», контакты, мастерская, лента блога), 42 страницы курсов и 10 записей блога. sitemap.xml перечисляет их в том
// же порядке, что и настоящий сайт: сначала страницы верхнего уровня, затем курсы, записи блога — в конце. При обходе
// FIFO с пределом 50 ни одна запись блога не попадает в прочитанное.
import { article, text, type Handler } from './fake-site';

export const OTHER_PATHS = ['/', '/about/', '/contact/', '/workshop/', '/blog/'];
export const COURSE_PATHS = Array.from({ length: 42 }, (_, i) => `/courses/course-${String(i + 1).padStart(2, '0')}/`);
export const BLOG_PATHS = Array.from({ length: 10 }, (_, i) => `/blog/post-2026-09-${String(10 + i)}/`);

export function sectionedSite(origin = 'http://site.example'): Record<string, Handler> {
  const all = [...OTHER_PATHS, ...COURSE_PATHS, ...BLOG_PATHS];
  const urls = all.map((path) => {
    const lastmod = path.startsWith('/blog/post-') ? path.slice(11, 21) : path.startsWith('/courses/') ? '2026-09-03' : '2026-09-27';
    return `  <url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod></url>`;
  });
  const routes: Record<string, Handler> = {
    '/robots.txt': text('User-agent: *\nAllow: /\n', 'text/plain'),
    '/sitemap.xml': text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`, 'text/xml; charset=utf-8'),
  };
  // Главная ссылается на разделы, как настоящая; содержимое каждой страницы уникально (заголовок — путь).
  for (const path of all) routes[path] = article(`Страница ${path}`, path === '/' ? ['/about/', '/courses/', '/blog/'] : []);
  return routes;
}
