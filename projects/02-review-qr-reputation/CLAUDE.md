# N2 · ReviewQR — умный QR для отзывов

Стенд `https://reviewqr.aicoding.space` · Node 22 + TypeScript без фреймворка · PostgreSQL 16 с четырьмя
ролями и RLS · пять контейнеров compose за общим прокси машины. Описание продукта — [`README.md`](README.md).

**Повторить проект с нуля — [`docs/REPRODUCE.md`](docs/REPRODUCE.md); грабли — [`docs/Refinement.md`](docs/Refinement.md) §9;
состояние требований против кода — [`docs/Specification.md`](docs/Specification.md) §6.**

## Несущее — не ломать

- Один контейнер — одна роль СУБД (`app_render`, `app_intake`, `app_notify`, `app_owner`); гейтинг
  невыразим грантами. Страж — `npm run guards` (`scripts/check-db-grants.sh`).
- Страница выбора — чистая функция от слага (T4); маршрута «оценка → направление» нет.
- Тесты — только `npm test` (`scripts/test-all.sh`, каждый набор под своей ролью); голый vitest падает «правами».
- Схема — только новыми файлами миграций через раннер; применённый файл не править.
- `intake` не публиковать и не включать в сеть прокси: он верит `X-Guest-IP`.
- Перед любым `docker compose up` — `node ../../.claude/hooks/check-ports.cjs .` и
  `bash ../../scripts/check-port-conflicts.sh .`.
