# Secrets management — N6b

Внешний API: OpenRouter (ключ серверный, ADR-011). Шаблон «ключи пользователя в браузере» (IndexedDB, AES-GCM) здесь
**не применяется**: виджет отвечает посетителям без браузера владельца, ключ наш.

## Какие секреты есть

| Переменная | Где читается | Последствие отсутствия |
|---|---|---|
| `OPENROUTER_API_KEY` | web, worker (порт провайдера `live`) | отказ старта: «ответы и индексация невозможны» |
| `SESSION_SECRET` | web | отказ старта: сессии нельзя подписать |
| `VISITOR_SECRET` | web | отказ старта: ключ посетителя для пределов нельзя построить |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `DATABASE_URL_OWNER` | db, web, worker, migrate | compose не собирается (`${VAR:?}`) |

## Правила

1. Значения только в `.env` на машине стенда; в репозиторий — лишь `.env.example` с ИМЕНАМИ без значений.
2. Ключ OpenRouter берётся из N6 по разрешению владельца (OWN-06B-007) и **никогда не выводится**: ни в сессию агента, ни в
   журнал, ни в коммит, ни в текст ошибки. Проверка наличия — `test -n "$OPENROUTER_API_KEY"`, не `echo`.
3. Никаких дефолтов для секретов и для `PUBLIC_BASE_URL` в коде и в compose: `${VAR:?}` в compose, EXIT 1 в Boot config check.
4. Ключ не уходит в браузер: `w.js`, страницы и ответы API не содержат ни ключа, ни его префикса; клиентский код не
   обращается к `openrouter.ai`.
5. Тестовый стек (`name: n6b-test`) — пароли `${TEST_DB_PASSWORD:?}`, без значений по умолчанию; адаптер модели `fake`.
6. Ротация: смена ключа — правка `.env` + `docker compose up -d web worker`; утечка — отзыв ключа в кабинете OpenRouter
   немедленно, затем ротация; расход смотреть на https://openrouter.ai/activity и в `/admin/metrics`.
7. `pg_dump` — файлы вне репозитория (`*.dump` в `.gitignore`).

## Проверка

```bash
git grep -nE 'sk-or-|OPENROUTER_API_KEY=.+' -- . ':!*.example'   # пусто
grep -rn "openrouter.ai" apps/widget/ apps/web/src/app/ 2>/dev/null   # пусто: из клиента провайдер не зовётся
```
