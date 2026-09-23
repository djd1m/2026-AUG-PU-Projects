# TR-003 — склейка перекрывающихся чанков

Исправление реализовано, новые стражи и локальные проверки прошли. Полная приёмка не закрыта:
134 интеграционных теста пропущены из-за отсутствующих настроек окружения; обязательное
независимое ревью Anthropic завершилось таймаутом без вердикта.

## Что изменено

- `apps/worker/src/stt/merge.ts`: удалено сравнение текста. В последующих чанках слово
  отбрасывается целиком, если его сдвинутое начало меньше конца последнего принятого слова.
  Слово с началом ровно на границе сохраняется. Сортировка и обрезка всей зоны перекрытия
  не используются; ранее принятые таймкоды остаются неизменными.
- `packages/shared/src/transcript.ts`: числовые нарушения получают `reason: bounds` либо
  `reason: order`. Для порядка добавлен `previous_start_seconds`; сохраняются индекс,
  начало, конец и проверяемая длительность. `TranscriptMergeError` включает эти данные
  в сообщение; существующий `stt_merge_failed` передаёт их в журнал. Тексты речи не логируются.
- `tests/transcription-merge.test.ts`: фикстура вызывает настоящий `chunkBoundaries(237.433, [175])`.
  Пауза сдвигает первый срез с 180 на 175 секунд; второй чанк начинается с 173.
  «замок»/«замка» моделируют разное распознавание перекрытия. Проверяются монотонность,
  удаление слова, пересекающего принятую границу, и сохранение «на», «стыке» внутри перекрытия.
- `tests/transcription-order.test.ts`: проверяется `reason: bounds` в реальном пути журналирования воркера.

До исправления новый набор: **3 failed, 1 passed** ([before.txt](../../../tests/artifacts/transcription-fix/brief-12/before.txt)).
После исправления целевые наборы: **12 passed**, exit 0 ([focused.txt](../../../tests/artifacts/transcription-fix/brief-12/focused.txt)).

## Мутации — обе строки

Все мутации применены к исходнику, затем исходник восстановлен через `finally`.
`skipped` в этих шести запусках — фильтр `-t`, а не недоступная инфраструктура.

| Страж / внедрённый дефект | Дефект возвращён | Код восстановлен |
|---|---|---|
| Разный текст / вернуть сравнение текста | [text-overlap-red.txt](../../../tests/artifacts/transcription-fix/brief-12/text-overlap-red.txt): **1 failed**, exit 1 | [text-overlap-green.txt](../../../tests/artifacts/transcription-fix/brief-12/text-overlap-green.txt): **1 passed**, exit 0 |
| Слова на стыке / отбросить первые 2 с целиком | [whole-overlap-red.txt](../../../tests/artifacts/transcription-fix/brief-12/whole-overlap-red.txt): **1 failed**, exit 1 | [whole-overlap-green.txt](../../../tests/artifacts/transcription-fix/brief-12/whole-overlap-green.txt): **1 passed**, exit 0 |
| Диагностика / передать пустой timingIssue | [empty-diagnostic-red.txt](../../../tests/artifacts/transcription-fix/brief-12/empty-diagnostic-red.txt): **2 failed**, exit 1 | [empty-diagnostic-green.txt](../../../tests/artifacts/transcription-fix/brief-12/empty-diagnostic-green.txt): **2 passed**, exit 0 |

Воспроизводимый запуск: `python3 tests/artifacts/transcription-fix/brief-12/run-mutations.py`.
Результаты с командами и SHA мутаций: [mutations.json](../../../tests/artifacts/transcription-fix/brief-12/mutations.json).

## Общие проверки

- `npm test`: **356 passed, 134 skipped / 490**, exit 0; 95,85 с Vitest.
  [Полный журнал](../../../tests/artifacts/transcription-fix/brief-12/tests.txt).
- `npm run build`, затем `npm run typecheck`, `npm run lint`: **exit 0** у всех.
  [Коды и длительности](../../../tests/artifacts/transcription-fix/brief-12/build-checks.json).
- `git diff --check`: exit 0.
- Механический ROUTE: S, exit 0; содержательный профиль риска: **M** — меняется существующее
  поведение склейки и диагностика общего валидатора. Конкурентные записи не изменены.
- OWN-002: `claude -p --model sonnet` с отключёнными инструментами, явным контекстом и лимитом
  60 с: **exit 124**, ответа и независимого вердикта нет.
  [Квитанция](../../../tests/artifacts/transcription-fix/brief-12/review-result.json).

## Привязка и ограничения

Базовая ревизия: `14e9c965922a0eff0f2e753958cbd09dc6702b6c`; исходное дерево было чистым.
Снимок четырёх изменённых файлов: `sha256:5060a0d3775238db712b617188c3dd83d2e9128e8cf5c8a58cc5dcabae1bda78` — SHA файла
[source-manifest.json](../../../tests/artifacts/transcription-fix/brief-12/source-manifest.json).
Файл владельца и платное распознавание не запускались; фикстура с паузой моделирует ответы
двух чанков. Развёртывание не выполнялось. `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT` отсутствуют;
полный интеграционный прогон и ревью Anthropic остаются обязательными до приёмки.

Профиль моделей: **compact-quality-first-v2**. Реализация — текущий **GPT-6 Codex** согласно
метаданным среды; точный model ID и effort недоступны. Для ревью запрошен `sonnet`, фактическая
модель не подтверждена; подмена ревью проверкой автора не выполнялась.
Измеренная часть работы: **277.3 с**, включая инструменты, мутации, сборку и неудачное ревью.
Начальное чтение инструкций было до первой временной отметки и в эту величину не входит;
полную длительность не восстанавливал по памяти. Usage, стоимость и active time — **null**,
соответствующих измерений нет.
Телеметрия: [run.json](../../telemetry/p-replicator/20260923T070309Z-transcription-tr003-codex/run.json),
[events.jsonl](../../telemetry/p-replicator/20260923T070309Z-transcription-tr003-codex/events.jsonl).

`failed` ниже означает незакрытые обязательные ворота приёмки, а не красные локальные тесты исправления.

Status: failed
