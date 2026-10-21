# Контракт стоимости N8 — декларация перед реализацией

**Внешние вызовы модели:** да
**Где виден расход:** http://127.0.0.1:3088/dashboard/usage
**Счёт ведётся по:** попыткам
**Потолок не сконфигурирован:** ОТКАЗ ПРИ СТАРТЕ
**Проверка пределов:** ВЫПОЛНЕНА

## Внешние вызовы

| Вызов | Кто запускает | Вход | Единица счёта | Предел на пользователя | Предел в сутки | При достижении |
|---|---|---|---|---|---|---|
| constrained-scene-proposal | посторонний | после-входа | аккаунт | 5 | 20 | ОТКАЗ |

Проверена именно декларация защитных чисел и связанная с аккаунтом единица. Runtime пока не существует и не проверен. Денежные caps job/account/global задаются отдельно положительными microUSD; live без ключа, caps, rate ceiling, output bound и provider-key hard-limit verification отказывается при startup. Default manual не вызывает провайдера. Counts — по admitted attempts, включая failed/uncertain; caps считаются атомарно PostgreSQL. Outstanding reservations всех суток остаются exposure после полуночи; ни reset, ни timeout не освобождают их без evidence. Credit и RUB не microUSD. Свой-код не создаёт дополнительный платный retry.

Перед delivery нужны actual no-egress/config/two-worker/midnight/reservation тесты и запись результатов. Exit0 checker доказывает декларацию, не расход/биллинг. Host agent usage неизвестен, не входит в этот продуктовый счёт. Live inference разрешение не получено.
