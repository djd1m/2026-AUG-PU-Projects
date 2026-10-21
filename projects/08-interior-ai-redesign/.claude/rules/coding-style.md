# N8 — coding-style

TypeScript strict. Domain public exports have no Next/pg/fs/concrete provider dependency; small ports. Root integrates manifests/lock/migrations. Parameterized SQL, checked integer money + Decimal quantities, files<500lines.

## Known Gotchas
Regex \w does not cover Cyrillic, use Unicode letters. pg bigint remains string until bounded conversion. SET LOCAL only current transaction; parameterized set_config. Bcrypt ignores >72UTF8bytes unless rejected. Recreated per-request rate stores defeat limits; share service instances. Quantity basis binds exact element/unit.
