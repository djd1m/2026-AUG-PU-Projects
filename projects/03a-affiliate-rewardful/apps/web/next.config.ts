import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@n3a/db'],
  experimental: { cpus: 2 },
};

export default config;
