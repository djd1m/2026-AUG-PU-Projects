/** @type {import('next').NextConfig} */
// Standalone-вывода нет намеренно: рантайм-образ копирует node_modules целиком (Dockerfile),
// и второй способ упаковки означал бы два места, где решается одно и то же.
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Секретов вызова наружу у web нет ни одного: ни ключа модели, ни токена бота.
  // Здесь НЕТ блока env — он был бы единственным способом их сюда протащить.
};

export default nextConfig;
