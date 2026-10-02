# F02a: конкретные исправления независимого ревью

Исходник `4a59fb1c`, 32 файла snapshot `4ac13c0d0b854f2cb5423bd1eede26dd595dac265524c97bcdab104a5cc2c75a`. Свежий Astra high: REQUEST_CHANGES; исходный отчёт сохранён без изменения. Docker 21:08:00–21:10:13 (132803 мс), cleanup exit0. Сборка, unit, F01 PG, Origin/owner mutation, host HTTP и maintenance exit0. Новые PG: 11 pass / 8 fail (включая родительский тест); budget mutation exit1 из-за красного baseline. Это не приёмка F02a.

1. HIGH: reset изолированной тестовой схемы обязан очищать attempt_budget, который не связан FK с account. Это воспроизведено в реальном PostgreSQL.
2. MEDIUM: supplied trustedClock разрешён исключительно при runtime=test; production, development и отсутствующий runtime отвергаются.
3. MEDIUM: model_revisions проходит проверку и сохраняется как канонический объект sd/controlnet/depth, а не исходное произвольно сериализуемое значение. Массив/неподдерживаемая форма отвергается; toJSON не может уничтожить сохранённые обязательные поля.
4. Конкретный пробел JOB-04 из ревью: отдельный случай release без reserve не должен начислить кредит; добавить проверку настоящего PG и минимальную коррекцию лишь при воспроизведённом нарушении.

Один Sol high проход ≤20 минут; файлы web/jobs.js, tests/jobs.test.js, tests/jobs.integration.test.js и документы текущей фичи. Затем свежий Astra ≤8 минут только по этим находкам. Проверки: build, unit, оба PG набора, budget mutation и относящиеся guard mutations; Docker после N6 под mutex. Отсутствие GPU не меняет этот контракт; F02b и настоящая геометрия пока pending. E2E preflight not_applicable: это коррекция внутренних контрактов, браузерный E2E будет отдельным F04.
