# F01 implementation boundaries

Canonical docs/Architecture.md+ADR005. Node22 strictTypeScript/nativeHTTP/pg/argon2.
Files owned by sole Solwriter: project package.json/package-lock.json/tsconfig,
Dockerfile/docker-compose.yml/.dockerignore/.env.example,src/{config,db,auth,server},
db/001-init.sql,scriptsneededforbuildtests,tests/auth*. All remain inside N7.
N7 coordinator integrates final manifests/lock and reviews actualversions/licenses.
No root config/N6 code edits. Isolatedworktree, ownDockerproject/network/volume.
Use N3a fixedArgon2+kdfadmission,N1sessionHMAC,N5AuthStore,N6atomic active grant:
read ONLY bound donor paths in reuse-inventory; record adapted/rejected fragments.
Do not copy unrelated donor docs/assets. Config safe local generated ephemeral
keys can live ignored/tmp files; never output values. Live transport globallyoff.
