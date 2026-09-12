/** @type {import('next').NextConfig} */
// Standalone-вывода нет намеренно: рантайм-образ копирует node_modules целиком (Dockerfile),
// и второй способ упаковки означал бы два места, где решается одно и то же.
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Спецификация требует манифест по `GET /manifest.json` (AC-foundation-12). Next отдаёт
  // маршрут метаданных по имени `/manifest.webmanifest`, поэтому адрес из критерия заводится
  // переписыванием, а не вторым файлом: два источника одного манифеста разошлись бы молча.
  // Тип ответа при этом остаётся `application/manifest+json` — его ставит тот же маршрут.
  async rewrites() {
    return [{ source: '/manifest.json', destination: '/manifest.webmanifest' }];
  },
  // Секретов вызова наружу у web нет ни одного: ни ключа модели, ни токена бота.
  // Здесь НЕТ блока env — он был бы единственным способом их сюда протащить.
};

export default nextConfig;
