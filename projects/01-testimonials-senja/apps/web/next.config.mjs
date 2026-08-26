/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone не используем: apps/web/Dockerfile копирует node_modules из deps-стадии.
  reactStrictMode: true,
  // packages/db — рабочее пространство монорепо, отдаётся как TS-исходники (без сборки,
  // см. packages/db/package.json "exports": "./src/index.ts"). Next должен его транспилировать.
  transpilePackages: ['@proofwall/db'],
  poweredByHeader: false,
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
