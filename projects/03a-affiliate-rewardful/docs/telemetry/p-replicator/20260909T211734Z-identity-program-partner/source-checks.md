# Normative source checks

Checked2026-09-09 for identity-program-partner; no dependency upgrades selected.

- PostgreSQL16 CREATE FUNCTION: https://www.postgresql.org/docs/16/sql-createfunction.html . Harden SECURITY DEFINER with trusted fixedsearch_path and restrictedEXECUTE, creation/revoke in one migration transaction; preserve existing foundation conventions.
- Next.js15 route handlers: https://nextjs.org/docs/15/app/api-reference/file-conventions/route . Dynamic route context params is a Promise; use explicit await. Use standard Request/Response plus server-only runtime modules. The old version15 routing guide URL did not resolve; official file-convention source found instead.

These are source/document checks, not implementation/test results.
