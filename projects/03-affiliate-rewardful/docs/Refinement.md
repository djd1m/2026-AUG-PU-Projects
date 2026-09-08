# Refinement — границы отказа

Неверный actor, чужой tenant, известный чужой artifact id, отозванный grant и неизвестная action приводят к отказу до выдачи данных. SQL параметризован, UI экранирует строки, тело ограничено64KiB. Permission check повторяется до cached idempotency response: replay не продлевает отозванное разрешение.

Payment replay после refund не восстанавливает комиссию. Refund-before-payment хранится pending, partial refunds рассчитываются накопительно с integer округлением. Refund после sent сохраняет факт перевода и добавляет exception; неподтверждённый event не занимает confirmed inbox key. Registry approval и source invalidation сериализуются в одной tenant transaction; старый экспорт запрещён, но фактически сделанный перевод записывается reconciliation командой.

Credit unknown удерживает reservation. Retry не создаёт второй расход, failed освобождает один раз, success применяет один раз. Cancel T1 не отменяет внешние действия и не принимает поздний результат в T2. Owner продолжает сохранённый artifact после revoke собственными правами.

Работа с недоступной БД завершается typed unavailable без частичных commits; pg client освобождается finally, lock/statement/connection waits ограничены. Проверки реальной конкурентности, restart persistence, mutation и browser journeys обязательны. Случайный пароль и закрытая DB-сеть обязательны также на тестовых стендах; не использовать host DB ports для удобства теста.

Неизмеренные source UI и production integrations отражены в source-product-profile и discovery. Не заменять отсутствие доказательства зелёным статусом. Полный набор AC и исключений — [runtime contract](runtime-contract.md) и [BDD catalogue](test-scenarios.md).
