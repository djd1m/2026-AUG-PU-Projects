# Cross-check итогового telemetry-отчёта

- Момент чтения: `2026-09-10T13:01:06Z`
- Проверено: `report.md` (`sha256 fb0fbdcf551070cd06c9a1408bf47071d425a6c9d0d21e817ff7b097970b526e`) и `n3-batch-usage-check.json` (`sha256 d565917350aa8281db01e46889c5d020ccad981c9267aa7d258bed9e5a226c2a`).
- Режим: read-only; requested reviewer `gpt-5.6-sol/high`, фактическая модель по host metadata недоступна.

## Must fix

1. **Причинная формулировка шире доказательств** — `report.md:177-178` утверждает, что для всех перечисленных случаев причиной подтверждены неверные предпосылки окружения или ожидания теста. Это противоречит `:164-166`, где mobile overflow прямо отделён как продуктовый дефект, и слишком широко покрывает остальные исправления. Сузить до конкретных повторов harness/environment и явно оставить product findings отдельными: например, «для повторов стенда и ложных ожиданий причина подтверждена; mobile overflow и иные продуктовые находки сюда не относятся».

2. **Формулировка actual-моделей неверно обобщает восемь экспортов** — `report.md:242-245` говорит: «В экспортах A/B/C заявлены Sol high, D — Astra high». Но `a-ui-provider-usage.json` имеет `actual_models:null`/`actual_efforts:null`; `d-ui-provider-usage.json` заявляет Astra/high, а отдельный относящийся к D `demo-guides-provider-usage.json` — Sol/medium. `core-provider-usage.json` тоже не содержит actual. Исправить на точную атрибуцию: сводный `final-batch.json` заявляет A/B/C=Sol/high и D=Аstra/high, тогда как индивидуальные exports подтверждают поля лишь для B, C, D-UI и demo-guides; A/core остаются неизвестными, а закрытые host logs в анализе не перечитаны. Не называть claimed values подтверждёнными actual.

## Проверено без must-fix

- `n3-batch-usage-check.json`: восемь файлов существуют, их SHA совпадают; 630 records = 630 уникальных `response_id`; межфайловых дублей нет; суммы `73,327,018 input`, `70,606,080 cached input`, `444,859 output`, `73,771,877 total`, доли `54.9419828%` и `96.2893104%` воспроизведены. Cached input трактуется как подмножество input, стоимость остаётся `null`, scope явно partial.
- Timing не сложен аддитивно: shared `684.18` мин обозначен родительским batch с паузой, A/B/C/D — пересекающимися дочерними контурами; `report.md:256-260` прямо запрещает сумму.
- Область корректна: N3 — `projects/03-affiliate-rewardful` shared+A–D; отдельный `projects/03a-affiliate-rewardful` исключён и в usage sources не попал.
- Все абсолютные GitHub source-ссылки отчёта разрешаются в commit `d491ff4…`; проверка локальных analysis-ссылок выполнена координатором. Проверка сетевой доступности GitHub не проводилась и для commit-bound точности не требовалась.

После двух правок выше иных blocker/must-fix в заданной области не найдено.

Status: completed
