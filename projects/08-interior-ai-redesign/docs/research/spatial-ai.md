# Пространственный контур N8: Scaniverse, Gemini и сохранение геометрии

**Дата наблюдения:** 2026-10-13  
**Scope:** подготовка трёх CJM для владельца жилья; без платных API-вызовов и без реализации продукта.  
**Канонический путь:** обмеры/план + Pinterest-референсы → визуализация дизайна → товары → бюджет.

## Решение в одном абзаце

Размерную основу следует принимать из **mesh**, а splat хранить рядом только как визуальный референс. Исходный mesh и введённые пользователем контрольные размеры неизменяемы; AI получает изображения, измерения и разрешённый каталог объектов, а возвращает валидируемый `scene.json` с материалами, мебелью и трансформациями. Стены, проёмы, потолок и масштаб находятся вне AI-команд. Web-рендер собирает вариант детерминированно и проверяет его против геометрического baseline. Сгенерированное изображение можно показывать как концепт, но не как доказательство размерной точности.

## Что подтверждено первичными источниками

| Область | Подтверждённый факт на дату наблюдения | Что не доказано |
|---|---|---|
| Scaniverse mesh/splat | Официальная справка различает mesh (треугольная поверхность) и Gaussian splat; mesh рекомендуется для стороннего 3D ПО и точных измерений, splat — для фотореалистичного света/отражений и фона. [Scaniverse Support](https://scaniverse.com/support) | Splat не является размерным CAD/BIM-представлением. |
| Экспорт из приложения | Справка перечисляет для mesh OBJ, FBX, USDZ, LAS; официальные release notes отдельно подтверждают GLB/FBX, OBJ, LAS и цветной PLY. Текущая карточка Android перечисляет SPZ, PLY, GLB, FBX. [Support](https://scaniverse.com/support), [release notes](https://www.nianticspatial.com/en/capture/scaniverse-release-notes), [Google Play](https://play.google.com/store/apps/details?id=com.nianticlabs.scaniverse) | Один и тот же набор форматов на каждой версии iOS/Android и для каждого режима захвата не подтверждён. Импорт должен показывать фактически выбранный тип файла. |
| Экспорт splat | Открытый формат Niantic SPZ и splat-PLY подтверждены официальным репозиторием; SPZ хранит Gaussian cloud и требует явного учёта системы координат. [nianticlabs/spz](https://github.com/nianticlabs/spz) | SPZ/PLY-splat нельзя автоматически считать mesh; обычный mesh-конвейер к нему неприменим. |
| Точность и масштаб | Производитель говорит, что mesh нужен, когда требуются precise measurements, но численного допуска для бытового Scaniverse в найденных официальных материалах нет. glTF задаёт линейные единицы в метрах. [Scaniverse Support](https://scaniverse.com/support), [glTF 2.0 §3.4](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.pdf) | Не подтверждены обещания сантиметровой/миллиметровой точности, одинаковой точности на всех телефонах и гарантированного сохранения масштаба через любую цепочку конвертации. |
| Дефекты захвата | Официальный инспектор предлагает искать пустоты, искривлённые плоскости, обрывы геометрии, швы, misalignment и разреженные области; слабое перекрытие и недостаток ракурсов названы причинами проблем. [Advanced Scan Review](https://nianticspatial.com/docs/scaniverse/advanced_tools/index.html) | Автоматическое исправление таких дефектов без повторного скана не обещано. |
| Gemini через OpenRouter | Живой `GET /api/v1/models` подтверждает мультимодальный text-output ID `google/gemini-4-argon`: image/file/audio/video/text input, text output, tools и structured outputs. [Models API](https://openrouter.ai/api/v1/models), [API reference](https://openrouter.ai/docs/api/api-reference/models/get-models) | API-каталог не доказывает способность построить метрически точную 3D-сцену. Модель не должна быть источником координат оболочки. |
| Gemini image | Тот же каталог подтверждает `google/gemini-3-pro-image`: image+text input и image+text output. | Красивый render не доказывает совпадение стен, окон, дверей или размеров. |
| Структурированный JSON | OpenRouter документирует JSON Schema и советует проверять поддержку параметра и ставить `require_parameters: true`. [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs) | Даже schema-valid JSON может быть геометрически неверным; нужна предметная валидация. |

## Scaniverse: контракт импорта

1. В мастере загрузки пользователь выбирает **«mesh для размеров»** или **«splat для вида»**; тип дополнительно определяется по содержимому, а не только по расширению.
2. Предпочтительный обменный формат mesh — GLB, если он доступен в установленной версии Scaniverse: один бинарный контейнер, web-импорт и единицы glTF в метрах. Допустимые входные fallback: FBX/OBJ/PLY mesh с явной конвертацией и проверкой масштаба. USDZ и LAS требуют отдельного адаптера; обещать их поддержку в первой поставке нельзя без тестовых файлов.
3. SPZ и splat-PLY загружаются отдельной веткой. Они могут давать фон/контекст, но не заменяют оболочку помещения.
4. Оригинал сохраняется byte-for-byte с SHA-256. Нормализованная копия получает provenance: формат, версия импортера, матрица преобразования осей, коэффициент единиц, время и контрольные точки.
5. Перед продолжением пользователь вводит минимум один, лучше несколько независимых размеров рулеткой: длину стены, ширину двери, высоту проёма. Система показывает расхождение. Допуск задаётся после испытаний на целевых устройствах; сейчас численное значение — **не найдено**.
6. Если GLB не проходит спецификацию, сцена имеет пустую/аномальную bounding box, контрольные размеры расходятся или mesh содержит критические разрывы, импорт блокируется с просьбой переснять/загрузить план.

## Роли моделей OpenRouter

Снимок каталога получен без ключа и без inference-вызовов. Цены ниже — поля каталога за токен, пересчитанные в USD за 1 млн токен; это не смета и не цена готовой сцены.

| Роль | Текущий ID | Подтверждённые метаданные | Решение |
|---|---|---|---|
| Разбор комнаты, референсов, ограничений; генерация `scene.json` и кода | `google/gemini-4-argon` | 1,048,576 context; мультимодальный вход → text; tools, `response_format`, structured outputs; каталог: $2/M input, $10/M output | Основной кандидат для ограниченного reasoning. Перед production — eval на размеченных комнатах и pin точного ID. |
| Консервативный fallback | `google/gemini-2.5-pro` | Мультимодальный вход → text; structured outputs/tools; каталог: $1.25/M input, $10/M output | Более старый стабильный ID для A/B-eval; не заявлять хуже/лучше без собственного теста. |
| Концептуальная визуализация/редактирование изображения | `google/gemini-3-pro-image` | image+text → image+text; каталог указывает `image_output`, tools и structured outputs | Только mood/render layer. Итог маркировать «концепт» и показывать рядом проверяемый 3D-view. |

`google/gemini-3.1-pro-preview` также присутствует, но preview-ID повышает риск смены поведения. Использовать его как временный эксперимент, а не долговременный контракт. Каталог даёт `google/gemini-3.1-flash-image` как более дешёвый image-кандидат, но качество/пригодность здесь не измерялись. Платных запросов не делалось; цена одного результата неизвестна без фактических token/image usage.

### Минимальный контракт `scene.json`

```json
{
  "shellRevision": "sha256:...",
  "units": "m",
  "objects": [{
    "catalogId": "...",
    "position": [0, 0, 0],
    "rotation": [0, 0, 0, 1],
    "scale": [1, 1, 1]
  }],
  "surfaceFinishes": [{"surfaceId": "wall-03", "materialId": "..."}]
}
```

Schema запрещает произвольные mesh/vertices, создание/удаление shell-узлов и неединичный scale для оболочки. `catalogId` разрешается только в проверенном каталоге с известными габаритами. Модель предлагает вариант; сервер проверяет и только затем сохраняет новую ревизию.

## Архитектура, которую реально собрать

```text
original mesh ── hash/validate/calibrate ──> immutable shell + anchors
       │                                      │
       └─ orthographic renders ─┐             ├─ collision/clearance checks
Pinterest/user references ──────┼─> Gemini ──> constrained scene.json
catalog dimensions ─────────────┘             │
optional SPZ visual reference ────────────────┴─> deterministic web render
                                                    + optional AI concept image
```

Для первой технической гипотезы подходит **Babylon.js**: официальная документация его loader перечисляет `.gltf/.glb`, OBJ, STL и `.ply/.compressed.ply/.splat/.spz`; это снижает число runtime-движков. [Babylon loaders](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md). Зафиксированная при исследовании ревизия движка: `a6b8e226d46464328197447f9fc93054c7b494fb`, Apache-2.0.

Набор вспомогательных компонентов:

| Кандидат | Лицензия / ревизия наблюдения | Пригодность | Ограничение / решение |
|---|---|---|---|
| [Babylon.js](https://github.com/BabylonJS/Babylon.js) | Apache-2.0; `a6b8e226d46464328197447f9fc93054c7b494fb` | Основной web-render/import, включая mesh и splat форматы | `adapt`; проверить конкретные Scaniverse samples и coordinate transforms. |
| [three.js](https://github.com/mrdoob/three.js) | MIT; `286e2d8cba7088982eb9068d4bb8f68e42c3bf67` | Зрелый GLB web-render, если команда уже использует three | `alternative`; SPZ потребует отдельной интеграции. |
| [PlayCanvas Engine](https://github.com/playcanvas/engine) | MIT; `7b806b16d1f7c72418930d4c7a823e376d241d01` | WebGL/WebGPU/glTF и first-class Gaussian splats; в repo есть SPZ v4 parser | `spike alternative`; не нужен параллельно Babylon без измеримой пользы. |
| [model-viewer](https://github.com/google/model-viewer) | Apache-2.0; `adc877c66f97e1498d8b19a8850976aee3d0197f` | Быстрый read-only GLB/glTF preview и AR | `reuse` для простого viewer; не полноценный редактор планировки. |
| [glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) | Apache-2.0; `602c54043ba66856b2e68c40fdf2bced975cdb8a` | Проверяет GLB/glTF 2.0, ресурсы, accessors и выдаёт JSON report | `reuse` на ingest и в CI. |
| [glTF Transform](https://github.com/donmccurdy/glTF-Transform) | MIT; `3797aad585021e68cf5fbf3f2fba37783596ffac` | Read/edit/write и inspect: bbox, vertices, primitives, materials | `reuse`; оптимизацию применять только после geometry regression. |
| [trimesh](https://github.com/mikedh/trimesh) | MIT; `dc8490c825c382d2d58b5bd87ecacc74790ead27` | Backend-анализ GLB/PLY/OBJ, bounds, connected components, nearest point | `adapt` для независимых geometry checks; объём невалиден для незамкнутых room meshes. |
| [nianticlabs/spz](https://github.com/nianticlabs/spz) | MIT; `affd0ecea7fbb4c265ee119475af7ee5b2997482` | Официальный SPZ encode/decode и явные coordinate conversions | `reuse`, только splat-ветка. |

## Проверки сохранения геометрии

### На входе

- SHA-256 оригинала, MIME/magic bytes, лимиты размера и decompression, sandboxed parsing.
- glTF Validator: ноль errors; warnings сохраняются в receipt, критические блокируют.
- Зафиксировать units/axes и одну матрицу нормализации. Для glTF: right-handed, +Y up, метры по спецификации.
- Вычислить AABB/OBB, число вершин/граней/components, surface IDs; сохранить baseline.
- Выделить/подтвердить пользователем стены, пол, потолок, окна и двери; привязать стабильные anchor IDs.
- Сравнить расстояния между контрольными anchors с рулеткой/планом. Без калибровки не показывать «точно помещается».

### На каждый вариант

- `shellRevision` обязан совпасть с baseline; shell blob и shell node transforms неизменны.
- Разрешены только смена материала существующей поверхности и добавление/перемещение каталоговых объектов.
- Повторно считать distances между anchors, размеры проёмов, AABB оболочки и transform chain; любое изменение блокирует вариант.
- Проверять коллизии мебели с оболочкой, проходы, открывание дверей и доступность; пороги являются продуктовыми требованиями и требуют отдельного нормативного исследования.
- Рендерить фиксированные контрольные камеры «до/после» и overlay контуров; visual diff — диагностический сигнал, а численная геометрия — gate.
- После GLB round-trip повторить validator и invariants. Оптимизатор не допускается в путь shell до доказанного regression test.

### Набор приёмочных образцов

Минимум: прямоугольная комната с измеренным дверным и оконным проёмом; комната с нишей/неортогональной стеной; слабый scan с дырой; зеркальная/глянцевая поверхность; mesh каждого заявленного формата; SPZ и splat-PLY как отрицательные примеры для mesh pipeline. Нужны реальные файлы с нескольких поддерживаемых устройств. Публичных гарантий точности недостаточно для численного acceptance threshold.

## Как это отражать в трёх CJM

- Шаг загрузки явно предлагает «Scaniverse mesh» или «готовый план», затем экран проверки размеров. Splat можно добавить как слой качества вида.
- До первого дизайна пользователь подтверждает контур и проёмы; неподтверждённый scan маркируется «нужна проверка размеров».
- На варианте дизайна есть переключатель исходник/3D/AI-концепт и видимый статус «геометрия сохранена» только после автоматических gates.
- Товар добавляется по `catalogId` с реальными габаритами; отсутствие размеров означает, что fit не подтверждён.
- Изменение стены/окна/двери является отдельным намерением пользователя и новой baseline-ревизией, а не побочным эффектом генерации.

## Неопределённости и следующие проверки

1. Получить реальные экспорты текущей iOS-версии Scaniverse во всех доступных режимах и составить format/device matrix; официальные страницы сейчас перечисляют форматы не полностью согласованно.
2. Измерить Scaniverse error distribution на целевых телефонах и типах помещений по физическим контрольным расстояниям. До этого нет честного общего допуска.
3. Сделать бесплатный/offline fixture-spike импорта GLB, FBX, OBJ, mesh-PLY, SPZ и splat-PLY в выбранном движке; inference для этого не нужен.
4. После согласования бюджета провести оплачиваемый eval моделей на одном фиксированном наборе, измеряя schema validity, prohibited-shell mutations, collisions и стоимость. Сейчас сравнительного benchmark нет.
5. Проверить lifecycle выбранных OpenRouter IDs непосредственно перед реализацией и хранить ID + provider + дату в каждой ревизии; preview/каталог меняются.

## Уровень уверенности

Высокий: различие mesh/splat, официально перечисленные форматы, glTF units, текущие OpenRouter IDs/модальности, возможности и лицензии open-source репозиториев. Средний: выбор Babylon.js как наименьшего контура — нужен spike на реальных exports. Низкий/не найдено: численная точность Scaniverse, время обработки «25 секунд», качество и стоимость конкретного Gemini workflow, способность любой модели создавать метрически точную 3D-геометрию.
