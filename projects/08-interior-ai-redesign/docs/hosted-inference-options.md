# N8: hosted inference — исследованные варианты

Дата: 2026-10-03. Статус: предложение по вопросу владельца, архитектура ещё не изменена; платных вызовов и покупок не было. Исходный локальный software acceptance остаётся5ae383dd.

## Почему локальный GPU не обязателен

Первоначальный промпт явно выбрал self-hosted SD+ControlNet-depth GPU-worker. Продуктовое требование — реальная генерация с сохранением геометрии и измеренной задержкой — можно проверять и на удалённом inference API. GPU тогда находится у провайдера. Это требует явного нового adapter/ADR и обновления GPU-specific AC; нельзя выдать API за выполненную локальную CUDA-приёмку. Не менять финансовую очередь, fencing, credit/refund/hold и требования к приватным результатам.

## Официальные источники, проверенные сегодня

| Кандидат | Подтверждено | Пока не подтверждено для N8 |
|---|---|---|
| Replicate jagilley/controlnet-depth2img | API обработки изображения с depth conditioning; страница даёт приблизительно$0.012/run, типично9s; pay-as-you-go | Реальная геометрия комнат, warm/end-to-end latency, фактический счёт, version/model/license suitability |
| fal SDXL ControlNet Union image-to-image | API image_url/depth_image_url/depth_preprocess/strength, очередь/status/result; API оплата по использованию | N8 качество/задержка/цена конкретногоendpoint; переходSD1.5→SDXL — отдельное решение |
| ModelsLab | Публичные месячныеAPIпланы Basic$21/3250calls, Standard$47/10000calls, OpenSourceUnlimited$149 с ограничением наhostedopenmodels; опубликован разделControlNet | Точный действующийDepthendpoint и его billingunit/schema/качество в N8: retrievedControlNetpage содержит толькоnavigation, не полныйcontract |

- Replicate model: https://replicate.com/jagilley/controlnet-depth2img
- Replicate billing: https://replicate.com/pricing
- fal image-to-image API: https://fal.ai/models/fal-ai/sdxl-controlnet-union/image-to-image/api
- fal API billing/retention: https://fal.ai/docs/documentation/model-apis/faq
- ModelsLab plans: https://modelslab.com/pricing
- ModelsLab ControlNet documentation index: https://docs.modelslab.com/image-generation/controlnet/overview

Старый fal sd15-depth-controlnet отмечен deprecated и не рекомендуется: https://fal.ai/models/fal-ai/sd15-depth-controlnet/api . Значение$0 в анонимномplayground не принято как подтверждённая бесплатная цена.

## Рекомендация и следующий этап

Первым проверить Replicate Depth2Img: publisheddepth API ближе текущему SD+ControlNet намерению; оплата по использованию позволяет сравнить результаты до месячного обязательства. Это предварительный выбор по API-контракту, не benchmark победитель. Для обязательной месячнойподписки ModelsLab — кандидат, contract надо сначала подтвердить. fal SDXL — альтернативныйкандидат.

Предлагаемая схема: существующие web/API/PostgreSQL/private storage → серверный inference adapter → hosted provider → скачивание результатов в private storage → исходная quality review. Код APIключей только server/ignored env; чужой output URL не становится автоматически публичной галереей. Нужны версиямодели/request ID/input/output/config hashes и реальные измерения; точный CUDA hardware провайдера может быть недоступен и должен быть unknown, не выдуман.

До adoption: bounded plan, adapter with mocked transport and meaningful error/idempotency/fencing tests, затем разрешённый реальный сравнительный запуск на12roomphotos×3styles и≥30warmjobs. Quality и скорость оцениваются на реальных outputs, рекламные9s не являются нашимSLA. Проверить provider retention/privacy и необходимость signeduploadURLs, costcaps, повторныезапросы. Покупка и реальныевызовы требуют отдельно разрешённого внешнего расхода; текущийspendceiling0 сохранён.

## Учёт анализа

Профиль: узкий docs-only comparison, не featureimplementation. Исполнитель: root, фактическая модельgpt-6.1-sol medium по hostturn_context ранее; usage/cost/duration этойподзадачи не измерены. Проверки: официальные страницы/APIсхемы прочитаны, одинMarkdownfile добавлен; продуктовые тесты не нужны, код не менялся. Это новая запись исследования, историческиеreceipts не переписываются.
