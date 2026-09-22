import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { poweredByHeader: false, outputFileTracingRoot: path.resolve(__dirname, '../..'), experimental: { cpus: 2 } };
export default config;
