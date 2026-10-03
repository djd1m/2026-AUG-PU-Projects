/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // bcrypt — нативный модуль: не бандлится, грузится из node_modules в рантайме.
  serverExternalPackages: ['bcrypt', 'pg'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }, {
      source: '/b/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex' },
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

export default async function config(phase) {
  // Next start must not import TypeScript: production images omit devDependencies.
  if (phase === 'phase-production-build') {
    const { buildWidget } = await import('../../scripts/build-widget.mjs');
    await buildWidget();
  }
  return nextConfig;
}
