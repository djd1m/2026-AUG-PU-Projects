# Точка продолжения после лимита — 2026-09-10

Работа не завершена. Оба агента остановились с сообщением среды `You've hit your
usage limit`, повтор доступен по сообщению среды 16 сентября 2026, 09:18.
Пользователь уведомлён сразу и намерен сделать reset. Предупреждения о 2% не было;
счётчик weekly limit исполнителю недоступен.

## Сохранённый кандидат

- Ветка `claude/install-npm-packages-n7l3m5`, runtime-кандидат
  `b2343b00208195b3365380146cecdd417f32c6a8`.
- P1: `projects/01-testimonials-senja`, Next BUILD_ID `T72HtODyBT3GucyLfM4Wh`.
- Полная интегрированная регрессия: 1016/1016 PASS; Next production build PASS.
- Core: 58 проверок, 3 обнаруженные мутации, тест независимой установки пакета PASS.
- Gateway: 6 проверок настоящего MCP SDK/HTTP с backend fixture, Docker image build PASS.
- Host: исправлены найденные отмены/гонки/учёт ручных покупок; финальные 28 focused PASS,
  3 мутации обнаружены. Они включены в полную регрессию выше.
- Docker web: проверен только dependency stage, не полный новый runtime image.
- Scoped p-replicator traceability, revision, scenario, completion gates PASS;
  final review contract ещё не пройден. Старые глобальные пробелы P1 не объявлены закрытыми.
- Восьмистраничный публичный browser smoke P1/P2/N3 A–D PASS на прежних развёрнутых версиях.
- Production deployments, данные пользователей и реальные PSP-аккаунты не менялись.

После runtime-кандидата добавлены документы и исключения `.secrets`/`.runtime` из
`.dockerignore`. Они не меняют собранное приложение. При следующих кодовых изменениях
нужно пересобрать кандидат и заново привязать затронутые доказательства.

## Непройденные браузерные проверки

1. **Обычный CJM:** план — A с выключенным модулем, затем A–D с включённым,
   без buyer grants/mandates и без агентных PSP credentials. Первый A-disabled
   остановился до регистрации/покупки на `assert.ok(firstCookie)`.
   Причина ещё не установлена; нельзя объявлять её дефектом только harness или продукта.
   Проверить private browsing/профиль, redirect/cookie, изолированную N3-конфигурацию.
2. **Агентный CJM:** сценарий дошёл до регистрации/обычного login; тест ожидал
   `/agent-payments`, но браузер остался в dashboard. Проверить поддержку `next`
   существующим login и явно перейти по pairing approval URL после входа, если
   таков его контракт. Не менять человеческий login ради ошибочного ожидания теста.
   Предыдущая проблема snap Firefox profile исправлена в тестовом harness.
3. Окончательное независимое ревью и AC-by-AC conformance требуют результатов
   этих прогонов. Реальный YooKassa TEST saved-method acceptance — отдельный
   неподтверждённый этап; локальные PSP/Resend fixtures его не заменяют.

## Где продолжать на этом VPS

- Root workspace:
  `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects`.
- Human orchestrator:
  `/tmp/agent-payments-implementation-7e80/run-human-cjm.py`.
  Подготовка: `cjm-preparation.md` рядом. Evidence: `human-cjm-evidence/` рядом.
  Runner использует существующие отдельные P1/N3 E2E compose-стенды и TLS Unix sockets.
- Agent harness, ещё **не интегрирован и не принят**:
  `/tmp/agent-payments-core-7e80/projects/01-testimonials-senja/tests/agent-payments-e2e/`.
  Есть README, scenario, provider/preload/runtime/browser, evidence с первой ошибкой.
  Запуск требует `AGENT_E2E_MAIN_SOURCE=<main P1>` и `AGENT_E2E_BUILD_READY=true`.
  Сценарий проверяет native Proofwall; не объявлять его единым agent→N3 browser прогоном.
- Авторские worktrees: `/tmp/agent-payments-core-7e80`, `/tmp/agent-payments-host-7e80`.
  Принятые core/host commits уже cherry-picked в main. Новые тестовые файлы core
  нельзя принять без содержательного terminal receipt и проверки исходных доказательств.
- Native agents: `payments_core` — agent UI harness; `payments_review` — human matrix
  и независимый review; `payments_host` — завершившийся автор host исправлений.
  Первые два вернули usage-limit error, не terminal success receipt.
- Полные тестовые логи: `/tmp/agent-payments-implementation-7e80/full-tests/`.
- Изолированные `proofwall-agent-payments-test` PostgreSQL/MinIO оставлены для
  продолжения; agent runtime containers и human E2E applications к остановке уже завершились.
  Не трогать чужие контейнеры или профили браузера.

## Следующие действия

После reset восстановить этот контекст, продолжить две ограниченные QE-задачи,
исправить причины падения, получить browser receipts, повторно проверить final
review contract. Обновить `05_completion.md` только по доказательствам. Сохранить
частые commits/pushes. Не развёртывать новый публичный runtime до приёмки CJM.

Телеметрия: [run.json](../../telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/run.json).
Профиль `compact-quality-first-v2`; запрошены Astra high для consequential work
и Sol high для начальной карты интеграции. Serving model IDs, usage и стоимость
недоступны. В записи сохранено время стены, оно включает ожидания/одобрения и не
равно активному времени разработки.
