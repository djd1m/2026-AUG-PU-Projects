// из N5: projects/05-podcast-clips-opus/apps/web/next.config.ts — без изменений
import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { poweredByHeader: false, outputFileTracingRoot: path.resolve(__dirname, '../..'), experimental: { cpus: 2 } };
export default config;
