## Закрытие прежних находок

| Находка | Статус | Довод |
|---|---|---|
| Страж прав запускался до создания БД | **Закрыта** | [REPRODUCE.md:77](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:77) откладывает проверку до §6; команда стоит после миграций и паролей в [REPRODUCE.md:145](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:145), как требует [check-db-grants.sh:18](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/scripts/check-db-grants.sh:18). |
| Host Node объявлен ненужным | **Закрыта** | [REPRODUCE.md:37](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:37) требует Node 22 для hook; [REPRODUCE.md:61](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:61) запускает тесты напрямую через Bash. |
| `SESSION_SECRET` не передаётся в `guest` | **Закрыта для воспроизведения** | [REPRODUCE.md:97](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:97) фиксирует дефект, а [REPRODUCE.md:122](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:122) даёт точную обязательную правку compose и проверку перед подъёмом. Это соответствует текущему разрыву между [docker-compose.yml:32](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docker-compose.yml:32) и [journal.ts:49](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/apps/guest/src/journal.ts:49). |
| P-7 обещал self-referral rejection и audit | **Закрыта** | [04_refinement.md:13](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/features/payment/04_refinement.md:13) ограничивает фактический контракт отсутствием комиссии для уже `rejected`; [05_completion.md:3](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/features/payment/05_completion.md:3) помечает PAY-5 частичным. |
| Описание push расходилось с кодом | **Закрыта** | [Architecture-OPS.md:50](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/Architecture-OPS.md:50) теперь соответствует [format.ts:12](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/services/notifier/src/format.ts:12) и [worker.ts:68](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/services/notifier/src/worker.ts:68): времени и ссылки нет, усечение видимое, отдельного события нет. |
| Все Telegram-ссылки приписывались `botDeepLink` | **Закрыта** | [Specification-OWNER.md:58](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/Specification-OWNER.md:58) правильно разделяет `t.me`, `tg://` и Telegram Web согласно [pages.ts:459](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/apps/web/src/pages.ts:459). |

## Оставшаяся находка

1. **P3 — неточно указан повод для host Node.** [REPRODUCE.md:37](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/REPRODUCE.md:37) говорит о «двух проверках» из §5, хотя Node использует только `check-ports.cjs`; `check-port-conflicts.sh` — Bash-скрипт. Достаточно заменить на «для проверки `check-ports.cjs` из §5».

## Вердикт

**Готово к «сборке с нуля»: да с поправками.** Все прежние находки закрыты. Кроме указанной редакционной неточности новых ошибок или противоречий с кодом не найдено.

Проверки:

- `node scripts/check-rebuild-docs.mjs projects/02-review-qr-reputation` — **0, R1–R5 пройдены**.
- `git diff --check 1420a084 HEAD -- projects/02-review-qr-reputation/docs` — **0**.
- Проверены `12896bd1…` против `1420a084…`; E2E для docs-only review не применим.

Профиль: `compact-quality-first-v2`, VALIDATE; запрошено `gpt-5.6-sol medium`, фактическая модель, длительность и usage средой не раскрыты. Телеметрия: [20260929T182617Z-docs-rebuild-02-0330](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/02-review-qr-reputation/docs/telemetry/p-replicator/20260929T182617Z-docs-rebuild-02-0330/).

Сохранить отчёт как `docs/reviews/rebuild-docs-codex-2.md` и обновить телеметрию не удалось: рабочая область предоставлена в read-only режиме.