# Точечная правка двух пост-мерж дефектов (DEC-A-036)

Продолжение `merge-consent.md`: слияние `08fcee1` назвало два дефекта и оставило их
владельцу («передаю владельцу как отдельную находку» / «продуктовое решение… оставлено
владельцу»). Владелец решил чинить оба здесь, в основной ветке. Предыдущий исполнитель
погиб вместе со своей сессией в 07:54 UTC, оставив четыре незакоммиченных файла с уже
готовыми правками и тестами; эта квитанция — ревизия и приёмка ЕГО работы, а не работа с
нуля: диффы `apps/api/src/routes/scans.ts`, `apps/web/app/layout.tsx`,
`tests/integration/routes/scans.test.ts`, `tests/integration/web-manifest.test.ts` уже
содержали правку и тест на каждый дефект. Прочитаны, проверены, дополнены мутацией и
приняты без изменений по существу.

## Таблица дефект → правка → тест → мутация

| Дефект | Правка | Тест | Мутация |
|---|---|---|---|
| №1 SDK Telegram отвергается CSP (`strict-dynamic` без `nonce`) | `apps/web/app/layout.tsx`: `RootLayout` стал `async`, читает `nonce` из заголовка `x-nonce` (ставит `middleware.ts`) через `headers()` и передаёт его пропом `nonce={nonce}` в `<Script src="…telegram-web-app.js">`. Вызов `headers()` переводит рендер `/` из статического (`○`) в динамический (`ƒ`) — иначе nonce, рождающийся на каждый запрос, не с чем сверять на предрендеренной странице | `tests/integration/web-manifest.test.ts`, новый тест «пост-мерж дефект №1»: читает РЕАЛЬНЫЙ ответ `next start` по `/`, извлекает nonce из заголовка `Content-Security-Policy`, парсит bootstrap-тег `next/script` (`(self.__next_s=…).push([...])`) в теле HTML и утверждает, что у САМОГО bootstrap-тега есть `nonce`, равный заголовку, И что nonce, переданный им SDK, — то же значение | Заменил `nonce={nonce}` на `nonce={nonce ? \`mutated-${nonce}\` : nonce}` (var остаётся использованной — lint не блокирует) → пересобрал `next build` → тест **1 failed \| 3 passed** (`expected '…mutated-…' to contain 'nonce="…'`) → восстановлен оригинал → пересобрал → **4 passed**. Отдельно замечено: убрать проп `nonce` целиком (оставив `const nonce` неиспользуемым) валит уже сам `next build` (`no-unused-vars`) — более сильный слой, тоже страж |
| №2 удаление аккаунта не закрывает создание сканов | `apps/api/src/routes/scans.ts`: `requireSession` теперь `LEFT JOIN account` и возвращает `accountId`/`accountStatus` сессии; POST-обработчик, сразу после `requireSession`, отказывает `409 account_erasing`, если `accountId !== null && accountStatus !== 'active'` (fail-closed — сравнение РАВЕНСТВОМ с `'active'`, а не неравенством известным плохим значениям, значит и `erased`, и любой будущий нераспознанный статус тоже отказывают). Симметрично уже существовавшей проверке `enforceConsentBeforeDiaryWrite` → `enforceForAccount` (`row.status !== 'active'` → `REFUSED`, найдено RV-05 третьего обзора ДО этой правки) — запись дневника этот путь уже закрывала, открытым оставался только `POST /scans` | `tests/integration/routes/scans.test.ts`, три новых теста: (1) «дефект №2» — реальная последовательность `DELETE /api/v1/account {scope:'erase_all'}` → `POST /scans` той же сессией → `409 account_erasing`, плюс `count(*) FROM recognition = 0`; (2) fail-closed — сессия аккаунта в статусе `erased` тоже получает `409`; (3) контроль — активный связанный аккаунт продолжает получать `202` | Удалил блок `if (session.accountId !== null && session.accountStatus !== 'active') {...}` из POST-обработчика → **2 failed \| 12 passed** (оба новых сценария вернули `202` вместо `409`) → восстановлен оригинал → **14 passed** |

## Прогоны (эта сессия, после ревизии диффов предыдущего исполнителя)

| Команда | Код | Результат |
|---|---|---|
| `npm run typecheck` | 0 | чисто |
| `npm run lint` | 0 | чисто |
| `npm run build` | 0 | api + recognizer + web; `/` — `ƒ` (Dynamic), было `○` (Static) до правки №1 |
| `npm test` | 0 | 20 файлов, **136 тестов** |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` (стенд `n4-tarelka`, `db`+`storage` healthy) | 0 | 34 файла, **146 тестов** (было 142 до правки — +3 сканы, +1 манифест) |
| мутация дефекта №1 (nonce испорчен при пересылке) | — | `1 failed \| 3 passed`, красный тест назван |
| мутация дефекта №1, восстановление | — | `4 passed` |
| мутация дефекта №2 (проверка статуса удалена) | — | `2 failed \| 12 passed`, оба красных теста названы |
| мутация дефекта №2, восстановление | — | `14 passed` |
| `node .claude/hooks/check-ports.cjs .` | 0 | 2 хранилища, публикации нет |
| `bash scripts/check-env-wiring.sh .` | 0 | api, recognizer — все читаемые переменные проброшены |
| `check-pipeline-gaps.sh . --completion --role-map-source .claude/commands/feature.md --project-role-map-source .claude/skills/sparc-prd-mini/SKILL.md` (пакетный вендорный гейт, не локальный `scripts/check-pipeline-gaps.sh`) | 2 | `VERDICT completion=NOT-ESTABLISHED features=8 gaps=81 inconclusive=2` — **контуры `foundation`, `scan-pipeline`, `consent-and-telegram-auth` не упомянуты НИ В ОДНОМ `GAP`**; все 81 GAP и обе `NOT-ESTABLISHED`-строки относятся к четырём ещё не реализованным фичам (`diary-and-streak`, `partner-codes-and-cabinet`, `share-card-and-growth-events`, `source-and-correct`, `pro-interest-and-limits-ui`) и к артефакту вызова (`./docs/./docs/Completion.md`, удвоение префикса — то же самое, что зафиксировано в `merge-consent.md` прогон 2). Код `2`, а не `0`/`1` — тем же самым образом, что и в `merge-consent.md`: это честное «не всё установлено», а не отказ по нашему контуру |

Локальный `scripts/check-pipeline-gaps.sh` (из `p-replicator-known-gaps.md`, PR-001…PR-007) — другой скрипт с другим назначением, не путать: он не принимает `--completion`/`--role-map-source` и не даёт постройку по контурам; прогнан отдельно тоже, `PR-002 managed BaaS ❌ 3 упоминаний` — известный ложный сигнал шаблонных фраз в документации (не тема этой правки, не трогалось).

Стенд `n4-tarelka`: образы приложений не пересобирались отдельно для контейнера (только web
локально, для мутационного прогона теста манифеста — `next start` внутри контейнера теста не
используется, `web-manifest.test.ts` спавнит `next start` напрямую с хоста). После каждого
мутационного прогона манифеста осиротевший процесс `next-server` на порту 3987 (не собственный
дочерний процесс `spawn`, а его подпроцесс — SIGTERM не долетает) убит вручную
(`kill -9`), иначе следующий прогон отвечает старым процессом с закешированным кодом в памяти —
не дефект правки, особенность `next start`/`waitForServer`, оставляю как найденное для
внимания (не чинил — не входит в объявленную задачу).

## Git

Коммит(ы) — обычные, без `--amend` (урок предыдущей квитанции слияния учтён), трейлер
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Push не выполнялся —
по инструкции координатора.

Status: completed
