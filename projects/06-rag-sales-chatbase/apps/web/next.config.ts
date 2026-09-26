// из N5: projects/05-podcast-clips-opus/apps/web/next.config.ts — + serverExternalPackages: bullmq читает
// свои Lua-скрипты с диска относительно своего пакета; в бандле Next эти пути теряются (pdf-source).
import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { poweredByHeader: false, outputFileTracingRoot: path.resolve(__dirname, '../..'), experimental: { cpus: 2 },
  serverExternalPackages: ['bullmq'] };
export default config;
