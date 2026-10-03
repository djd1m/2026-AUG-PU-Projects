# 06. Проверки и диагностика

- Startup failed: проверьте наличие secret files и JSON allowlist, точный APP_ORIGIN,
  поддерживаемые `disabled|local_test`, доступность БД. Не печатайте значения ключей.
- 401: войдите заново; старые async ответы после logout намеренно игнорируются.
- 403: сверяйте Origin/порт. Не ослабляйте Origin для исправления клиента.
- 429/503: соблюдайте Retry-After, дождитесь освобождения bounded KDF/сервиса;
  registration ограничен 5/час/IP. Не выключайте limiter для пользовательского потока.
- Waiting/0 dispatch: проверьте другую eligible tenant-пару, оба согласия, quota,
  due time, quarantine/suppression и завершённый свежий poll.
- Unknown submission: не повторяйте отправку вслепую; quota остаётся занятой.
- Share blocked: сравните source/ref/metric/direction/окна; latest ≤7 дней,
  baseline ≤28 дней, без будущих дат, нужен положительный результат.
- Public report 404: токен отозван/не найден. На мобильном таблица имеет собственный
  подписанный keyboard-scroll регион; вся страница не должна горизонтально скроллиться.

Локальные проверки требуют Node 22 и `npm ci`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

PG-тесты требуют отдельной disposable БД и runtime-конфигурации, **не рабочей БД**.
Воспроизводимые команды и secret-safe fixtures закреплены в feature telemetry.
`npm run test:integration` не создаёт БД самостоятельно. Реальные E2E используют
общий Docker Playwright 1.63.0 и source/build preflight, не подменённые бизнес-API.
