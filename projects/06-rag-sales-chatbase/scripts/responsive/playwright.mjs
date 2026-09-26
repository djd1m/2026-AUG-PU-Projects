// Точка входа playwright для scripts/check-responsive.mjs: пакет стоит в scripts/responsive/node_modules (не в корне —
// ADR-007, страж tests/ssrf.test.ts), и голый import('playwright') из scripts/ его бы не нашёл.
export * from 'playwright';
