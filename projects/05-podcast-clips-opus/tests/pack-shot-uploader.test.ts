import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
import { VideoUploader } from '../apps/web/src/app/upload/Uploader';
it('checkbox names both effects and credits both CC0 sources', () => {
  const html = renderToStaticMarkup(createElement(VideoUploader));
  expect(html).toContain('Добавить музыку и финальный акцент');
  expect(html.match(/<small class="muted">([^<]*)<\/small>/)?.[1]).toBe('Komiku — Helice Awesome Dance Adventure · Kenney — Sci-Fi Sounds, CC0');
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
});
