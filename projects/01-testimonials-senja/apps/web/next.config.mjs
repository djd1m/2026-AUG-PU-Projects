/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone не используем: apps/web/Dockerfile копирует node_modules из deps-стадии.
  reactStrictMode: true,
  // packages/db — рабочее пространство монорепо, отдаётся как TS-исходники (без сборки,
  // см. packages/db/package.json "exports": "./src/index.ts"). Next должен его транспилировать.
  transpilePackages: ['@proofwall/db'],
  poweredByHeader: false,
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  webpack(config) {
    // Shared worker sources use NodeNext .js specifiers; resolve their TypeScript
    // sources when Next bundles the same server-only transport implementation.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
