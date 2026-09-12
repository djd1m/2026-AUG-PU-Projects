import type { MetadataRoute } from 'next';

// Манифест PWA как МАРШРУТ, а не статический файл: Next отдаёт его с типом
// `application/manifest+json`, тогда как `public/manifest.json` уехал бы как
// `application/json` — и часть браузеров манифест бы не приняла.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Тарелка — калории по фото',
    short_name: 'Тарелка',
    description: 'Фото тарелки → калории и БЖУ из открытой базы с видимым источником.',
    lang: 'ru',
    start_url: '/',
    display: 'standalone',
    background_color: '#101014',
    theme_color: '#101014',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
